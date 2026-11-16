"""Scripted probes. Each returns PASS / FAIL / UNCLEAR with evidence.

Probes that need ingest use SYNTHETIC text only (safe to print). The provenance
and rebuild checks on real data print ids and counts only.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from graphiti_core import Graphiti
from graphiti_core.edges import EntityEdge
from graphiti_core.nodes import EntityNode, EpisodeType
from graphiti_core.utils.datetime_utils import utc_now

from . import graph
from .instrument import CallLedger, current_episode

T0 = datetime(2026, 3, 2, 9, 0, tzinfo=UTC)


@dataclass
class ProbeResult:
    name: str
    status: str = "UNCLEAR"
    summary: str = ""
    evidence: list[str] = field(default_factory=list)
    data: dict[str, Any] = field(default_factory=dict)

    def show(self) -> None:
        print(f"\n[{self.status}] {self.name}: {self.summary}")
        for line in self.evidence:
            print(f"    - {line}")


def _fmt(e: dict[str, Any]) -> str:
    return (f"{e['fact']!r} ({e['name']}) valid_at={e['valid_at']} invalid_at={e['invalid_at']} "
            f"expired_at={e['expired_at']} episodes={len(e['episodes'])}"
            + (f" decided_by={e['decided_by']}" if e.get("decided_by") else ""))


async def _say(g: Graphiti, group: str, name: str, text: str, when: datetime, probe: str):
    token = current_episode.set(f"probe:{probe}")
    try:
        return await g.add_episode(name=name, episode_body=text, source_description="s1 probe",
                                   reference_time=when, source=EpisodeType.message,
                                   group_id=group)
    finally:
        current_episode.reset(token)


def _has(e: dict[str, Any], *words: str) -> bool:
    blob = f"{e['fact']} {e['source']} {e['target']}".lower()
    return all(w in blob for w in words)


def _closed(e: dict[str, Any]) -> bool:
    return bool(e["invalid_at"] or e["expired_at"])


# -- 1. supersede ------------------------------------------------------------------
async def supersede(g: Graphiti, prefix: str) -> ProbeResult:
    r = ProbeResult("supersede")
    grp = f"{prefix}-supersede"
    await _say(g, grp, "sup-1", "Alice: I work at Acme Corp as a software engineer.\n"
               "Ben: Nice, how long have you been at Acme?\nAlice: About two years now.",
               T0, "supersede")
    await _say(g, grp, "sup-2", "Alice: Big news, I left Acme Corp last week.\n"
               "Alice: I now work at Globex as a team lead.\nBen: Congratulations on Globex!",
               T0 + timedelta(days=30), "supersede")
    es = await graph.edges(g, grp)
    r.evidence = [_fmt(e) for e in es]
    acme = [e for e in es if _has(e, "alice", "acme")]
    globex = [e for e in es if _has(e, "alice", "globex")]
    r.data = {"edges": len(es), "acme_edges": len(acme), "globex_edges": len(globex)}
    if not acme or not globex:
        r.summary = "extraction did not produce both the Acme and the Globex fact"
    elif any(_closed(e) for e in acme):
        r.status = "PASS"
        r.summary = "the old Acme fact was closed (invalid_at/expired_at set)"
    else:
        r.status = "FAIL"
        r.summary = "Globex fact exists but no Acme fact was closed"
    return r


# -- 2. human fix --------------------------------------------------------------------
async def _find_node(g: Graphiti, grp: str, word: str) -> EntityNode | None:
    rows = await graph.q(g, "MATCH (n:Entity) WHERE n.group_id=$g AND toLower(n.name) "
                            "CONTAINS $w RETURN n.uuid AS uuid LIMIT 1", g=grp, w=word)
    return await EntityNode.get_by_uuid(g.driver, rows[0]["uuid"]) if rows else None


async def human_fix(g: Graphiti, prefix: str, ledger: CallLedger) -> ProbeResult:
    r = ProbeResult("human_fix")
    grp = f"{prefix}-human"
    await _say(g, grp, "hum-1", "Bob: Carol lives in Paris, in a flat near the river.\n"
               "Dan: Oh nice, I did not know Carol lived in Paris.", T0, "human_fix")
    carol = await _find_node(g, grp, "carol") or EntityNode(name="Carol", group_id=grp,
                                                             labels=["Entity"])
    lyon = EntityNode(name="Lyon", group_id=grp, labels=["Entity"])
    human = EntityEdge(group_id=grp, source_node_uuid=carol.uuid, target_node_uuid=lyon.uuid,
                       created_at=utc_now(), name="LIVES_IN", fact="Carol lives in Lyon",
                       valid_at=T0 + timedelta(days=1), episodes=[],
                       attributes={"decided_by": "human"})
    token = current_episode.set("probe:human_fix")
    try:
        res = await g.add_triplet(carol, human, lyon)
    except Exception as exc:
        r.status, r.summary = "FAIL", f"add_triplet raised {type(exc).__name__}: {exc}"
        return r
    finally:
        current_episode.reset(token)
    human_uuid = res.edges[0].uuid
    after_fix = await graph.edges(g, grp)
    r.evidence.append("after add_triplet:")
    r.evidence += ["  " + _fmt(e) for e in after_fix]
    await _say(g, grp, "hum-2", "Bob: Carol still lives in Paris, she has never moved away.\n"
               "Dan: Right, Carol loves Paris.", T0 + timedelta(days=10), "human_fix")
    final = await graph.edges(g, grp)
    r.evidence.append("after later conflicting episode:")
    r.evidence += ["  " + _fmt(e) for e in final]
    h = next((e for e in final if e["uuid"] == human_uuid), None)
    paris = [e for e in final if _has(e, "carol", "paris")]
    r.data = {"human_edge_uuid": human_uuid, "human_edge_present": h is not None,
              "human_edge_closed": bool(h and _closed(h)),
              "human_edge_has_provenance": bool(h and h["episodes"]),
              "paris_open": sum(1 for e in paris if not _closed(e)),
              "triplet_llm_calls": ledger.for_episode("probe:human_fix")["llm_http_calls"]}
    r.evidence.append(f"human edge has episode provenance: {r.data['human_edge_has_provenance']}"
                      " (add_triplet without episode= stores episodes=[])")
    if h is None:
        r.status, r.summary = "FAIL", "the human edge is gone after the later episode"
    elif _closed(h):
        r.status, r.summary = "FAIL", "a later episode closed the human fact (machine wins)"
    elif not paris:
        r.summary = "no Paris fact extracted; conflict not exercised"
    elif r.data["paris_open"]:
        r.status = "FAIL"
        r.summary = "human fact still open but a conflicting Paris fact is also open (no winner)"
    else:
        r.status, r.summary = "PASS", "human fact open, all Paris facts closed"
    return r


# -- 3. forget / erase ---------------------------------------------------------------
MARKERS = ("quillfeather", "vexmoor", "oslo")


async def erase(g: Graphiti, prefix: str, ledger: CallLedger) -> ProbeResult:
    r = ProbeResult("erase")
    grp = f"{prefix}-erase"
    await _say(g, grp, "era-1", "Frank: Grace and I are building the new booking app.\n"
               "Grace: Yes, Frank does the backend and I do the design.", T0, "erase")
    await _say(g, grp, "era-2", "Frank: Grace lives in Berlin and cycles to work.",
               T0 + timedelta(days=1), "erase")
    before = {e["uuid"]: e for e in await graph.edges(g, grp)}
    res = await _say(g, grp, "era-3", "Frank: Henry Quillfeather from Vexmoor Labs called me.\n"
                     "Frank: Also, Grace moved from Berlin to Oslo last month.",
                     T0 + timedelta(days=2), "erase")
    ep3 = res.episode.uuid
    mid = {e["uuid"]: e for e in await graph.edges(g, grp)}
    pre_hits = [h for m in MARKERS for h in await graph.marker_hits(g, grp, m)
                if "Episodic" not in h["labels"]]  # derived data, not the raw episode text
    closed_by_ep3 = [u for u, e in mid.items() if u in before and _closed(e)
                     and not _closed(before[u])]
    token = current_episode.set("probe:erase-remove")
    try:
        await g.remove_episode(ep3)
    finally:
        current_episode.reset(token)
    after = {e["uuid"]: e for e in await graph.edges(g, grp)}
    eps_left = [x["name"] for x in await graph.episodes(g, grp)]
    hits = [(m, h) for m in MARKERS for h in await graph.marker_hits(g, grp, m)]
    still_closed = [u for u in closed_by_ep3 if u in after and _closed(after[u])]
    dangling = [u for u, e in after.items() if ep3 in e["episodes"]]
    r.data = {"derived_marker_hits_before_erase": len(pre_hits), "marker_hits_after_erase": len(hits),
              "edges_closed_by_erased_episode": len(closed_by_ep3),
              "still_closed_after_erase": len(still_closed), "dangling_episode_refs": len(dangling),
              "episodes_left": eps_left,
              "remove_episode_llm_calls": ledger.for_episode("probe:erase-remove")["llm_http_calls"]}
    r.evidence = [f"{k}={v}" for k, v in r.data.items()]
    r.evidence += [f"left behind: marker {m!r} in {h['kind']} {h['labels']} keys={h['ks']}"
                   for m, h in hits]
    r.evidence += ["left behind (closed by erased episode, not reopened): " + _fmt(after[u])
                   for u in still_closed]
    if not pre_hits:
        r.summary = ("erased episode produced no marker entity/fact, so only the raw episode "
                     "text was tested; inconclusive")
    if "era-3" in eps_left or hits or still_closed or dangling:
        r.status = "FAIL"
        r.summary = "remove_episode leaves traces of the erased episode (see evidence)"
    elif pre_hits:
        r.status = "PASS"
        r.summary = "episode, its only-sourced facts/entities and all marker text are gone"
    return r


# -- 4. user separation --------------------------------------------------------------
async def separation(g: Graphiti, prefix: str) -> ProbeResult:
    r = ProbeResult("user_separation")
    a, b = f"{prefix}-user-a", f"{prefix}-user-b"
    await _say(g, a, "sep-a", "Dave: My dog is called Rex and he loves the beach.", T0,
               "separation")
    await _say(g, b, "sep-b", "Erin: My cat is called Whiskers and she sleeps all day.", T0,
               "separation")
    token = current_episode.set("probe:separation-search")
    try:
        in_a = await g.search("what is the pet called", group_ids=[a], num_results=20)
        in_b_rex = await g.search("Rex the dog", group_ids=[b], num_results=20)
        unscoped = await g.search("pet", group_ids=None, num_results=50)
    finally:
        current_episode.reset(token)
    leak_a = [e for e in in_a if e.group_id != a]
    leak_b = [e for e in in_b_rex if e.group_id != b or "rex" in e.fact.lower()]
    cross = await graph.q(g, "MATCH (s)-[e]->(t) WHERE e.group_id IN [$a,$b] AND "
                             "(s.group_id <> e.group_id OR t.group_id <> e.group_id) "
                             "RETURN count(e) AS n", a=a, b=b)
    r.data = {"search_a": len(in_a), "leak_into_a": len(leak_a), "search_b_for_rex": len(in_b_rex),
              "leak_into_b": len(leak_b), "cross_group_edges": cross[0]["n"],
              "unscoped_search_groups": sorted({e.group_id for e in unscoped})}
    r.evidence = [f"{k}={v}" for k, v in r.data.items()]
    r.evidence.append("note: group_ids=None searches ALL groups; the port must always pass it")
    if not in_a:
        r.summary = "nothing extracted/found in group A; separation not exercised"
    elif leak_a or leak_b or r.data["cross_group_edges"]:
        r.status, r.summary = "FAIL", "data crossed group_id boundaries"
    else:
        r.status, r.summary = "PASS", "scoped searches and edges stay inside their group_id"
    return r


# -- 5. provenance (on any group, real data allowed: ids and counts only) -------------
async def provenance(g: Graphiti, group: str, id_map: dict[str, str] | None,
                     sample: list[dict[str, Any]] | None = None) -> ProbeResult:
    r = ProbeResult("provenance")
    eps = {e["uuid"]: e for e in await graph.episodes(g, group)}
    es = sample if sample is not None else await graph.edges(g, group)
    ours = set((id_map or {}).values())
    no_eps = [e for e in es if not e["episodes"]]
    unresolved = [e for e in es if any(u not in eps for u in e["episodes"])]
    not_ours = [e for e in es if id_map and any(u not in ours for u in e["episodes"])]
    no_back = [e for e in es if e["episodes"] and not any(
        e["uuid"] in (eps.get(u, {}).get("entity_edges") or []) for u in e["episodes"])]
    multi = sum(1 for e in es if len(e["episodes"]) > 1)
    r.data = {"group": group, "edges_checked": len(es), "without_episodes": len(no_eps),
              "unresolvable_episode_uuid": len(unresolved), "not_in_our_id_map": len(not_ours),
              "no_back_reference": len(no_back), "with_multiple_episodes": multi}
    r.evidence = [f"{k}={v}" for k, v in r.data.items()]
    r.evidence.append("granularity: episode only; no quote or time range on an edge")
    if not es:
        r.summary = "no edges to check"
    elif no_eps or unresolved or not_ours:
        r.status, r.summary = "FAIL", "some edges cannot be traced to a source episode"
    else:
        r.status, r.summary = "PASS", "every checked edge resolves to its source episode(s)"
    return r


# -- 6. rebuild comparison (pure) ----------------------------------------------------
def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", s.lower()).strip()


def _tokens(s: str) -> set[str]:
    return set(_norm(s).split())


def _jac(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a | b else 1.0


def compare_runs(run1: list[dict[str, Any]], run2: list[dict[str, Any]],
                 ents1: list[str], ents2: list[str], fuzzy: float = 0.6) -> dict[str, Any]:
    f1, f2 = [e["fact"] for e in run1], [e["fact"] for e in run2]
    n1, n2 = {_norm(x) for x in f1}, {_norm(x) for x in f2}
    t2 = [_tokens(x) for x in f2]
    t1 = [_tokens(x) for x in f1]

    def matched(src: list[set[str]], dst: list[set[str]]) -> int:
        return sum(1 for s in src if dst and max(_jac(s, d) for d in dst) >= fuzzy)

    e1, e2 = {_norm(x) for x in ents1}, {_norm(x) for x in ents2}
    return {
        "facts_run1": len(f1), "facts_run2": len(f2),
        "entities_run1": len(ents1), "entities_run2": len(ents2),
        "fact_exact_jaccard": round(_jac(n1, n2), 3),
        f"fact_fuzzy_match_run1_in_run2_at_{fuzzy}": round(matched(t1, t2) / len(t1), 3) if t1 else None,
        f"fact_fuzzy_match_run2_in_run1_at_{fuzzy}": round(matched(t2, t1) / len(t2), 3) if t2 else None,
        "entity_name_jaccard": round(_jac(e1, e2), 3),
    }


def rebuild_status(cmp: dict[str, Any]) -> ProbeResult:
    r = ProbeResult("rebuild", status="INFO", data=cmp)
    r.summary = "re-run of the same day on a cleared group (judge stability by the numbers)"
    r.evidence = [f"{k}={v}" for k, v in cmp.items()]
    return r


def sample_edges(es: list[dict[str, Any]], n: int, seed: int) -> list[dict[str, Any]]:
    return random.Random(seed).sample(es, min(n, len(es)))
