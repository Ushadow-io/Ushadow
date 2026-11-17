"""Each model request carries a schema that allows only ids and line references that exist."""

from memory_service.engine.staged import prompts
from memory_service.engine.staged.llm import follows


def _lines(n: int) -> list[dict[str, str]]:
    return [{"ref": f"L{i}", "rendered": f"L{i} x", "text": "x"} for i in range(1, n + 1)]


def _fact(lines: list[str]) -> dict:
    return {"subject": "A", "relation": "likes", "object": "B", "fact": "A likes B.",
            "valid_from": None, "valid_until": None, "lines": lines, "quote": None}


def test_extract_schema_allows_only_this_chunks_line_refs():
    req = prompts.extract_request(_lines(2), "2024-01-10T09:00:00+00:00")
    ok = {"entities": [{"name": "A", "type": "Person", "aliases": []}], "facts": [_fact(["L2"])]}
    assert follows(ok, req.schema)
    assert not follows({**ok, "facts": [_fact(["L9"])]}, req.schema)  # a line that is not there
    assert not follows({**ok, "facts": [_fact([])]}, req.schema)  # a fact with no proof
    assert not follows({**ok, "facts": [_fact(["2"])]}, req.schema)  # the wrong form
    bad_type = {**ok, "entities": [{"name": "A", "type": "Robot", "aliases": []}]}
    assert not follows(bad_type, req.schema)
    assert not follows({"entities": []}, req.schema)  # a missing key
    assert "Example of the answer shape" in req.prompt


def test_match_schema_allows_only_known_ids():
    items = [{"id": "n1", "candidates": [{"id": "c1"}, {"id": "c2"}]}]
    schema = prompts.match_request(items).schema
    row = {"id": "n1", "answer": "same", "candidate": "c2", "certainty": "high"}
    assert follows({"decisions": [row]}, schema)
    assert follows({"decisions": [{**row, "answer": "new", "candidate": None}]}, schema)
    assert not follows({"decisions": [{**row, "candidate": "c7"}]}, schema)
    assert not follows({"decisions": [{**row, "id": "n5"}]}, schema)
    assert not follows({"decisions": [{**row, "answer": "maybe"}]}, schema)


def test_reconcile_and_duplicate_schemas_allow_only_known_ids():
    items = [{"id": "f0", "known": [{"id": "k1"}]}]
    schema = prompts.reconcile_request(items).schema
    row = {"id": "f0", "answer": "duplicate", "known_ids": ["k1"], "certainty": "low"}
    assert follows({"decisions": [row]}, schema)
    assert not follows({"decisions": [{**row, "known_ids": ["k9"]}]}, schema)
    dup = prompts.dup_request([{"id": "p1", "a": "x", "b": "y"}]).schema
    assert follows({"decisions": [{"id": "p1", "same": True}]}, dup)
    assert not follows({"decisions": [{"id": "p1", "same": "yes"}]}, dup)
