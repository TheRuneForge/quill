from pathlib import Path
import importlib.util
import sys

ROOT = Path(__file__).resolve().parents[1]
SCRAPER = ROOT / "scraper"
sys.path.insert(0, str(SCRAPER))


def load_module():
    path = SCRAPER / "d1.py"
    spec = importlib.util.spec_from_file_location("d1_config_test", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


d1 = load_module()


class DummySession:
    def __init__(self):
        self.headers = {}


def base_env(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("D1_DATABASE_UUID", "11111111-1111-1111-1111-111111111111")


def test_d1_client_uses_cloudflare_api_token(monkeypatch):
    base_env(monkeypatch)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "cf-token")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN_W1", "old-w1-token")

    client = d1.D1Client(session=DummySession())

    assert client.token == "cf-token"
    assert client.session.headers["Authorization"] == "Bearer cf-token"


def test_old_token_names_do_not_fallback(monkeypatch):
    base_env(monkeypatch)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN_W1", "old-w1-token")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN_QUILL", "legacy-token")

    try:
        d1.D1Client(session=DummySession())
    except SystemExit as exc:
        assert "CLOUDFLARE_API_TOKEN" in str(exc)
        assert "_W1" not in str(exc)
    else:
        raise AssertionError("old token names must not be accepted")


def test_d1_client_builds_url_from_validated_identifiers(monkeypatch):
    base_env(monkeypatch)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "cf-token")

    client = d1.D1Client(session=DummySession())

    assert client.url == (
        "https://api.cloudflare.com/client/v4/accounts/"
        + "a" * 32
        + "/d1/database/11111111-1111-1111-1111-111111111111/query"
    )


def test_d1_client_rejects_path_and_url_delimiters_in_identifiers(monkeypatch):
    import pytest

    base_env(monkeypatch)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "cf-token")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 31 + "/evil")
    with pytest.raises(ValueError, match="CLOUDFLARE_ACCOUNT_ID"):
        d1.D1Client(session=DummySession())

    base_env(monkeypatch)
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "cf-token")
    monkeypatch.setenv("D1_DATABASE_UUID", "11111111-1111-1111-1111-111111111111?x=1")
    with pytest.raises(ValueError, match="D1_DATABASE_UUID"):
        d1.D1Client(session=DummySession())
