from collector import facilities as F


def test_find_xlsx_url_from_page(fx):
    html = fx("hoiku_page.html").decode("utf-8")
    assert F.find_xlsx_url(html) == "https://www.city.setagaya.lg.jp/documents/1577/hoikusisetuakizyoho_1.xlsx"
    assert F.find_xlsx_url("<html>no link</html>") == F.FALLBACK_XLSX
    assert F.find_xlsx_url('<a href="/documents/1577/new_name.xlsx">') == \
        "https://www.city.setagaya.lg.jp/documents/1577/new_name.xlsx"


def test_find_as_of(fx):
    assert F.find_as_of(fx("hoiku_page.html").decode("utf-8")) == "2026-10-10"


def test_parse_xlsx_types_coords_vacancy(fx):
    items, stats = F.parse_xlsx(fx("hoiku_small.xlsx"), "2026-10-10")
    by_name = {i["name"]: i for i in items}
    assert stats["no_coords"] == 1 and stats["unknown_type"] == 0
    assert {i["type"] for i in items} == {
        "授乳室", "おでかけひろば", "児童館", "認可保育園", "認証保育所", "小規模保育", "企業主導型保育", "幼稚園",
        "保育室・保育ママ"}
    for i in items:
        assert set(i) >= {"id", "name", "type", "address", "lat", "lng", "tel", "url", "source", "license"}
        assert 35.5 < i["lat"] < 35.8 and 139.4 < i["lng"] < 139.8
        assert i["source"] == "世田谷区オープンデータ" and i["license"] == "CC BY 4.0（世田谷区）"
        assert i["address"].startswith("世田谷区")
    nursery = by_name["赤堤保育園"]
    assert nursery["vacancy"]["3歳"] == "2" and nursery["vacancy"]["0歳"] == "-"
    assert nursery["vacancy_as_of"] == "2026-10-10"
    assert "vacancy" not in by_name["愛珠幼稚園"]
    # 保活ビューが「保育」で絞れるように、保育系は全て type に「保育」を含む
    for name in ("赤堤保育園", "青い空の家", "あいねっこ保育園", "左川 紀美江"):
        assert "保育" in by_name[name]["type"]


def test_parse_station_csv_uses_geocoder(fx):
    calls = []

    def geo(addr):
        calls.append(addr)
        return (35.65, 139.66) if "下馬" in addr else None

    items, skipped = F.parse_station_csv(fx("station.csv"), geo)
    assert len(calls) == 5 and skipped == 4 and len(items) == 1
    s = items[0]
    assert s["name"] == "子育てステーション世田谷" and s["type"] == "子育てステーション"
    assert s["tel"] == "03-6450-9577" and s["address"].startswith("東京都世田谷区下馬2丁目37番15号")


def test_geocoder_cache_and_variants(tmp_path):
    class R:
        def __init__(self, d):
            self.d = d

        def json(self):
            return self.d

    class Sess:
        def __init__(self):
            self.urls = []

        def get(self, url):
            self.urls.append(url)
            return R([{"geometry": {"coordinates": [139.66, 35.65]}}] if len(self.urls) >= 2 else [])

    s = Sess()
    g = F.Geocoder(s, tmp_path / "c.json")
    assert g("東京都世田谷区下馬2丁目37番15号ビル") == (35.65, 139.66)
    assert len(s.urls) == 2  # 1つめの表記で見つからず2つめで成功
    g.save()
    s2 = Sess()
    g2 = F.Geocoder(s2, tmp_path / "c.json")
    assert g2("東京都世田谷区下馬2丁目37番15号ビル") == (35.65, 139.66) and s2.urls == []  # キャッシュ命中
    assert F.Geocoder.variants("東京都世田谷区松原6丁目41番7号")[0] == "東京都世田谷区松原6-41-7"
