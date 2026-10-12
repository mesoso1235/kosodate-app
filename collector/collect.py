"""毎日の自動収集。リポジトリのルートで `python -m collector.collect` を実行する。"""
from __future__ import annotations

import logging
import os
import sys
from datetime import date, datetime
from pathlib import Path

from collector import facilities
from collector.http import make_session
from collector.model import (
    JST, load_json, make_event, merge_events, merge_news, write_json_if_changed,
)
from collector.sources import ALL

log = logging.getLogger("collector")
ROOT = Path(__file__).resolve().parent.parent
FACILITY_MAX_AGE_DAYS = 6
NOT_EVENT_WORDS = ("申込", "申し込み", "募集を開始")  # 「申込期間 10/1～10/15」を開催日と誤読しない


def now_iso() -> str:
    return datetime.now(JST).replace(microsecond=0).isoformat()


def derive_events(module, items: list[dict], today: date) -> tuple[list[dict], list[dict]]:
    """収集元の項目を (events, news) に振り分ける。日付が読めないものはニュースのまま残す。"""
    mode = getattr(module, "EVENTS", None)
    if not mode:
        return [], items
    words = getattr(module, "EVENT_WORDS", [])
    events, rest = [], []
    for it in items:
        looks = mode == "always" or any(w in it["title"] for w in words)
        ev = None
        if looks and not any(w in it["title"] for w in NOT_EVENT_WORDS):
            ev = make_event(it["title"], it["url"], it["source"], today)
        if ev:
            events.append(ev)
        else:
            rest.append(it)
    return events, rest


def run_news_and_events(data_dir: Path, session, modules=ALL, today: date | None = None) -> list[dict]:
    """news.json / events.json を更新し、収集元ごとの結果(sources.json 用)を返す。"""
    today = today or datetime.now(JST).date()
    old_news = load_json(data_dir / "news.json", {}).get("items", [])
    old_events = load_json(data_dir / "events.json", {}).get("items", [])
    old_sources = {s["id"]: s for s in load_json(data_dir / "sources.json", {}).get("sources", [])}

    new_news, new_events, status = [], [], []
    for m in modules:
        prev = old_sources.get(m.SOURCE_ID, {})
        entry = {"id": m.SOURCE_ID, "name": m.NAME, "category": m.CATEGORY, "ok": True, "count": 0,
                 "last_success": prev.get("last_success"), "error": None}
        try:
            items = m.fetch(session)
            ev, news = derive_events(m, items, today)
            new_news += news
            new_events += ev
            entry.update(count=len(items), last_success=now_iso())
        except Exception as e:  # 1つ失敗しても他は続ける。前回データはマージで残る
            log.warning("source %s failed: %r", m.SOURCE_ID, e)
            entry.update(ok=False, count=prev.get("count", 0), error=f"{type(e).__name__}: {e}"[:300])
        status.append(entry)

    stamp = now_iso()
    write_json_if_changed(data_dir / "news.json", {"updated_at": stamp, "items": merge_news(old_news, new_news)})
    write_json_if_changed(data_dir / "events.json",
                          {"updated_at": stamp, "items": merge_events(old_events, new_events, today)})
    return status


def facilities_due(data_dir: Path, today: date, force: bool = False) -> bool:
    if force:
        return True
    old = load_json(data_dir / "facilities.json", {})
    if not old.get("items") or not old.get("updated_at"):
        return True
    try:
        age = (today - datetime.fromisoformat(old["updated_at"]).date()).days
    except ValueError:
        return True
    return age > FACILITY_MAX_AGE_DAYS


def run_facilities(data_dir: Path, session, cache_path: Path, today: date, force: bool = False,
                   fetcher=facilities.fetch) -> dict | None:
    """週1回だけ実行。実行したら sources.json 用の項目を返す(スキップなら None)。"""
    if not facilities_due(data_dir, today, force):
        return None
    prev = {s["id"]: s for s in load_json(data_dir / "sources.json", {}).get("sources", [])}.get(
        facilities.SOURCE_ID, {})
    entry = {"id": facilities.SOURCE_ID, "name": facilities.NAME, "category": facilities.CATEGORY, "ok": True,
             "count": 0, "last_success": prev.get("last_success"), "error": None}
    try:
        items, stats = fetcher(session, cache_path)
        if not items:
            raise RuntimeError("施設が0件でした")
        log.info("facilities: %d items %s", len(items), stats)
        # 実行した週は、中身が同じでも updated_at を更新して書く(次の「6日以上経過」判定の基準になる)
        write_json_if_changed(data_dir / "facilities.json", {"updated_at": now_iso(), "items": items}, force=True)
        entry.update(count=len(items), last_success=now_iso())
    except Exception as e:  # 失敗したら前回の facilities.json をそのまま残す
        log.warning("facilities failed: %r", e)
        entry.update(ok=False, count=prev.get("count", 0), error=f"{type(e).__name__}: {e}"[:300])
    return entry


def write_sources(data_dir: Path, status: list[dict], facilities_entry: dict | None) -> bool:
    old = load_json(data_dir / "sources.json", {}).get("sources", [])
    if facilities_entry is None:  # 今回は施設を取らなかった → 前回の記録を引き継ぐ
        facilities_entry = next((s for s in old if s["id"] == facilities.SOURCE_ID), None)
    entries = status + ([facilities_entry] if facilities_entry else [])
    # last_success は成功のたびに変わるので比較から外す(ok・件数・エラーが変わった時だけ書き直す)
    return write_json_if_changed(data_dir / "sources.json", {"updated_at": now_iso(), "sources": entries},
                                 ignore=("updated_at", "last_success"))


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    data_dir = ROOT / "data"
    session = make_session()
    today = datetime.now(JST).date()
    status = run_news_and_events(data_dir, session, today=today)
    fe = run_facilities(data_dir, session, Path(__file__).parent / "geocode_cache.json", today,
                        force=os.environ.get("FORCE_FACILITIES") == "1")
    write_sources(data_dir, status, fe)
    for s in status + ([fe] if fe else []):
        print(f"{'OK' if s['ok'] else 'NG'} {s['id']:<20} {s['count']:>4}  {s['error'] or ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
