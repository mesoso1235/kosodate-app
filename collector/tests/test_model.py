from datetime import date

import pytest

from collector.model import (
    is_childcare, item_id, load_json, make_event, merge_events, merge_news, normalize_date,
    parse_event_date, parse_time_range, write_json_if_changed,
)

TODAY = date(2026, 10, 13)


def test_item_id_is_sha1_prefix():
    import hashlib
    url = "https://example.com/a"
    assert item_id(url) == hashlib.sha1(url.encode()).hexdigest()[:12]
    assert len(item_id(url)) == 12 and item_id("x") != item_id("y")


@pytest.mark.parametrize("raw,exp", [
    ("2026-10-13T00:00:00+09:00", "2026-10-13"),
    ("2026年10月9日", "2026-10-09"),
    ("2026年1月5日(月)", "2026-01-05"),
    ("2026/10/9", "2026-10-09"),
    ("Fri, 02 Oct 2026 06:43:46 +0000", "2026-10-02"),
    ("Fri, 02 Oct 2026 20:00:00 +0000", "2026-10-03"),  # 日本時間では翌日
    ("Tue, 13 Oct 2026 00:58:04 +0900", "2026-10-13"),
    ("", None), (None, None), ("昨日", None), ("2026年2月30日", None),
])
def test_normalize_date(raw, exp):
    assert normalize_date(raw) == exp


@pytest.mark.parametrize("text,exp", [
    ("産前・産後のセルフケア講座（10/16池尻）", ("2026-10-16", None)),
    ("10月18日(土) 親子ヨガ", ("2026-10-18", None)),
    ("2026年11月3日 たいけん", ("2026-11-03", None)),
    ("11/3 開催", ("2026-11-03", None)),
    ("産前・産後のセルフケア講座（11/13深沢）", ("2026-11-13", None)),
    ("10月18日(土)～19日(日) お祭り", ("2026-10-18", "2026-10-19")),
    ("10/18〜10/20 まつり", ("2026-10-18", "2026-10-20")),
    ("12月28日～1月5日 冬休み", ("2026-12-28", "2027-01-05")),
    ("1月10日 新年会", ("2027-01-10", None)),      # 2か月より前の月は来年とみなす
    ("9月1日 終了", ("2026-09-01", None)),         # 2か月前以内は今年のまま
    ("10月 20日 ひろば", ("2026-10-20", None)),
    ("2026年 10月分の両親学級", None),
    ("今週末はお休みです", None),
    ("10:00～11:30 開催", None),                   # 時刻を日付と誤読しない
    ("2月30日", None),
])
def test_parse_event_date(text, exp):
    assert parse_event_date(text, TODAY) == exp


@pytest.mark.parametrize("text,exp", [
    ("10:00～11:30", "10:00-11:30"),
    ("9:30〜12:00 親子", "09:30-12:00"),
    ("10時～11時30分", "10:00-11:30"),
    ("時間未定", None),
])
def test_parse_time_range(text, exp):
    assert parse_time_range(text) == exp


def test_make_event_with_time_and_skip_without_date():
    e = make_event("10月18日(土) 10:00～11:30 親子ヨガ", "https://x/1", "テスト", TODAY)
    assert e["start"] == "2026-10-18" and e["time"] == "10:00-11:30" and e["end"] is None
    assert set(e) == {"id", "title", "start", "end", "time", "place", "target", "url", "source"}
    assert make_event("お知らせです", "https://x/2", "テスト", TODAY) is None


def test_keyword_filter():
    assert is_childcare("区の子育て支援について")
    assert is_childcare("防犯講習会", "乳幼児向けの内容")  # 本文でも判定
    assert is_childcare("こどもまつり")
    assert not is_childcare("防犯講習会を開催します", "")
    assert not is_childcare("道路工事のお知らせ")


def _n(i, d):
    return {"id": f"id{i}", "title": f"t{i}", "url": f"https://x/{i}", "source_id": "s", "source": "S",
            "category": "区", "published_at": d}


def test_merge_news_dedupe_sort_cap():
    old = [_n(1, "2026-10-01"), _n(2, "2026-10-05"), _n(3, None)]
    new = [_n(2, "2026-10-06"), _n(4, "2026-10-10"), _n(5, None)]
    m = merge_news(old, new)
    assert [i["id"] for i in m][:3] == ["id4", "id2", "id1"]
    assert {i["id"] for i in m[3:]} == {"id3", "id5"}  # 日付なしは最後
    assert next(i for i in m if i["id"] == "id2")["published_at"] == "2026-10-06"
    assert len(m) == 5
    big = [_n(i, f"2026-01-{(i % 28) + 1:02d}") for i in range(400)]
    assert len(merge_news([], big)) == 300


def test_merge_news_keeps_old_date_when_new_has_none():
    m = merge_news([_n(1, "2026-10-01")], [_n(1, None)])
    assert m[0]["published_at"] == "2026-10-01"


def _e(i, s, end=None):
    return {"id": f"e{i}", "title": f"e{i}", "start": s, "end": end, "time": None, "place": "", "target": "",
            "url": f"https://x/{i}", "source": "S"}


def test_merge_events_drops_past_sorts():
    old = [_e(1, "2026-10-11"), _e(2, "2026-10-12"), _e(3, "2026-10-01", "2026-10-14"), _e(4, "2026-10-30")]
    new = [_e(5, "2026-10-20"), _e(4, "2026-10-30")]
    m = merge_events(old, new, TODAY)
    assert [e["id"] for e in m] == ["e3", "e2", "e5", "e4"]  # e1は2日前なので除外、e2は昨日なので残る


def test_write_json_unchanged_not_rewritten(tmp_path):
    p = tmp_path / "d.json"
    assert write_json_if_changed(p, {"updated_at": "A", "items": [1]}) is True
    first = p.read_text(encoding="utf-8")
    assert write_json_if_changed(p, {"updated_at": "B", "items": [1]}) is False
    assert p.read_text(encoding="utf-8") == first  # updated_at だけの違いでは書かない
    assert write_json_if_changed(p, {"updated_at": "C", "items": [1, 2]}) is True
    assert load_json(p, None)["updated_at"] == "C"


def test_write_json_format(tmp_path):
    p = tmp_path / "d.json"
    write_json_if_changed(p, {"updated_at": "A", "items": [{"title": "日本語"}]})
    txt = p.read_text(encoding="utf-8")
    assert "日本語" in txt and "\\u" not in txt and txt.startswith('{\n "updated_at"')
