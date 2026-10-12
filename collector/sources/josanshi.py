"""東京都助産師会 世田谷目黒地区分会 ブログRSS(Crawl-Delay 5秒は http.py が守る)。"""
from collector.model import make_news
from collector.sources._util import feed_entries

SOURCE_ID = "josanshi"
NAME = "助産師会 世田谷目黒"
CATEGORY = "民間"
URL = "https://www.setagaya-josanshi.org/rss/blog"


def parse(content: bytes) -> list[dict]:
    return [make_news(e["title"], e["link"], SOURCE_ID, NAME, CATEGORY, e["date"]) for e in feed_entries(content)]


def fetch(session) -> list[dict]:
    return parse(session.get(URL).content)
