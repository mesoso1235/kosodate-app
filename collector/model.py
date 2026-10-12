"""データモデルと共通ヘルパー(ID・日付・絞り込み・マージ・JSON書き出し)。"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

NEWS_CAP = 300
JST = timezone(timedelta(hours=9))

KEYWORDS = [
    "子育て", "妊娠", "妊婦", "出産", "産後", "乳幼児", "乳児", "赤ちゃん", "保育", "児童",
    "子ども", "こども", "子供", "ひろば", "育児", "母子", "両親学級", "予防接種", "健診",
    "児童手当", "ネウボラ",
]


def item_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def is_childcare(*texts: str) -> bool:
    blob = " ".join(t for t in texts if t)
    return any(k in blob for k in KEYWORDS)


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s.replace("\u3000", " ")).strip()


# ---------------------------------------------------------------- 日付

def normalize_date(value) -> str | None:
    """各種の日付表記を YYYY-MM-DD にする。読めなければ None。"""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    s = str(value).strip()
    if not s:
        return None
    m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)  # ISO 8601 (タイムゾーン付きも先頭だけ使う)
    if not m:
        m = re.match(r"(\d{4})[年/.](\d{1,2})[月/.](\d{1,2})", s)
    if m:
        return _safe_iso(int(m[1]), int(m[2]), int(m[3]))
    try:  # RFC 822 (RSS pubDate) は日本時間に直す
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(JST)
        return dt.date().isoformat()
    except (TypeError, ValueError, IndexError):
        return None


def _safe_iso(y: int, m: int, d: int) -> str | None:
    try:
        return date(y, m, d).isoformat()
    except ValueError:
        return None


_FULL = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
_MD_JP = re.compile(r"(?<![\d年])(\d{1,2})\s*月\s*(\d{1,2})\s*日")
_MD_SL = re.compile(r"(?<![\d/:.])(\d{1,2})\s*[/／]\s*(\d{1,2})(?![\d/:])")
_RANGE_SEP = r"\s*(?:[～〜~\-ー–—]|から)\s*"


def _infer_year(month: int, today: date) -> int:
    # 今月より2か月より前の月は来年とみなす
    return today.year + 1 if today.month - month > 2 else today.year


def parse_event_date(text: str, today: date) -> tuple[str, str | None] | None:
    """文章中の最初の開催日を (start, end) で返す。日付が無ければ None。"""
    text = text.replace("\u3000", " ")
    cands = []
    for rx, kind in ((_FULL, "full"), (_MD_JP, "md"), (_MD_SL, "md")):
        m = rx.search(text)
        if m:
            cands.append((m.start(), m, kind))
    if not cands:
        return None
    _, m, kind = min(cands, key=lambda c: c[0])
    if kind == "full":
        y, mo, d = int(m[1]), int(m[2]), int(m[3])
    else:
        mo, d = int(m[1]), int(m[2])
        y = _infer_year(mo, today)
    start = _safe_iso(y, mo, d)
    if not start:
        return None
    end = None
    rest = text[m.end():]
    # (土) などの曜日表記を飛ばす
    rest = re.sub(r"^\s*[（(][月火水木金土日祝・]+[)）]", "", rest)
    r = re.match(_RANGE_SEP + r"(?:(\d{1,2})\s*[月/／]\s*)?(\d{1,2})\s*(?:日)?(?![\d:：時])", rest)
    if r:
        emo = int(r[1]) if r[1] else mo
        ey = y + 1 if emo < mo else y
        end = _safe_iso(ey, emo, int(r[2]))
        if end and end <= start:
            end = None
    return start, end


_TIME = re.compile(
    r"(\d{1,2})\s*[:：時]\s*(\d{2})?\s*分?\s*(?:[～〜~\-ー–—]|から)\s*(?:午[前後])?\s*(\d{1,2})\s*[:：時]\s*(\d{2})?\s*分?"
)


def parse_time_range(text: str) -> str | None:
    m = _TIME.search(text.replace("\u3000", " "))
    if not m:
        return None
    h1, m1, h2, m2 = int(m[1]), int(m[2] or 0), int(m[3]), int(m[4] or 0)
    if not (0 <= h1 < 24 and 0 <= h2 < 24 and m1 < 60 and m2 < 60):
        return None
    return f"{h1:02d}:{m1:02d}-{h2:02d}:{m2:02d}"


# ---------------------------------------------------------------- 項目の組み立て

def make_news(title: str, url: str, source_id: str, source: str, category: str, published) -> dict:
    return {
        "id": item_id(url),
        "title": clean_text(title),
        "url": url,
        "source_id": source_id,
        "source": source,
        "category": category,
        "published_at": normalize_date(published),
    }


def make_event(title: str, url: str, source: str, today: date, text: str | None = None) -> dict | None:
    """タイトル(と任意の本文)から開催日を読む。読めなければ None。"""
    title = clean_text(title)
    d = parse_event_date(title, today)
    if not d:
        return None
    start, end = d
    return {
        "id": item_id(url),
        "title": title,
        "start": start,
        "end": end,
        "time": parse_time_range(title),
        "place": "",
        "target": "",
        "url": url,
        "source": source,
    }


# ---------------------------------------------------------------- マージ

def _date_key(d: str | None) -> str:
    return d or ""


def merge_news(old: list[dict], new: list[dict], cap: int = NEWS_CAP) -> list[dict]:
    by_id: dict[str, dict] = {}
    for it in old:
        by_id[it["id"]] = it
    for it in new:
        prev = by_id.get(it["id"])
        if prev and not it.get("published_at"):
            it = {**it, "published_at": prev.get("published_at")}
        by_id[it["id"]] = it
    items = list(by_id.values())
    dated = sorted((i for i in items if i.get("published_at")), key=lambda i: i["published_at"], reverse=True)
    undated = [i for i in items if not i.get("published_at")]
    return (dated + undated)[:cap]


def merge_events(old: list[dict], new: list[dict], today: date) -> list[dict]:
    by_id = {it["id"]: it for it in old}
    by_id.update({it["id"]: it for it in new})
    floor = (today - timedelta(days=1)).isoformat()
    kept = [i for i in by_id.values() if (i.get("end") or i["start"]) >= floor]
    return sorted(kept, key=lambda i: (i["start"], i["title"]))


# ---------------------------------------------------------------- JSON

def load_json(path: Path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _strip(o, ignore: tuple[str, ...]):
    if isinstance(o, dict):
        return {k: _strip(v, ignore) for k, v in o.items() if k not in ignore}
    if isinstance(o, list):
        return [_strip(v, ignore) for v in o]
    return o


def write_json_if_changed(path: Path, payload: dict, ignore: tuple[str, ...] = ("updated_at",), force: bool = False) -> bool:
    """updated_at などを除いた中身が同じならファイルを書かない。書いたら True。"""
    path = Path(path)
    if not force and path.exists():
        old = load_json(path, None)
        if old is not None and _strip(old, ignore) == _strip(payload, ignore):
            return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return True
