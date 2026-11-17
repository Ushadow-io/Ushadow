"""Stage 1b: one owner entity with the set name, one fact per sentence, a source score."""

from datetime import timedelta

from memory_service.engine.staged import FakeLLM, MemoryGraphStore, StagedEngine
from memory_service.engine.staged import StagedSettings as Settings
from memory_service.engine.staged import confidence as conf
from memory_service.models import EpisodeInput, EpisodeLine
from tests.staged_helpers import T0, G, episode, facts


def _engine(answer, **settings) -> StagedEngine:
    return StagedEngine(MemoryGraphStore(), FakeLLM({"extract": lambda req: answer}),
                        Settings(store="memory", **settings))


def _fact(s, r, o, text, refs=("L1",)):
    return (s, r, o, list(refs), {"fact": text})


def _spoken(lines: list[tuple[str, str, str]]) -> EpisodeInput:
    """lines: (speaker, role, text)."""
    return EpisodeInput(name="a", reference_time=T0, lines=[
        EpisodeLine(recording_id="rec-a", transcript_revision="final-1", start=T0 + timedelta(seconds=10 * i),
                    end=T0 + timedelta(seconds=10 * i + 9), speaker=s, role=role, text=t)
        for i, (s, role, t) in enumerate(lines)])


async def test_every_name_for_the_user_is_one_entity_with_the_set_name():
    answer = facts(_fact("Owner", "works at", "Acme", "The owner works at Acme."),
                   _fact("the owner", "likes", "jazz", "The owner likes jazz."),
                   _fact("Raymond Okoro", "lives in", "Leeds", "Raymond Okoro lives in Leeds."))
    engine = _engine(answer, owner_name="Ray", owner_aliases=("Raymond Okoro",))
    res = await engine.add_episode(G, episode("a", [("Owner", "I work at Acme, like jazz, live in Leeds.")]))
    assert {f.source for f in res.facts} == {"Ray"}
    assert len({f.source_entity_id for f in res.facts}) == 1
    texts = sorted(f.text for f in res.facts)
    assert texts == ["Ray likes jazz.", "Ray lives in Leeds.", "Ray works at Acme."]
    owner = await engine.store.get_entity(G, res.facts[0].source_entity_id)
    assert owner.aliases == ["Raymond Okoro"]  # a real other name, never "the owner"


async def test_the_owner_speaker_label_and_a_model_alias_mean_the_user():
    answer = facts(_fact("Raymond", "likes", "tea", "Raymond likes tea."),
                   _fact("Raymond M Okoro", "has", "a dog", "Raymond M Okoro has a dog."))
    answer["entities"] = [{"name": "Raymond M Okoro", "type": "Person", "aliases": ["Ray"]}]
    engine = _engine(answer, owner_name="Ray")
    res = await engine.add_episode(G, _spoken([("Raymond", "owner", "I like tea and I have a dog.")]))
    assert {f.source for f in res.facts} == {"Ray"} and len({f.source_entity_id for f in res.facts}) == 1
    assert sorted(f.text for f in res.facts) == ["Ray has a dog.", "Ray likes tea."]


async def test_without_a_name_the_user_is_owner_and_the_text_is_not_changed():
    answer = facts(_fact("the owner", "works at", "Acme", "The owner works at Acme."))
    res = await _engine(answer).add_episode(G, episode("a", [("Owner", "I work at Acme.")]))
    assert [(f.source, f.text) for f in res.facts] == [("Owner", "The owner works at Acme.")]


async def test_the_owner_of_something_else_is_not_renamed():
    answer = facts(_fact("Dana", "owns", "Acme", "Dana is the owner of Acme."))
    res = await _engine(answer, owner_name="Ray").add_episode(G, episode("a", [("Owner", "Dana owns Acme.")]))
    assert [f.text for f in res.facts] == ["Dana is the owner of Acme."]


async def test_a_fact_from_the_user_to_the_user_is_dropped():
    answer = facts(_fact("Ray", "sent a letter to", "Owner", "Ray sent a letter to the owner."),
                   _fact("Ray", "likes", "jazz", "Ray likes jazz."))
    engine = _engine(answer, owner_name="Ray")
    res = await engine.add_episode(G, episode("a", [("Owner", "I like jazz.")]))
    assert [f.text for f in res.facts] == ["Ray likes jazz."] and engine.tally["facts_dropped_self"] == 1


async def test_one_sentence_given_for_each_pair_is_one_fact_with_all_lines():
    said = "Cooks and bakers can order from Mill One and Mill Two."
    answer = facts(_fact("Cooks", "can order from", "Mill One", said, ["L1"]),
                   _fact("Cooks", "can order from", "Mill Two", said, ["L2"]),
                   _fact("Bakers", "can order from", "Mill One", said),
                   _fact("Bakers", "can order from", "Mill Two", said))
    engine = _engine(answer)
    res = await engine.add_episode(G, episode("a", [("Owner", "Cooks order."), ("Owner", "Bakers too.")]))
    assert len(res.facts) == 1 and len(res.facts[0].hints) == 2
    assert engine.tally["facts_dropped_same_sentence"] == 3


async def test_a_fact_that_repeats_a_part_of_a_longer_fact_is_dropped():
    whole = "Acme sells bread, cake, and pie."
    answer = facts(_fact("Acme", "sells", "bread", whole),
                   _fact("Acme", "sells", "cake", "Acme sells cake and pie."),
                   _fact("Acme", "sells", "pie", "Acme sells pie."))
    engine = _engine(answer)
    res = await engine.add_episode(G, episode("a", [("Owner", "Acme sells a lot.")]))
    assert [f.text for f in res.facts] == [whole]
    assert engine.tally["facts_dropped_part_of_longer"] == 2


async def test_a_longer_fact_that_turns_the_meaning_keeps_both():
    answer = facts(_fact("Dana", "likes", "tea", "Dana likes green tea."),
                   _fact("Dana", "likes", "coffee", "Dana no longer likes green tea."),
                   _fact("Sam", "likes", "tea", "Sam likes green tea with milk."))
    res = await _engine(answer).add_episode(G, episode("a", [("Owner", "Tea talk.")]))
    assert len(res.facts) == 3  # a turn word, and another subject


async def test_a_fact_said_only_by_an_unknown_speaker_has_a_low_score():
    answer = facts(_fact("Dana", "likes", "jazz", "Dana likes jazz.", ["L1"]),
                   _fact("Sam", "likes", "tea", "Sam likes tea.", ["L2"]),
                   _fact("Kim", "likes", "rock", "Kim likes rock.", ["L1", "L2"]))
    engine = _engine(answer)
    res = await engine.add_episode(G, _spoken([("Ray", "owner", "Dana likes jazz. Kim likes rock."),
                                               ("Speaker 3", "unknown", "Sam likes tea. Kim likes rock.")]))
    score = {f.source: f.confidence for f in res.facts}
    assert score == {"Dana": 1.0, "Sam": conf.SOURCE_UNKNOWN, "Kim": 1.0}  # the best line counts
    assert engine.tally["facts_from_unknown_speakers_only"] == 1
    assert {f.source: f.heard for f in res.facts} == {"Dana": "known", "Sam": "unknown", "Kim": "known"}
    engine.cfg = Settings(store="memory", min_confidence=0.6)
    assert sorted(f.source for f in await engine.facts(G)) == ["Dana", "Kim"]
    again = await engine.add_episode(G, _spoken([("Ray", "owner", "Dana likes jazz. Kim likes rock."),
                                                 ("Ray", "owner", "Sam likes tea. Kim likes rock.")]))
    assert [(f.heard, f.confidence) for f in again.facts if f.source == "Sam"] == [("known", 1.0)]


def test_owner_settings_from_the_environment():
    s = Settings.from_env({"MEMORY_OWNER_NAME": " Ray ", "MEMORY_OWNER_ALIASES": "Raymond Okoro, Rayo,"})
    assert s.owner_name == "Ray" and s.owner_aliases == ("Raymond Okoro", "Rayo")
    assert Settings.from_env({}).owner_name == ""
