"""収集元で共通のパーサー補助。"""
from __future__ import annotations

import feedparser
from bs4 import BeautifulSoup

from collector.model import clean_text


def decode(content: bytes) -> str:
    """UTF-8 を試し、だめなら Shift_JIS(cp932) として読む。"""
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp932", errors="replace")


def soup(content: bytes) -> BeautifulSoup:
    return BeautifulSoup(decode(content), "html.parser")


def feed_entries(content: bytes) -> list[dict]:
    """RSS/RDF を {title,link,date,summary} のリストにする。リンクの無い項目は捨てる。"""
    parsed = feedparser.parse(content)
    out = []
    for e in parsed.entries:
        link = (e.get("link") or "").strip()
        title = clean_text(e.get("title"))
        if not link or not title:
            continue
        summary = clean_text(BeautifulSoup(e.get("summary", "") or "", "html.parser").get_text(" "))
        out.append({
            "title": title,
            "link": link,
            "date": e.get("published") or e.get("updated"),
            "summary": summary,
        })
    return out
