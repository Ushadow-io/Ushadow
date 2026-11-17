"""The ledger + memory story, over real HTTP, on real Mongo test databases.

    python story.py [--docker]      (from e2e/, with the ledger venv; see README.md)

Each step prints PASS or FAIL (with the reason). The run is repeated with both services
killed (SIGKILL) and started again in the middle; both runs must end in the same state.
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from day import (
    B_ERASE_LINE,
    B_SPLIT_LINE,
    DAY_RANGE,
    DAY_RECS,
    ERASED_WORD,
    LIVE_ONLY_WORD,
    REC_A,
    REC_B,
    REC_C,
    REC_LATE,
    live_then_final,
)
from harness import (
    LEDGER_DIR,
    LEDGER_PREFIX,
    MEMORY_DIR,
    MEMORY_PREFIX,
    SPLIT_MARKER,
    Container,
    Proc,
    TestDbs,
    Tokens,
    free_port,
)
from read_steps import READ_SCOPES, ReadSteps

USER = "chronicle-e2e-user"
_WORD = re.compile(r"[^0-9a-z]+")


def when(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def norm(text: str | None) -> str:
    return _WORD.sub(" ", (text or "").lower()).strip()


class StepFailed(AssertionError):
    pass


def check(cond: Any, why: str) -> None:
    if not cond:
        raise StepFailed(why)


# ---- the two services --------------------------------------------------------------------------


@dataclass
class Services:
    ledger: Any
    memory: Any
    tokens: Tokens
    extra: list[Any] = field(default_factory=list)

    def restart_both(self) -> None:
        self.ledger.kill()
        self.memory.kill()
        self.ledger.start()
        self.memory.start()

    def stop(self) -> None:
        for s in (self.memory, self.ledger, *self.extra):
            try:
                s.kill()
                if isinstance(s, Container):
                    s.remove()
            except Exception:  # noqa: BLE001 - best effort; keep stopping the others
                traceback.print_exc()


def ledger_env(mongo_uri: str, db: str, tokens: Tokens, memory_url: str) -> dict[str, str]:
    return {"LEDGER_MONGO_URI": mongo_uri, "LEDGER_DB": db, "LEDGER_TOKENS": tokens.ledger_tokens(),
            "LEDGER_TEST_FAKE_MODEL": "1", "LEDGER_TEST_FAKE_SPLIT_MARKER": SPLIT_MARKER,
            "LEDGER_SCOPES": json.dumps(READ_SCOPES), "MEMORY_URL": memory_url,
            "MEMORY_TOKEN": tokens.memory, "AUTH_SECRET_KEY": tokens.auth_secret}


def memory_env(mongo_uri: str, db: str, ledger_url: str, ledger_token: str,
               tokens: Tokens) -> dict[str, str]:
    return {"MEMORY_TOKEN": tokens.memory, "LEDGER_URL": ledger_url, "LEDGER_TOKEN": ledger_token,
            "MEMORY_STORE": "mongo", "MEMORY_MONGO_URI": mongo_uri, "MEMORY_DB": db,
            "MEMORY_ENGINE": "fake-mongo", "MEMORY_ACTION_EXTRACTOR": "fake",
            "MEMORY_ACTION_STORE": "mongo"}


def process_services(dbs: TestDbs, uri: str, logs: Path) -> tuple[Services, str, str]:
    tokens = Tokens()
    ldb, mdb = dbs.new(LEDGER_PREFIX), dbs.new(MEMORY_PREFIX)
    tag = ldb.removeprefix(LEDGER_PREFIX)[:6]  # log files per run: ledger-<tag>-<start>.log
    memory_port = free_port()
    ledger = Proc(f"ledger-{tag}", LEDGER_DIR, ["ledger.main:app", "--no-access-log"],
                  ledger_env(uri, ldb, tokens, f"http://127.0.0.1:{memory_port}"), free_port(), logs)
    memory = Proc(f"memory-{tag}", MEMORY_DIR, ["memory_service.main:app_factory", "--factory",
                                                 "--no-access-log"],
                  memory_env(uri, mdb, ledger.url, tokens.memory_to_ledger, tokens),
                  memory_port, logs)
    return Services(ledger, memory, tokens), ldb, mdb


def docker_services(dbs: TestDbs, inner_uri: str, logs: Path, net: str,
                    images: tuple[str, str]) -> tuple[Services, str, str]:
    tokens = Tokens()
    ldb, mdb = dbs.new(LEDGER_PREFIX), dbs.new(MEMORY_PREFIX)
    tag = ldb.removeprefix(LEDGER_PREFIX)
    lname, mname = f"e2e-ledger-{tag}", f"e2e-memory-{tag}"
    ledger = Container(lname, images[0], {**ledger_env(inner_uri, ldb, tokens, f"http://{mname}:8210"),
                                          "LEDGER_PORT": "8200"},
                       free_port(), 8200, [net, "infra-network"], logs)
    memory = Container(mname, images[1],
                       memory_env(inner_uri, mdb, f"http://{lname}:8200", tokens.memory_to_ledger,
                                  tokens), free_port(), 8210, [net, "infra-network"], logs)
    return Services(ledger, memory, tokens), ldb, mdb


# ---- the story ---------------------------------------------------------------------------------


@dataclass
class Story(ReadSteps):
    svc: Services
    dbs: TestDbs
    ldb: str
    mdb: str
    restart_after: str | None = None  # a step name; both services are killed and started after it
    results: list[tuple[str, bool, str]] = field(default_factory=list)
    notes: dict[str, Any] = field(default_factory=dict)
    USER = USER

    # ---- http ----
    def _l(self, method: str, path: str, token: str | None = "chronicle", **kw: Any) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self._tok(token)}"} if token else {}
        return httpx.request(method, self.svc.ledger.url + path, headers=headers, timeout=60, **kw)

    def _m(self, method: str, path: str, token: str | None = "memory", **kw: Any) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self._tok(token)}"} if token else {}
        return httpx.request(method, self.svc.memory.url + path, headers=headers, timeout=120, **kw)

    def _tok(self, which: str) -> str:
        t = self.svc.tokens
        return {"chronicle": t.chronicle, "memory": t.memory, "memory_to_ledger": t.memory_to_ledger,
                "agent": t.agent, "reader": t.reader}.get(which, which)

    def ok(self, r: httpx.Response, what: str) -> Any:
        check(r.status_code == 200, f"{what}: HTTP {r.status_code} {r.text[:300]}")
        return r.json()

    def conversations(self, include_retired: bool = True) -> list[dict]:
        params = {"userId": USER, **DAY_RANGE, "includeRetired": str(include_retired).lower()}
        return self.ok(self._l("GET", "/conversations", params=params), "GET /conversations")

    def transcripts(self, rec_id: str) -> list[dict]:
        return self.ok(self._l("GET", f"/recordings/{rec_id}/transcripts", params={"userId": USER}),
                       "GET transcripts")

    def sync(self) -> dict:
        return self.ok(self._m("POST", "/sync", json={"userId": USER}), "memory /sync")

    def facts(self) -> list[dict]:
        """Every fact memory shows (closed too): a search with every word of the day."""
        words = sorted({w for rec in [*DAY_RECS, REC_LATE] for _, t in rec.lines
                        for w in norm(t).split()} | {"lakeside"})
        params = {"userId": USER, "q": " ".join(words), "includeClosed": "true", "limit": 200}
        return self.ok(self._m("GET", "/search", params=params), "memory /search")["facts"]

    def fact_texts(self) -> list[str]:
        return sorted(f["text"] for f in self.facts())

    # ---- shared checks ----
    def final_text(self, rec_id: str, start: str, end: str) -> str:
        finals = [t for t in self.transcripts(rec_id) if t.get("status", "final") == "final"]
        check(finals, f"no final transcript for {rec_id}")
        t = max(finals, key=lambda t: (when(t["createdAt"]), t["revision"]))
        lo, hi = when(start), when(end)
        return norm(" ".join(s["text"] for s in t["segments"]
                             if when(s["start"]) < hi and lo < when(s["end"])))

    def check_proofs(self) -> int:
        """Every fact has proof; every proof quote is in the ledger's FINAL transcript there."""
        facts = self.facts()
        for f in facts:
            if f["source"] == "person":
                continue  # a human statement has no recording proof
            check(f["evidence"], f"fact {f['id']} has no evidence")
            for ev in f["evidence"]:
                text = self.final_text(ev["recordingId"], ev["range"]["start"], ev["range"]["end"])
                check(norm(ev["quote"]) and norm(ev["quote"]) in text,
                      f"quote of {f['id']} is not in the final transcript")
        return len(facts)

    def check_consistent(self) -> None:
        """No orphans: memory's done units, proofs and action facts all belong to a conversation
        revision that is active in the ledger now, and every closed active conversation is in."""
        active = {(c["conversation"]["id"], c["conversation"]["revision"]) for c in
                  self.conversations() if not c["retired"] and c["conversation"].get("closedAt")}
        docs = self.dbs.docs(self.mdb)
        done = {(u["conversation_id"], u["revision"]) for u in docs.get("work_units", [])
                if u["status"] in ("done", "skipped")}
        check(done == active, f"memory units {sorted(done - active)} vs ledger {sorted(active - done)}")
        stale = {(p["conversation_id"], p["revision"]) for p in docs.get("proofs", [])} - active
        check(not stale, f"proofs of retired/old conversations: {sorted(stale)}")
        for a in self.ok(self._m("GET", "/action-facts", params={"userId": USER}), "action-facts")["facts"]:
            conv = (a["value"].get("conversation") or {})
            if conv:
                check((conv["id"], conv["revision"]) in active, f"standing action fact of {conv}")
        self.check_proofs()

    def scan(self, word: str) -> list[str]:
        """Where `word` still is: every document of both test databases, as text."""
        hits = []
        for name in (self.ldb, self.mdb):
            for coll, docs in self.dbs.docs(name).items():
                hits += [f"{name}.{coll}" for d in docs if word.lower() in json.dumps(
                    d, default=str).lower()]
        return sorted(set(hits))

    # ---- steps ----
    def a_ingest(self) -> str:
        n = 0
        for rec in DAY_RECS:
            for post in live_then_final(rec, USER):
                body = self.ok(self._l("POST", "/ingest", json=post), "POST /ingest")
                check(body["refusals"] == [], f"refusals {body['refusals']}")
                n += 1
        for rec in DAY_RECS:
            st = {t["revision"]: t["status"] for t in self.transcripts(rec.recording_id)}
            check(st == {"live": "provisional", f"ver-{rec.cid}": "final"}, f"transcripts {st}")
        return f"{n} adapter posts (live deltas + final) accepted"

    def b_pipeline(self) -> str:
        run = self.ok(self._l("POST", "/pipeline/run", json={"userId": USER, "range": DAY_RANGE}),
                      "pipeline/run")
        convs = [c for c in self.conversations() if not c["retired"]]
        check(len(convs) >= 3, f"only {len(convs)} conversations")
        for c in convs:
            conv = c["conversation"]
            check(conv.get("closedAt"), f"{conv['id']} not closed")
            check(conv.get("title") and conv.get("summary") and conv.get("citations"),
                  f"{conv['id']} lacks title/summary/citations")
        a_parts = [c for c in convs if any(p["recordingId"] == REC_A.recording_id
                                           for p in c["conversation"]["parts"])]
        check(len(a_parts) == 2, f"topic change in {REC_A.cid}: {len(a_parts)} conversations, not 2")
        self.notes["conversations"] = len(convs)
        return f"{len(convs)} closed conversations ({run['conversations']}), {REC_A.cid} split in 2"

    def c_sync(self) -> str:
        rep = self.sync()
        check(rep["units"], "first sync ingested nothing")
        bad = [(u["conversationId"], u["status"], u.get("lastError")) for u in rep["units"]
               if u["status"] != "done"]
        check(not bad, f"units not done: {bad}")
        n = self.check_proofs()
        check(n >= 4, f"only {n} facts")
        texts = self.fact_texts()
        check(not any(LIVE_ONLY_WORD.lower() in t.lower() for t in texts), "a live-only word is a fact")
        check(not self.scan(LIVE_ONLY_WORD) or all(h.startswith(self.ldb) for h in self.scan(
            LIVE_ONLY_WORD)), f"live-only word in memory: {self.scan(LIVE_ONLY_WORD)}")
        hits = self.ok(self._m("GET", "/search", params={"userId": USER, "q": "where does Alex work"}),
                       "search")["facts"]
        check([f["text"] for f in hits if f["text"].startswith("Alex works")] == [
            "Alex works at Northwind Traders now"], f"search: {[f['text'] for f in hits]}")
        closed = self.ok(self._m("GET", "/search", params={"userId": USER, "q": "Brightwater",
                                                            "includeClosed": "true"}), "search")["facts"]
        check([f["text"] for f in closed if f.get("invalidAt")] == ["Alex works at Brightwater Labs"],
              "the older job is not a closed fact")
        self.check_consistent()
        self.notes["facts_after_first_sync"] = texts
        return f"{len(rep['units'])} units done, {n} facts, all quotes in FINAL transcripts"

    def d_second_sync(self) -> str:
        before = (self.fact_texts(), self._counts())
        rep = self.sync()
        check(rep["units"] == [] and rep["retired"] == 0, f"second sync did work: {rep}")
        check((self.fact_texts(), self._counts()) == before, "second sync changed memory")
        return "no units, no new facts, same row counts"

    def _counts(self) -> dict[str, int]:
        return {c: len(d) for c, d in self.dbs.docs(self.mdb).items() if c != "sync_cursors"}

    def e_correction(self) -> str:
        [f] = [f for f in self.facts() if f["text"] == "Sam lives in Riverton"]
        body = {"userId": USER, "factId": f["id"],
                "statement": {"subject": "Sam", "relation": "lives in", "object": "Lakeside"}}
        self.ok(self._m("POST", "/correct", json=body), "correct")
        self._check_correction()
        self.sync()
        self._check_correction()
        rb = self.ok(self._m("POST", "/rebuild", json={"userId": USER}), "rebuild")
        check(rb["unitsFailed"] == 0, f"rebuild failures {rb}")
        self._check_correction()
        self.check_consistent()
        return "correction holds after a sync and a rebuild"

    def _check_correction(self) -> None:
        facts = {f["text"]: f for f in self.facts()}
        check("Sam lives in Riverton" not in facts, "corrected fact came back")
        check(facts.get("Sam lives in Lakeside", {}).get("source") == "person",
              "human statement missing")

    def f_human_split(self) -> str:
        before = {c["conversation"]["id"]: c for c in self.conversations()}
        b_ids = {i for i, c in before.items() if not c["retired"] and any(
            p["recordingId"] == REC_B.recording_id for p in c["conversation"]["parts"])}
        split_at = REC_B.line_range(B_SPLIT_LINE)["start"]
        body = {"userId": USER, "kind": "split_at", "fromId": REC_B.recording_id, "at": split_at,
                "key": f"split:human:{REC_B.recording_id}:1", "reason": "the book club starts here"}
        self.ok(self._l("POST", "/decisions", json=body), "decisions")
        after = {c["conversation"]["id"]: c for c in self.conversations()}
        b_now = {i for i, c in after.items() if not c["retired"] and any(
            p["recordingId"] == REC_B.recording_id for p in c["conversation"]["parts"])}
        check(len(b_now) == 2, f"{REC_B.cid} now in {len(b_now)} conversations")
        changed = [i for i in b_ids if after[i]["retired"] or after[i]["conversation"]["revision"] !=
                   before[i]["conversation"]["revision"]]
        check(changed, "the split changed no conversation")
        rep = self.sync()
        check(rep["units"], "memory did not pick up the split")
        self.check_consistent()
        texts = self.fact_texts()
        check(any("Green Tea" in t for t in texts) and any(ERASED_WORD in t for t in texts),
              f"facts of the split conversation lost: {texts}")
        how = ", ".join(f"{i}: " + (f"retired, replacedBy {after[i]['replacedBy']}" if after[i]["retired"]
                                     else f"rev {after[i]['conversation']['revision']}") for i in changed)
        return f"{len(b_ids)} -> {len(b_now)} conversations ({how}); memory consistent"

    def f2_human_join(self) -> str:
        """The human cancels the model's topic split in c-e2e-a: the second part is retired
        (replacedBy the first) and memory must undo it and ingest the joined conversation."""
        a = sorted((c for c in self.conversations() if not c["retired"] and any(
            p["recordingId"] == REC_A.recording_id for p in c["conversation"]["parts"])),
            key=lambda c: c["conversation"]["range"]["start"])
        check(len(a) == 2, f"{REC_A.cid} is in {len(a)} conversations")
        first, second = (c["conversation"]["id"] for c in a)
        why = self.ok(self._l("GET", f"/conversations/{first}/why", params={"userId": USER}), "why")
        split = next((d["link"] for d in why["decisions"] if d["role"] == "closed_by" and d["link"]
                      and d["link"]["kind"] == "split_at"), None)
        check(split and split["decidedBy"] == "model", f"no model split on {first}")
        body = {"userId": USER, "kind": "continues", "fromId": split["fromId"], "toId": "no-split",
                "key": split["key"], "retracts": split["id"], "reason": "one conversation"}
        self.ok(self._l("POST", "/decisions", json=body), "decisions (continues)")
        convs = {c["conversation"]["id"]: c for c in self.conversations()}
        check(convs[second]["retired"] and convs[second]["replacedBy"] == [first],
              f"{second}: retired={convs[second]['retired']} replacedBy={convs[second].get('replacedBy')}")
        rep = self.sync()
        check(rep["retired"] == 1, f"memory retired {rep['retired']} conversations")
        self.check_consistent()
        texts = self.fact_texts()
        check("Sam lives in Riverton" not in texts and "Sam lives in Lakeside" in texts,
              "the correction did not survive the join")
        acts = [a["value"]["text"] for a in self.ok(self._m("GET", "/action-facts", params={
            "userId": USER}), "action-facts")["facts"]]
        check(any("cedar" in t for t in acts), f"action fact of the retired part not re-made: {acts}")
        return f"{second} retired, replacedBy [{first}]; memory retired 1, re-ingested, consistent"

    def g_erase(self) -> str:
        words_before = [t for t in self.fact_texts() if ERASED_WORD in t]
        check(words_before, "no fact quotes the words to erase")
        rng = REC_B.line_range(B_ERASE_LINE)
        self.ok(self._l("POST", "/erase", json={"userId": USER, "recordingId": REC_B.recording_id,
                                                "range": rng}), "erase")
        others_before = [t for t in self.fact_texts() if ERASED_WORD not in t]
        rep = self.sync()
        check(rep["erasuresApplied"] == 1, f"erasures applied: {rep['erasuresApplied']}")
        hits = self.scan(ERASED_WORD)
        check(not hits, f"erased words still in {hits}")
        texts = self.fact_texts()
        check(not any(ERASED_WORD in t for t in texts), "erased fact still shown")
        check(others_before == texts, f"other facts changed: {set(others_before) ^ set(texts)}")
        self.check_consistent()
        return f"words in no document of either DB; fact gone; {len(texts)} other facts kept"

    def h_late_evidence(self) -> str:
        c_before = [c for c in self.conversations() if not c["retired"] and any(
            p["recordingId"] == REC_C.recording_id for p in c["conversation"]["parts"])]
        check(len(c_before) == 1, "c-e2e-c is not one conversation")
        old = c_before[0]["conversation"]["id"]
        for post in live_then_final(REC_LATE, USER):
            self.ok(self._l("POST", "/ingest", json=post), "ingest late")
        self.ok(self._l("POST", "/pipeline/run", json={"userId": USER, "range": DAY_RANGE}), "run")
        convs = {c["conversation"]["id"]: c for c in self.conversations()}
        o = convs[old]
        if o["retired"]:
            check(o["replacedBy"], "retired without replacedBy")
            new = [convs[i] for i in o["replacedBy"]]
            check(all(not c["retired"] for c in new), "replacement is retired")
            how = f"{old} retired, replacedBy {o['replacedBy']}"
        else:
            how = f"{old} kept its id (rev {o['conversation']['revision']})"
        late = [c for c in convs.values() if not c["retired"] and any(
            p["recordingId"] == REC_LATE.recording_id for p in c["conversation"]["parts"])]
        check(late, "late recording is in no conversation")
        self.sync()
        self.check_consistent()
        check(any("Northwind" in t for t in self.fact_texts()), "facts of c-e2e-c lost")
        joined = any(REC_C.recording_id in {p["recordingId"] for p in c["conversation"]["parts"]}
                     for c in late)
        return f"{how}; late recording {'joined c-e2e-c' if joined else 'is its own conversation'}"

    def i_auth(self) -> str:
        for r, what in ((self._l("GET", "/conversations", token=None, params={"userId": USER}),
                         "ledger no token"),
                        (self._l("POST", "/ingest", token=None, json={}), "ledger ingest no token"),
                        (self._l("GET", "/conversations", token="wrong", params={"userId": USER}),
                         "ledger wrong token"),
                        (self._m("POST", "/sync", token=None, json={"userId": USER}), "memory no token"),
                        (self._m("GET", "/search", token="wrong", params={"userId": USER, "q": "x"}),
                         "memory wrong token")):
            check(r.status_code == 401, f"{what}: {r.status_code}")
        bad = self.svc.extra[0] if self.svc.extra else None
        check(bad is not None, "no memory with a wrong ledger token")
        bad.start()
        r = httpx.post(bad.url + "/sync", json={"userId": USER}, timeout=60,
                       headers={"Authorization": f"Bearer {self.svc.tokens.memory}"})
        body = r.text
        check(r.status_code == 502, f"wrong ledger token: memory answered {r.status_code} {body[:200]}")
        check("401" in body and "ledger" in body.lower(), f"unclear error: {body[:200]}")
        leaked = [w for w in ("Northwind", "Brightwater", "Riverton", "Green Tea", USER)
                  if w.lower() in body.lower()]
        check(not leaked, f"error leaks {leaked}")
        return f"401 without/with wrong token on both; wrong ledger token -> 502: {body[:120]}"

    def snapshot(self) -> dict[str, Any]:
        """The end state, without times and revision numbers (those depend on when things ran)."""
        convs = sorted((c["conversation"]["id"], c["retired"],
                        tuple(sorted({p["recordingId"] for p in c["conversation"].get("parts") or []})),
                        c["conversation"].get("title"), tuple(sorted(c.get("replacedBy") or [])))
                       for c in self.conversations())
        facts = sorted((f["id"], f["kind"], f["text"], f["source"], f.get("invalidAt") is None,
                        tuple(sorted(norm(e.get("quote")) for e in f["evidence"])))
                       for f in self.facts())
        units = sorted((u["conversation_id"], u["status"])
                       for u in self.dbs.docs(self.mdb).get("work_units", []))
        return {"conversations": convs, "facts": facts, "units": units}

    def run(self, steps: list[tuple[str, Callable[[], str]]]) -> None:
        for name, fn in steps:
            try:
                detail = fn()
                self.results.append((name, True, detail))
            except Exception as exc:  # noqa: BLE001 - recorded, the story goes on
                self.results.append((name, False, f"{type(exc).__name__}: {exc}"))
            print(("PASS " if self.results[-1][1] else "FAIL ") + name + " - " + self.results[-1][2],
                  flush=True)
            if name == self.restart_after:
                self.svc.restart_both()
                print(f"---- both services killed (SIGKILL) and started again after {name}", flush=True)

    def steps(self) -> list[tuple[str, Callable[[], str]]]:
        return [("a ingest: adapter live deltas + final", self.a_ingest),
                ("b pipeline/run: closed conversations", self.b_pipeline),
                ("c memory sync: facts with final proof", self.c_sync),
                ("d second sync: nothing new", self.d_second_sync),
                ("e human correction survives sync + rebuild", self.e_correction),
                ("f human split_at in the ledger", self.f_human_split),
                ("f2 human join retires a conversation", self.f2_human_join),
                ("g ledger erase reaches memory", self.g_erase),
                ("h late evidence", self.h_late_evidence),
                ("i auth", self.i_auth),
                *self.read_steps()]


def bad_token_memory(svc: Services, dbs: TestDbs, uri: str, logs: Path) -> Proc:
    mdb = dbs.new(MEMORY_PREFIX)
    return Proc(f"memory-badtoken-{mdb[-6:]}", MEMORY_DIR, ["memory_service.main:app_factory", "--factory",
                                                "--no-access-log"],
                memory_env(uri, mdb, svc.ledger.url, "not-the-ledger-token", svc.tokens),
                free_port(), logs)


def run_story(make: Callable[[], tuple[Services, str, str]], dbs: TestDbs,
              restart_after: str | None, extra: Callable[[Services], Any] | None = None) -> Story:
    svc, ldb, mdb = make()
    story = Story(svc, dbs, ldb, mdb, restart_after=restart_after)
    try:
        svc.ledger.start()
        svc.memory.start()
        if extra:
            svc.extra.append(extra(svc))
        story.run(story.steps())
        story.notes["snapshot"] = story.snapshot()
    finally:
        svc.stop()
    return story


def main(argv: list[str]) -> int:
    from runner import run_all  # noqa: PLC0415 - the CLI entry point only

    return run_all(docker="--docker" in argv, logs=Path(tempfile.mkdtemp(prefix="e2e-logs-")))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
