"""世田谷区 新着情報RSS(全体)を子育てキーワードで絞り込む。"""
from collector.model import is_childcare, make_news
from collector.sources._util import feed_entries

SOURCE_ID = "setagaya"
NAME = "世田谷区"
CATEGORY = "区"
URL = "https://www.city.setagaya.lg.jp/shinchaku/shinchaku.xml"


def parse(content: bytes) -> list[dict]:
    out = []
    for e in feed_entries(content):
        if is_childcare(e["title"], e["summary"]):
            out.append(make_news(e["title"], e["link"], SOURCE_ID, NAME, CATEGORY, e["date"]))
    return out


def fetch(session) -> list[dict]:
    return parse(session.get(URL).content)
