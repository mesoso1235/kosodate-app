"""NPO法人せたがや子育てネット お知らせ(RSS)。"""
from collector.model import make_news
from collector.sources._util import feed_entries

SOURCE_ID = "kosodate-net"
NAME = "せたがや子育てネット"
CATEGORY = "民間"
URL = "https://www.setagaya-kosodate.net/feed/"


def parse(content: bytes) -> list[dict]:
    return [make_news(e["title"], e["link"], SOURCE_ID, NAME, CATEGORY, e["date"]) for e in feed_entries(content)]


def fetch(session) -> list[dict]:
    return parse(session.get(URL).content)
