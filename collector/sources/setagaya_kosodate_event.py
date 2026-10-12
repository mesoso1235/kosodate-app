"""せたがや子育てネット イベント(RSS)。開催日は題名の中にある。読めなければニュース扱い。"""
from collector.model import make_news
from collector.sources._util import feed_entries

SOURCE_ID = "kosodate-net-event"
NAME = "せたがや子育てネット イベント"
CATEGORY = "民間"
ITEM_NAME = "せたがや子育てネット"  # events/news 上の表示名
URL = "https://www.setagaya-kosodate.net/event/feed/"
EVENTS = "always"
EVENT_WORDS: list[str] = []


def parse(content: bytes) -> list[dict]:
    return [make_news(e["title"], e["link"], "kosodate-net", ITEM_NAME, CATEGORY, e["date"]) for e in feed_entries(content)]


def fetch(session) -> list[dict]:
    return parse(session.get(URL).content)
