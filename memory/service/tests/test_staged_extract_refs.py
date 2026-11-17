"""Stage 1 accepts the line references a real model gives, and survives one bad chunk."""

from collections import Counter

import pytest

from memory_service.engine.staged import FakeLLM, MemoryGraphStore, StagedEngine, StagedSettings
from memory_service.engine.staged.llm import LLMError
from memory_service.engine.staged.s1_extract import _line_refs, _numbers, lines_from_episode
from tests.staged_helpers import G, episode, facts


def test_line_numbers_from_the_forms_a_model_uses():
    assert _numbers("L7") == [7] and _numbers("7") == [7] and _numbers(7) == [7]
    assert _numbers("[L7]") == [7] and _numbers("Line 7") == [7]
    assert _numbers("L3-L5") == [3, 4, 5] and _numbers("3 to 4") == [3, 4]
    assert _numbers("L7 [speech 2024-01-10 09:00Z]") == [7]  # only the first number counts
    assert _numbers("L1-L500") == [1]  # a huge range is not a proof
    assert _numbers("none") == []


class _Ctx:
    def __init__(self) -> None:
        self.tally: Counter[str] = Counter()


def test_quote_finds_the_line_when_no_reference_is_usable():
    chunk = lines_from_episode(episode("a", [("Owner", "Hello there."), ("Owner", "Dana likes jazz.")]))
    ctx = _Ctx()
    assert _line_refs(ctx, {"lines": ["x"], "quote": "Dana likes jazz"}, chunk) == ["L2"]
    assert ctx.tally["facts_line_from_quote"] == 1
    assert _line_refs(ctx, {"lines": ["L99"], "quote": "not said"}, chunk) == []
    assert ctx.tally["ref_shape:['a99']"] == 1  # shape only: letters and digits are masked


async def test_a_bad_chunk_is_tried_again_as_two_halves():
    calls = {"n": 0}

    def answer(req):
        calls["n"] += 1
        if calls["n"] == 1:
            raise LLMError("model answer is not JSON")
        ref = req.payload[0]["ref"]
        return facts(("Dana", "likes", f"thing {ref}", [ref]))

    engine = StagedEngine(MemoryGraphStore(), FakeLLM({"extract": answer}), StagedSettings())
    res = await engine.add_episode(G, episode("a", [("Owner", "Dana likes jazz."),
                                                    ("Owner", "Dana likes tea.")]))
    assert calls["n"] == 3 and len(res.facts) == 2
    assert engine.tally["extract_chunks_split_after_failure"] == 1


async def test_a_chunk_that_fails_twice_fails_the_episode():
    def answer(req):
        raise LLMError("model answer is not JSON")

    engine = StagedEngine(MemoryGraphStore(), FakeLLM({"extract": answer}), StagedSettings())
    with pytest.raises(LLMError):
        await engine.add_episode(G, episode("a", [("Owner", "one."), ("Owner", "two.")]))
