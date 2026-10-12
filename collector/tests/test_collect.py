from datetime import date, datetime, timedelta
from types import SimpleNamespace

from collector import collect
from collector.model import load_json, make_news

TODAY = date(2026, 10, 13)


def mod(sid, items=None, boom=None, events=None, words=None):
    def fetch(session):
        if boom:
            raise boom
        return items

    ns = SimpleNamespace(SOURCE_ID=sid, NAME=f"name-{sid}", CATEGORY="区", fetch=fetch)
    if events:
        ns.EVENTS, ns.EVENT_WORDS = events, words or []
    return ns


def n(title, url):
    return make_news(title, url, "a", "A", "区", "2026-10-10")


def test_failing_source_keeps_previous_items_and_records_error(tmp_path):
    ok = mod("a", [n("one", "https://x/1")])
    first = collect.run_news_and_events(tmp_path, None, [ok, mod("b", [n("bee", "https://x/b")])], TODAY)
    collect.write_sources(tmp_path, first, None)
    s = collect.run_news_and_events(tmp_path, None, [ok, mod("b", boom=RuntimeError("down"))], TODAY)
    collect.write_sources(tmp_path, s, None)
    titles = {i["title"] for i in load_json(tmp_path / "news.json", {})["items"]}
    assert titles == {"one", "bee"}  # b は失敗したが前回分が残る
    src = {x["id"]: x for x in load_json(tmp_path / "sources.json", {})["sources"]}
    assert src["a"]["ok"] and src["a"]["count"] == 1 and src["a"]["error"] is None
    assert not src["b"]["ok"] and "down" in src["b"]["error"]
    assert src["b"]["last_success"] is not None  # 前回成功の時刻を保持
    assert set(src["b"]) == {"id", "name", "category", "ok", "count", "last_success", "error"}


def test_first_run_failure_has_null_last_success(tmp_path):
    s = collect.run_news_and_events(tmp_path, None, [mod("z", boom=ValueError("x"))], TODAY)
    assert s[0]["last_success"] is None and s[0]["ok"] is False


def _snapshot(d):
    return {p.name: (p.read_text(encoding="utf-8"), p.stat().st_mtime_ns) for p in d.glob("*.json")}


def test_unchanged_run_does_not_rewrite_files(tmp_path):
    m = [mod("a", [n("one", "https://x/1")])]
    s = collect.run_news_and_events(tmp_path, None, m, TODAY)
    collect.write_sources(tmp_path, s, None)
    before = _snapshot(tmp_path)
    s = collect.run_news_and_events(tmp_path, None, m, TODAY)
    collect.write_sources(tmp_path, s, None)
    assert before == _snapshot(tmp_path)


def test_events_derived_from_event_sources_and_undated_stay_news(tmp_path):
    items = [n("セルフケア講座（10/16池尻）", "https://x/e1"), n("お休みのお知らせ", "https://x/e2"),
             n("11月分の申し込みを開始（申込期間 10/1～10/15）両親学級", "https://x/e3")]
    collect.run_news_and_events(tmp_path, None, [mod("ev", items, events="always")], TODAY)
    ev = load_json(tmp_path / "events.json", {})["items"]
    assert [e["start"] for e in ev] == ["2026-10-16"]
    news = {i["title"] for i in load_json(tmp_path / "news.json", {})["items"]}
    assert news == {"お休みのお知らせ", "11月分の申し込みを開始（申込期間 10/1～10/15）両親学級"}


def test_auto_events_need_event_word(tmp_path):
    items = [n("両親学級 10月20日(火) 10:00～12:00", "https://x/1"), n("展示 10月21日", "https://x/2")]
    collect.run_news_and_events(tmp_path, None, [mod("w", items, events="auto", words=["両親学級"])], TODAY)
    ev = load_json(tmp_path / "events.json", {})["items"]
    assert len(ev) == 1 and ev[0]["time"] == "10:00-12:00"
    assert len(load_json(tmp_path / "news.json", {})["items"]) == 1


def test_facilities_due_logic(tmp_path):
    assert collect.facilities_due(tmp_path, TODAY)  # ファイルなし
    five = (datetime(2026, 10, 13) - timedelta(days=5)).isoformat()
    (tmp_path / "facilities.json").write_text(f'{{"updated_at": "{five}", "items": [{{"id": "a"}}]}}', encoding="utf-8")
    assert not collect.facilities_due(tmp_path, TODAY)
    assert collect.facilities_due(tmp_path, TODAY, force=True)
    seven = (datetime(2026, 10, 13) - timedelta(days=7)).isoformat()
    (tmp_path / "facilities.json").write_text(f'{{"updated_at": "{seven}", "items": [{{"id": "a"}}]}}', encoding="utf-8")
    assert collect.facilities_due(tmp_path, TODAY)


def test_facilities_failure_keeps_previous_file(tmp_path):
    (tmp_path / "facilities.json").write_text(
        '{"updated_at": "2020-01-01T00:00:00+09:00", "items": [{"id": "a"}]}', encoding="utf-8")

    def bad(session, cache):
        raise OSError("net")

    e = collect.run_facilities(tmp_path, None, tmp_path / "c.json", TODAY, fetcher=bad)
    assert e["ok"] is False and load_json(tmp_path / "facilities.json", {})["items"] == [{"id": "a"}]


def test_facilities_skipped_when_fresh_and_sources_entry_carried(tmp_path):
    e = collect.run_facilities(tmp_path, None, tmp_path / "c.json", TODAY,
                               fetcher=lambda s, c: ([{"id": "f1"}], {}))
    assert e["ok"] and e["count"] == 1
    called = []
    again = collect.run_facilities(tmp_path, None, tmp_path / "c.json", datetime.now().date(),
                                   fetcher=lambda *a: called.append(1))
    assert again is None and not called
    collect.write_sources(tmp_path, [], e)
    collect.write_sources(tmp_path, [], None)  # スキップした日も施設の記録は消えない
    assert [s["id"] for s in load_json(tmp_path / "sources.json", {})["sources"]] == ["facilities"]
