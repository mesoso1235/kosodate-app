"""収集元の一覧。1ファイル=1収集元。順番がそのまま sources.json の順番になる。"""
from collector.sources import (
    josanshi,
    kodomo_smile,
    setagaya_kodomo,
    setagaya_kosodate_event,
    setagaya_kosodate_info,
    setagaya_rss,
    welcomebaby,
)

ALL = [
    setagaya_rss,
    setagaya_kodomo,
    welcomebaby,
    setagaya_kosodate_info,
    setagaya_kosodate_event,
    josanshi,
    kodomo_smile,
]
