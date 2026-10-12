from collector.sources import (
    ALL, josanshi, kodomo_smile, setagaya_kodomo, setagaya_kosodate_event, setagaya_kosodate_info,
    setagaya_rss, welcomebaby,
)
from collector.sources._util import decode

FIELDS = {"id", "title", "url", "source_id", "source", "category", "published_at"}


def test_every_source_exposes_interface():
    ids = set()
    for m in ALL:
        assert m.SOURCE_ID and m.NAME and m.CATEGORY in ("区", "都", "民間")
        assert callable(m.fetch)
        assert m.SOURCE_ID not in ids
        ids.add(m.SOURCE_ID)


def test_setagaya_rss_filters_and_dates(fx):
    items = setagaya_rss.parse(fx("shinchaku.xml"))
    titles = [i["title"] for i in items]
    assert len(items) == 3  # フィクスチャは子育て3件+無関係3件
    assert any("児童館" in t for t in titles)
    assert not any("防犯" in t for t in titles)
    assert all(set(i) == FIELDS and i["category"] == "区" and i["source"] == "世田谷区" for i in items)
    assert items[0]["published_at"] == "2026-10-09"
    assert items[0]["url"].startswith("https://www.city.setagaya.lg.jp/")


def test_setagaya_kodomo_html_cat002_unfiltered(fx):
    items = setagaya_kodomo.parse(fx("shinchaku.html"))
    assert len(items) == 3  # press_cate_002 だけ(他カテゴリ3件は除外)
    assert items[0]["url"] == "https://www.city.setagaya.lg.jp/02236/35524.html"  # 相対URLを絶対化
    assert items[0]["published_at"] == "2026-10-09"
    assert items[0]["source_id"] == "setagaya"
    assert "児童館" in items[2]["title"]


def test_rss_and_html_share_ids_so_they_dedupe(fx):
    a = {i["id"] for i in setagaya_rss.parse(fx("shinchaku.xml"))}
    b = {i["id"] for i in setagaya_kodomo.parse(fx("shinchaku.html"))}
    assert a == b


def test_decode_shift_jis_fallback():
    assert decode("子育て".encode("cp932")) == "子育て"
    assert decode("子育て".encode("utf-8")) == "子育て"


def test_welcomebaby(fx):
    items = welcomebaby.parse(fx("welcomebaby.xml"))
    assert len(items) == 3
    assert items[0]["title"].startswith("10月両親学級")
    assert items[0]["published_at"] == "2026-10-02"
    assert all(i["category"] == "区" for i in items)


def test_kosodate_info(fx):
    items = setagaya_kosodate_info.parse(fx("kosodate_info.xml"))
    assert len(items) == 3 and items[0]["published_at"] == "2026-10-10"
    assert all(i["category"] == "民間" for i in items)


def test_kosodate_event_feed(fx):
    items = setagaya_kosodate_event.parse(fx("kosodate_event.xml"))
    assert len(items) == 10
    assert items[1]["title"] == "産前・産後のセルフケア講座（10/16池尻）"
    assert items[1]["source"] == "せたがや子育てネット"


def test_josanshi(fx):
    items = josanshi.parse(fx("josan.xml"))
    assert [i["title"] for i in items] == ["目黒区長面会", "世田谷区長面会"]
    assert items[0]["published_at"] == "2025-11-03"
    assert items[0]["category"] == "民間"


def test_kodomo_smile(fx):
    items = kodomo_smile.parse(fx("kodomo_smile.html"))
    assert len(items) == 4
    assert items[0]["title"] == "育業促進参画企業・団体活動レポートを公開しました【日本地震再保険株式会社】"
    assert items[0]["published_at"] == "2026-10-07"
    assert items[0]["url"] == "https://kodomo-smile.metro.tokyo.lg.jp/interviews/173"
    assert all(i["category"] == "都" for i in items)
