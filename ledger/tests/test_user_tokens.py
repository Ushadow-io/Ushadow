"""A person signed in to Ushadow: the ledger takes the Ushadow JWT (as the backend proxy sends
it) and gives that person the read API for their own data, and nothing else."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest

from ledger.main import create_app
from ledger.scopes import USER_SCOPE, Principal, owner_for
from tests.fixtures.l2_day import USER
from tests.read_api_helpers import auth, env, read_services

SECRET = "test-auth-secret-0123456789abcdef"
DAY = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}


def token(sub: str = USER, secret: str = SECRET, **over) -> dict[str, str]:
    """The claims Ushadow's `generate_jwt_for_service` writes."""
    now = datetime.now(UTC)
    claims = {"sub": sub, "email": "someone@example.test", "iss": "ushadow",
              "aud": ["ushadow", "chronicle"], "iat": now, "exp": now + timedelta(minutes=5)}
    claims.update(over)
    claims = {k: v for k, v in claims.items() if v is not None}
    return {"Authorization": f"Bearer {jwt.encode(claims, secret, algorithm='HS256')}"}


@pytest.fixture
async def http(monkeypatch):
    env(monkeypatch)
    monkeypatch.setenv("AUTH_SECRET_KEY", SECRET)
    monkeypatch.delenv("LEDGER_USER_JWT_SECRET", raising=False)
    services, _ = await read_services()
    app = create_app(db=object(), sweep=False)
    app.state.services = services
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ledger") as c:
        yield c


async def test_a_user_reads_their_own_data_with_me_or_their_id(http):
    me = await http.get("/v1/timeline", params={"userId": "me", **DAY}, headers=token())
    by_id = await http.get("/v1/timeline", params={"userId": USER, **DAY}, headers=token())
    assert me.status_code == 200 and me.json() == by_id.json()
    assert me.json()["userId"] == USER and len(me.json()["conversations"]) == 4
    found = await http.get("/v1/search", params={"userId": "me", "q": "venue"}, headers=token())
    assert found.status_code == 200 and found.json()["withheld"] == 0  # private items too


async def test_a_user_cannot_read_another_user_and_sees_nothing_as_a_stranger(http):
    stranger = token("intruder")
    other = await http.get("/v1/timeline", params={"userId": USER, **DAY}, headers=stranger)
    assert other.status_code == 403
    own = await http.get("/v1/timeline", params={"userId": "me", **DAY}, headers=stranger)
    assert own.status_code == 200 and own.json()["conversations"] == []


async def test_a_user_is_kept_off_the_internal_service_routes(http):
    for path in ("/conversations", "/recordings", "/links"):
        r = await http.get(path, params={"userId": USER}, headers=token())
        assert r.status_code == 403, path
        assert (await http.get(path, params={"userId": "me"}, headers=token())).status_code == 403


@pytest.mark.parametrize("bad", [
    {"secret": "another-secret-0123456789abcdef0"},
    {"exp": datetime.now(UTC) - timedelta(minutes=1)},
    {"iss": "chronicle"},
    {"aud": ["chronicle"]},
    {"sub": None}, {"exp": None}, {"aud": None},
])
async def test_a_token_that_is_not_a_valid_ushadow_user_token_is_401(http, bad):
    secret = bad.pop("secret", SECRET)
    headers = token(secret=secret, **bad)
    r = await http.get("/v1/timeline", params={"userId": "me", **DAY}, headers=headers)
    assert r.status_code == 401


async def test_unsigned_and_other_algorithm_tokens_are_401(http):
    claims = {"sub": USER, "iss": "ushadow", "aud": ["ushadow"],
              "exp": datetime.now(UTC) + timedelta(minutes=5)}
    none = jwt.encode(claims, None, algorithm="none")
    other = jwt.encode(claims, SECRET, algorithm="HS512")
    for t in (none, other):
        r = await http.get("/v1/timeline", params={"userId": "me", **DAY},
                           headers={"Authorization": f"Bearer {t}"})
        assert r.status_code == 401


async def test_without_the_secret_no_user_token_is_accepted(http, monkeypatch):
    monkeypatch.delenv("AUTH_SECRET_KEY")
    r = await http.get("/v1/timeline", params={"userId": "me", **DAY}, headers=token())
    assert r.status_code == 401
    ok = await http.get("/v1/timeline", params={"userId": USER, **DAY}, headers=auth("agent"))
    assert ok.status_code == 200


def test_owner_seam_for_a_user():
    user = Principal(name="user", kind="user", user_id="u1")
    assert owner_for(user, "me", USER_SCOPE) == "u1" and owner_for(user, "u1", USER_SCOPE) == "u1"
    assert owner_for(user, "u2", USER_SCOPE) is None
    assert owner_for(user, "u1") is None  # internal routes: never
    assert owner_for(Principal(name="user", kind="user"), "me", USER_SCOPE) is None
    assert owner_for(Principal(name="svc"), "me") == "me"  # a service means a user called "me"
