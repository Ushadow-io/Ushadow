"""One fact by id, and the human decisions on it: scoped to the user, silent about removed facts."""

from __future__ import annotations

import httpx

from memory_service.config import Settings
from memory_service.main import create_app
from memory_service.models import CorrectRequest, SearchFilters, Statement
from tests.helpers import T0, USER_A, USER_B, make_deps, seed

TOKEN = "test-token-123"
HDR = {"Authorization": f"Bearer {TOKEN}"}


async def _id(port, user, q, kind="knowledge"):
    [f] = await port.search(user, q, SearchFilters(kinds=[kind]))
    return f.id


async def test_fact_has_its_evidence_and_is_private_to_the_user(deps, port):
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, [("S1", "Carol lives in Paris."),
                                                           ("S0", "I will send the deck.")]))
    kid = await _id(port, USER_A, "Carol Paris")
    f = await port.fact(USER_A, kid)
    assert f.id == kid and f.text == "Carol lives in Paris" and f.evidence[0].quote
    aid = await _id(port, USER_A, "deck", "action")
    a = await port.fact(USER_A, aid)
    assert a.kind == "action" and a.evidence
    assert await port.fact(USER_B, kid) is None and await port.fact(USER_B, aid) is None
    assert await port.fact(USER_A, "mf_nothing") is None and await port.fact(USER_A, "ent_x") is None
    assert await port.fact_decisions(USER_A, kid) == []
    assert await port.fact_decisions(USER_B, kid) is None


async def test_removed_facts_are_not_found_and_their_decisions_too(deps, port):
    lines = [("S1", "Dana likes Jazz."), ("S1", "Ivan works at Hooli."), ("S0", "I will call Bob.")]
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, lines))
    jazz, hooli = await _id(port, USER_A, "Dana Jazz"), await _id(port, USER_A, "Ivan Hooli")
    call = await _id(port, USER_A, "Bob", "action")
    await port.forget(USER_A, [jazz, call])
    await port.correct(CorrectRequest(user_id=USER_A, fact_id=hooli, retract=True))
    for fid in (jazz, hooli, call):
        assert await port.fact(USER_A, fid) is None
        assert await port.fact_decisions(USER_A, fid) is None
    await port.rebuild(USER_A)
    assert await port.fact(USER_A, jazz) is None


async def test_decisions_show_the_correction_and_no_removed_words(deps, port):
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, [("S1", "Carol lives in Paris."),
                                                           ("S1", "Can you book the venue?")]))
    paris = await _id(port, USER_A, "Carol Paris")
    await port.correct(CorrectRequest(user_id=USER_A, fact_id=paris, statement=Statement(
        subject="Carol", relation="lives in", object="Lyon")))
    lyon = await _id(port, USER_A, "Carol Lyon")
    [dec] = await port.fact_decisions(USER_A, lyon)
    assert (dec.kind, dec.by, dec.fact_id) == ("correct", "person", lyon)
    assert (dec.statement.subject, dec.statement.object) == ("Carol", "Lyon")
    assert "Paris" not in dec.model_dump_json()
    fact = await port.fact(USER_A, lyon)
    assert fact.source == "person"

    venue = await _id(port, USER_A, "venue", "action")
    await port.correct(CorrectRequest(user_id=USER_A, fact_id=venue, text="Book the big venue",
                                      due="2024-01-20"))
    new = await _id(port, USER_A, "big venue", "action")
    [adec] = await port.fact_decisions(USER_A, new)
    assert (adec.kind, adec.text, adec.due) == ("correct", "Book the big venue", "2024-01-20")
    assert "book the venue" not in adec.model_dump_json().lower().replace("big ", "x")
    await port.rebuild(USER_A)
    assert [d.kind for d in await port.fact_decisions(USER_A, lyon)] == ["correct"]


async def test_routes_answer_404_for_other_users_and_removed_facts():
    deps = make_deps()
    app = create_app(Settings(memory_token=TOKEN, store="memory", engine="fake"), deps)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://memory") as http:
        conv = seed(deps, USER_A, "c1", T0, [("S1", "Carol lives in Paris."),
                                            ("S1", "Dana likes Jazz.")])
        body = {"userId": USER_A, "conversation": conv.model_dump(mode="json", exclude_none=True)}
        assert (await http.post("/ingest", headers=HDR, json=body)).status_code == 200

        async def find(q):
            r = await http.get("/search", headers=HDR, params={"userId": USER_A, "q": q})
            return r.json()["facts"][0]["id"]

        paris, jazz = await find("Carol Paris"), await find("Dana Jazz")
        r = await http.get(f"/facts/{paris}", headers=HDR, params={"userId": USER_A})
        assert r.status_code == 200 and r.json()["id"] == paris and r.json()["evidence"][0]["quote"]
        r = await http.get(f"/facts/{paris}/decisions", headers=HDR, params={"userId": USER_A})
        assert r.status_code == 200 and r.json() == {"decisions": []}
        for path in (f"/facts/{paris}", f"/facts/{paris}/decisions"):
            assert (await http.get(path, headers=HDR, params={"userId": USER_B})).status_code == 404
            assert (await http.get(path, params={"userId": USER_A})).status_code == 401
        await http.post("/forget", headers=HDR, json={"userId": USER_A, "factIds": [jazz]})
        gone = await http.get(f"/facts/{jazz}", headers=HDR, params={"userId": USER_A})
        never = await http.get("/facts/mf_zzz", headers=HDR, params={"userId": USER_A})
        assert gone.status_code == never.status_code == 404 and gone.text == never.text
        assert (await http.get(f"/facts/{jazz}/decisions", headers=HDR,
                               params={"userId": USER_A})).status_code == 404
