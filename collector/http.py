"""共通のHTTPクライアント。礼儀(UA・間隔・robots.txt・再試行)をここで一括管理する。"""
from __future__ import annotations

import os
import time
import urllib.robotparser
from urllib.parse import urlsplit

import requests

TIMEOUT = 20
DEFAULT_DELAY = 1.0
# robots.txt の Crawl-Delay に従うホスト別の最小間隔(秒)
HOST_DELAY = {"www.setagaya-josanshi.org": 5.0}


class RobotsDisallowed(Exception):
    pass


def user_agent() -> str:
    repo = os.environ.get("GITHUB_REPOSITORY") or "mesoso1235/kosodate-app"
    return f"kosodate-pocket-bot/1.0 (+https://github.com/{repo}; personal non-commercial)"


class PoliteSession:
    def __init__(self, delay_scale: float = 1.0):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = user_agent()
        self.last: dict[str, float] = {}
        self.robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self.delay_scale = delay_scale  # テスト用に0にできる

    def _wait(self, host: str) -> None:
        delay = HOST_DELAY.get(host, DEFAULT_DELAY) * self.delay_scale
        prev = self.last.get(host)
        if prev is not None:
            rest = delay - (time.monotonic() - prev)
            if rest > 0:
                time.sleep(rest)
        self.last[host] = time.monotonic()

    def _raw_get(self, url: str) -> requests.Response:
        host = urlsplit(url).netloc
        err: Exception | None = None
        for attempt in range(2):  # 1回だけ再試行
            self._wait(host)
            try:
                r = self.s.get(url, timeout=TIMEOUT)
                if r.status_code >= 500 and attempt == 0:
                    err = requests.HTTPError(f"{r.status_code} {url}")
                    continue
                return r
            except requests.RequestException as e:
                err = e
        raise err  # type: ignore[misc]

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        host = parts.netloc
        if host not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self._raw_get(f"{parts.scheme}://{host}/robots.txt")
                if r.status_code == 200:
                    rp.parse(r.text.splitlines())
                    self.robots[host] = rp
                elif r.status_code in (401, 403):
                    rp.parse(["User-agent: *", "Disallow: /"])
                    self.robots[host] = rp
                else:  # 404 など = 制限なし
                    self.robots[host] = None
            except requests.RequestException:
                rp.parse(["User-agent: *", "Disallow: /"])  # 確認できないときは取りに行かない
                self.robots[host] = rp
        rp = self.robots[host]
        return True if rp is None else rp.can_fetch(user_agent(), url)

    def get(self, url: str) -> requests.Response:
        if not self.allowed(url):
            raise RobotsDisallowed(url)
        r = self._raw_get(url)
        r.raise_for_status()
        return r


def make_session() -> PoliteSession:
    return PoliteSession()
