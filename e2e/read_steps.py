"""Read API (L6) steps of the story: /v1 routes and the MCP tool, on the real ledger + memory.

Mixed into `story.Story` (uses its `_l`, `_m`, `ok`, `facts`, `final_text`, `dbs`, `svc`).
Principals (ledger env, harness.Tokens): `agent` (every kind and sensitivity, may write) and
`reader` (every kind, `normal` only, read-only). The service principal `chronicle` has no
scope entry, so the read API refuses it.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx
import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from day import B_ERASE_LINE, DAY_RANGE, REC_B

READ_SCOPES = {"principals": {
    "agent": {"kinds": ["*"], "sensitivity": ["*"], "write": True},
    "reader": {"kinds": ["conversation", "knowledge", "action"], "sensitivity": ["normal"]},
}}
PRIVATE_TEXT = "fence posts"  # the action fact this story marks private
GREEN_TEA = "Kim prefers Green Tea"  # the knowledge fact corrected through /v1/correct


_WORD = re.compile(r"[^0-9a-z]+")


def _check(cond: Any, why: str) -> None:
    if not cond:
        raise AssertionError(why)


def _norm(text: str | None) -> str:
    return _WORD.sub(" ", (text or "").lower()).strip()


class ReadSteps:
    USER: str

    def _v1(self, path: str, who: str = "agent", **params: Any) -> httpx.Response:
        return self._l("GET", f"/v1/{path}", token=who, params={"userId": self.USER, **params})

    def _v1_post(self, path: str, body: dict, who: str = "agent") -> httpx.Response:
        return self._l("POST", f"/v1/{path}", token=who, json={"userId": self.USER, **body})

    def k_timeline_gap(self) -> str:
        body = self.ok(self._v1("timeline", **DAY_RANGE), "v1 timeline")
        starts = [c["at"] for c in body["conversations"]]
        _check(starts == sorted(starts) and starts, "timeline not in order")
        erased = REC_B.line_range(B_ERASE_LINE)
        gaps = [g for g in body["gaps"] if g["recordingId"] == REC_B.recording_id]
        _check([g["cause"] for g in gaps] == ["excluded"], f"erase gap: {body['gaps']}")
        _check(gaps[0]["range"]["start"][:19] == erased["start"][:19], "gap range is not the erase")
        _check(self._v1("timeline", "chronicle", **DAY_RANGE).status_code == 403,
               "a service principal with no scope used the read API")
        return f"{len(starts)} conversations in order; erase gap cause=excluded"

    def k2_search_proof(self) -> str:
        body = self.ok(self._v1("search", q="Alex works Northwind"), "v1 search")
        facts = [i for i in body["items"] if i["kind"] == "knowledge" and i["source"] != "person"]
        _check(facts, f"no fact: {[i['text'] for i in body['items']]}")
        for f in facts:
            for ev in f["evidence"]:
                text = self.final_text(ev["recordingId"], ev["range"]["start"], ev["range"]["end"])
                _check(ev["quote"] and _norm(ev["quote"]) in text, "quote not in final transcript")
        _check(any(i["kind"] == "conversation" for i in body["items"]), "no conversation matched")
        return f"{len(facts)} facts, quotes in the FINAL transcript; conversations merged"

    def k2b_why_fact_quote(self) -> str:
        body = self.ok(self._v1("search", q="Alex works Northwind"), "v1 search")
        fact = next(i for i in body["items"] if i["kind"] == "knowledge" and i["source"] != "person")
        why = self.ok(self._v1("why", factId=fact["id"]), "v1 why fact")
        _check(not why["partial"] and why["item"]["id"] == fact["id"], f"why partial: {why}")
        _check(why["item"]["evidence"], "why fact: no evidence")
        for ev in why["item"]["evidence"]:
            text = self.final_text(ev["recordingId"], ev["range"]["start"], ev["range"]["end"])
            _check(ev["quote"] and _norm(ev["quote"]) in text, "why quote not in final transcript")
        _check(why["conversations"], "why fact: no source conversation")
        formed = [st for st in why["steps"] if st["conversationId"]]
        _check(formed and all(st["decidedBy"] in ("rule", "model", "human") for st in formed),
               f"conversation steps: {why['steps']}")
        _check(not [st for st in why["steps"] if st["role"] == "corrected"], "decision before any")
        return (f"why(fact): quote in the FINAL transcript, {len(why['conversations'])} "
                f"conversation(s), {len(formed)} forming decision(s)")

    def _mark_private(self) -> str:
        """Memory's fake extractor never sets a sensitivity: mark one STANDING action fact
        `private` in THIS run's memory test database (test data only; memory code unchanged)."""
        standing = self.ok(self._m("GET", "/action-facts", params={"userId": self.USER}),
                           "action-facts")["facts"]
        [fact] = [a for a in standing if PRIVATE_TEXT in (a["value"].get("text") or "")]
        self.dbs._ours(self.mdb)  # noqa: SLF001 - the name guard of the harness
        coll = self.dbs.client[self.mdb]["action_facts"]
        done = coll.update_one({"_id": fact["id"]}, {"$set": {"value.sensitivity": "private"}})
        _check(done.modified_count == 1, "the action fact was not marked")
        return "act_" + fact["id"]

    def k3_private_withheld(self) -> str:
        fid = self._mark_private()
        full = self.ok(self._v1("search", q="fence posts Saturday"), "v1 search agent")
        _check(fid in {i["id"] for i in full["items"]}, "agent does not see the private fact")
        body = self.ok(self._v1("search", "reader", q="fence posts Saturday"), "v1 search reader")
        _check(fid not in {i["id"] for i in body["items"]}, "reader sees the private fact")
        _check(body["withheld"] >= 1, f"withheld={body['withheld']}")
        _check(PRIVATE_TEXT not in str([i["text"] for i in body["items"] if i["kind"] != "conversation"]),
               "private words in the reader's facts")
        return f"reader: private fact withheld (withheld={body['withheld']})"

    def k4_read_only(self) -> str:
        [f] = [f for f in self.facts() if f["text"].startswith(GREEN_TEA)]
        body = {"fact": {"factId": f["id"], "retract": True}}
        r = self._v1_post("correct", body, who="reader")
        _check(r.status_code == 403, f"read-only correct: {r.status_code}")
        _check(f["text"] in [x["text"] for x in self.facts()], "fact changed anyway")
        return "read-only principal: 403 on correct, fact unchanged"

    def k5_correct_survives_rebuild(self) -> str:
        [f] = [f for f in self.facts() if f["text"].startswith(GREEN_TEA)]
        self._old_fact_id = f["id"]
        body = {"fact": {"factId": f["id"], "statement": {"subject": "Kim", "relation": "prefers",
                                                         "object": "Black Coffee"}}}
        out = self.ok(self._v1_post("correct", body), "v1 correct")
        _check(out["owner"] == "memory" and [d["op"] for d in out["decisions"]] == [
            "suppress", "assert"], f"decisions {out['decisions']}")
        rb = self.ok(self._m("POST", "/rebuild", json={"userId": self.USER}), "rebuild")
        _check(rb["unitsFailed"] == 0, f"rebuild {rb}")
        texts = [i["text"] for i in self.ok(self._v1("search", q="Kim prefers"), "search")["items"]]
        _check("Kim prefers Black Coffee" in texts and f["text"] not in texts,
               f"after rebuild: {texts}")
        return "human correction via /v1/correct holds after a memory rebuild"

    def k5b_why_shows_human_decision(self) -> str:
        items = self.ok(self._v1("search", q="Kim prefers"), "search")["items"]
        [new] = [i for i in items if i["text"] == "Kim prefers Black Coffee"]
        why = self.ok(self._v1("why", factId=new["id"]), "v1 why corrected fact")
        [dec] = [st for st in why["steps"] if st["role"] == "corrected"]
        _check(dec["decidedBy"] == "human" and dec["text"] == "Kim prefers Black Coffee",
               f"decision: {dec}")
        _check(self._v1("why", factId=self._old_fact_id).status_code == 404,
               "why on the corrected-away fact is not 404")
        return "why(fact) after /v1/correct shows the human decision; the old fact is 404"

    def k6_forget_suppresses(self) -> str:
        acts = self.ok(self._v1("search", q="cedar fence panels"), "search")["items"]
        [a] = [i for i in acts if i["kind"] == "action" and "cedar" in (i["text"] or "")]
        out = self.ok(self._v1_post("forget", {"factIds": [a["id"]]}), "v1 forget")
        _check([d["op"] for d in out["decisions"]] == ["suppress"], f"forget {out['decisions']}")
        self.ok(self._m("POST", "/rebuild", json={"userId": self.USER}), "rebuild")
        again = self.ok(self._v1("search", q="cedar fence panels"), "search")["items"]
        _check(a["id"] not in {i["id"] for i in again}, "forgotten fact came back after rebuild")
        _check(self._v1("why", factId=a["id"]).status_code == 404, "why on a forgotten fact")
        return "forget wrote a suppress decision; the fact stays gone after a rebuild"

    def k7_mcp_equals_http(self) -> str:
        http_items = self.ok(self._v1("search", "reader", q="Alex works"), "search")["items"]
        result = asyncio.run(self._mcp_search("reader", "Alex works"))
        _check(not result.is_error, "MCP search failed")
        _check(result.structured_content["items"] == http_items, "MCP items differ from HTTP")
        r = httpx.post(self.svc.ledger.url + "/mcp", json={"jsonrpc": "2.0", "id": 1,
                                                            "method": "tools/list"}, timeout=30)
        _check(r.status_code == 401, f"MCP without token: {r.status_code}")
        return f"MCP search = HTTP search ({len(http_items)} items); no token -> 401"

    async def _mcp_search(self, who: str, q: str) -> Any:
        headers = {"Authorization": f"Bearer {self._tok(who)}"}
        async with httpx2.AsyncClient(headers=headers, timeout=60) as http:
            transport = streamable_http_client(self.svc.ledger.url + "/mcp", http_client=http)
            async with Client(transport) as client:
                return await client.call_tool("search", {"request": {"userId": self.USER, "q": q}})

    def k8_memory_down(self) -> str:
        self.svc.memory.kill()
        try:
            r = self._v1("search", q="Alex market launch")
            body = r.json()
            _check(r.status_code == 200 and body["partial"] is True, f"{r.status_code} {r.text[:200]}")
            _check(body["partialReasons"] == ["memory_unreachable"], f"{body['partialReasons']}")
            _check(body["items"] and {i["kind"] for i in body["items"]} == {"conversation"},
                   "ledger parts missing")
            w = self._v1_post("forget", {"factIds": ["mf_x"]})
            _check(w.status_code == 503 and w.json() == {"detail": "memory is unavailable"},
                   f"write with memory down: {w.status_code} {w.text[:200]}")
        finally:
            self.svc.memory.start()
        return "memory down: 200 partial=true with the ledger's conversations; write 503"

    def read_steps(self) -> list[tuple[str, Any]]:
        return [("k timeline shows the erase gap", self.k_timeline_gap),
                ("k2 v1 search: facts with final proof", self.k2_search_proof),
                ("k2b v1 why(fact): quote in final transcript", self.k2b_why_fact_quote),
                ("k3 scope: private fact withheld", self.k3_private_withheld),
                ("k4 read-only principal: 403 on correct", self.k4_read_only),
                ("k5 v1 correct survives a memory rebuild", self.k5_correct_survives_rebuild),
                ("k5b v1 why(fact): human decision shown", self.k5b_why_shows_human_decision),
                ("k6 v1 forget suppresses", self.k6_forget_suppresses),
                ("k7 MCP search = HTTP search", self.k7_mcp_equals_http),
                ("k8 memory down: partial", self.k8_memory_down)]
