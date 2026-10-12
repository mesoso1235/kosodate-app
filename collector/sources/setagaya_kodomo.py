"""世田谷区 新着一覧(HTML)のカテゴリ002「子ども・教育・若者支援」を絞り込みなしで取る。"""
from urllib.parse import urljoin

from collector.model import clean_text, make_news
from collector.sources._util import soup

SOURCE_ID = "setagaya-kodomo"
NAME = "世田谷区 子ども・教育(新着一覧)"
CATEGORY = "区"
ITEM_SOURCE_ID = "setagaya"  # news.json 上は「世田谷区」として表示する
ITEM_NAME = "世田谷区"
URL = "https://www.city.setagaya.lg.jp/shinchaku/index.html"


def parse(content: bytes) -> list[dict]:
    out = []
    for li in soup(content).select("li.press_list_date_cate.press_cate_002"):
        a = li.select_one(".press_list_date_item_link a")
        d = li.select_one("p.press_h3number")
        if not a or not a.get("href"):
            continue
        out.append(make_news(clean_text(a.get_text()), urljoin(URL, a["href"]), ITEM_SOURCE_ID, ITEM_NAME,
                             CATEGORY, d.get_text() if d else None))
    return out


def fetch(session) -> list[dict]:
    return parse(session.get(URL).content)
