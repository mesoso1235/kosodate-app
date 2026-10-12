import pytest
import requests

from collector import http


class Resp:
    def __init__(self, status, text=""):
        self.status_code, self.text, self.content = status, text, text.encode()

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


def session_with(responses):
    s = http.PoliteSession(delay_scale=0)
    calls = []

    def fake_get(url, timeout=None):
        calls.append(url)
        r = responses.get(url, Resp(404))
        if isinstance(r, Exception):
            raise r
        return r

    s.s.get = fake_get
    return s, calls


def test_user_agent_uses_repo_env(monkeypatch):
    monkeypatch.setenv("GITHUB_REPOSITORY", "me/kosodate-app")
    assert http.user_agent() == "kosodate-pocket-bot/1.0 (+https://github.com/me/kosodate-app; personal non-commercial)"
    monkeypatch.delenv("GITHUB_REPOSITORY")
    assert "mesoso1235/kosodate-app" in http.user_agent()


def test_robots_404_means_allowed():
    s, calls = session_with({"https://a.example/x": Resp(200, "ok")})
    assert s.get("https://a.example/x").text == "ok"
    assert calls[0] == "https://a.example/robots.txt"


def test_robots_disallow_blocks_and_caches():
    robots = Resp(200, "User-agent: *\nDisallow: /private/\n")
    s, calls = session_with({"https://a.example/robots.txt": robots, "https://a.example/ok": Resp(200, "y")})
    with pytest.raises(http.RobotsDisallowed):
        s.get("https://a.example/private/rss")
    assert s.get("https://a.example/ok").text == "y"
    assert calls.count("https://a.example/robots.txt") == 1  # ホストごとに1回だけ
    assert "https://a.example/private/rss" not in calls


def test_robots_unreachable_is_treated_as_disallowed():
    s, _ = session_with({"https://a.example/robots.txt": requests.ConnectionError("x")})
    assert s.allowed("https://a.example/x") is False


def test_retry_once_then_succeed_or_raise():
    seq = [requests.ConnectionError("1"), Resp(200, "fine")]

    def flaky(url, timeout=None):
        item = seq.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    s = http.PoliteSession(delay_scale=0)
    s.robots["a.example"] = None
    s.s.get = flaky
    assert s.get("https://a.example/x").text == "fine"

    n = []

    def always_fail(url, timeout=None):
        n.append(1)
        raise requests.ConnectionError("x")

    s2 = http.PoliteSession(delay_scale=0)
    s2.robots["a.example"] = None
    s2.s.get = always_fail
    with pytest.raises(requests.ConnectionError):
        s2.get("https://a.example/x")
    assert len(n) == 2


def test_host_delay_for_josanshi():
    assert http.HOST_DELAY["www.setagaya-josanshi.org"] == 5.0
