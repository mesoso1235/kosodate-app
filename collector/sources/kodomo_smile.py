"""東京都 こどもスマイルムーブメント お知らせ(HTML)。"""
from urllib.parse import urljoin

from collector.model import clean_text, make_news
from collector.sources._util import soup

SOURCE_ID = "kodomo-smile"
NAME = "こどもスマイルムーブメント"
CATEGORY = "都"
URL = "https://kodomo-smile.metro.tokyo.lg.jp/information"


def parse(content: bytes) -> list[dict]:
    out = []
    for li in soup(content).select("li.information-list__item"):
        a = li.select_one("a.information-list__link")
        t = li.select_one("p.information-list__title")
        d = li.select_one("p.information-list__date")
        if not a or not t or not a.get("href"):
            continue
        for i in t.select("i"):  # 外部リンクのアイコン
            i.decompose()
        out.append(make_news(clean_text(t.get_text()), urljoin(URL, a["href"]), SOURCE_ID, NAME, CATEGORY,
                             d.get_text() if d else None))
    return out


def fetch(session) -> list[dict]:
    return parse(session.get(URL).content)
