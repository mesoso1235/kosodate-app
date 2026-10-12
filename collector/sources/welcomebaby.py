"""世田谷区 両親学級ポータル(welcomebaby-setagaya.net)のRSS。子育て専門なので絞り込まない。"""
from collector.model import make_news
from collector.sources._util import feed_entries

SOURCE_ID = "welcomebaby"
NAME = "世田谷区 両親学級ポータル"
CATEGORY = "区"
URL = "https://welcomebaby-setagaya.net/feed/"
EVENTS = "auto"  # 両親学級・講座などイベントらしい題名で日付が読めれば events にも入れる
EVENT_WORDS = ["両親学級", "講座", "教室", "説明会"]


def parse(content: bytes) -> list[dict]:
    return [make_news(e["title"], e["link"], SOURCE_ID, NAME, CATEGORY, e["date"]) for e in feed_entries(content)]


def fetch(session) -> list[dict]:
    return parse(session.get(URL).content)
