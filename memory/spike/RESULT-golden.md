# S1 result: golden days (numbers only)

> Private real speech. This file holds counts only: no text, names or facts. Extracted facts are in
> the git-ignored `out/golden-1113/` (`facts_sample.csv` for the user's hand check).

Setup: graphiti-core 0.31.2, `Qwen3.6-35B-A3B-MTP-GGUF` (thinking off, `json_schema`),
`nomic-embed-text` 768, `SEMAPHORE_LIMIT=1`, text sent only to the user's own servers
(127.0.0.1:18080 chat, 127.0.0.1:18434 embeddings) and the throw-away spike Neo4j. Run 2026-11-16.

## Coverage

| Day | Status |
|---|---|
| 2026-11-13 | run + rebuild done |
| 2026-11-14 | run done 2026-11-17 (user go-ahead), no rebuild, no probes except provenance |
| 2026-11-07, 2026-11-10 | not run (cut for time) |

Episode mapping for 13 Nov: 84 Chronicle conversations, 77 deleted (skipped), 2 empty, 5 episodes,
46 lines, 0 unassigned lines. All speaker roles are `unknown`, so no role filter applies and media
speech is not dropped.

## 2026-11-13 (5 episodes, 345 to 1 665 chars, 4 to 20 lines)

| Metric | median | p90 | sum |
|---|---|---|---|
| LLM calls per episode | 3 | 4 | 14 |
| Input tokens per episode | 5 269 | 8 862 | 29 512 |
| Output tokens per episode | 161 | 516 | 1 039 |
| Wall time per episode (s) | 21 | 48 | 148 |
| New facts per episode | 0 | 2 | 3 |
| New entities per episode | 0 | 6 | 8 |
| Facts closed (supersede) | 0 | 0 | 0 |

- Calls by prompt: `extract_nodes.extract_message` 5, `extract_edges.edge` 5,
  `extract_nodes.extract_summaries_batch` 2, `dedupe_nodes.nodes` 1, `dedupe_edges.resolve_edge` 1.
- Failures: 0 failed episodes, 0 failed LLM attempts (JSON), 0 calls without `usage`.
- 3 of 5 episodes produced no fact at all.
- Entities that are only a diarization label ("Speaker N"): 1 of 8.
- Provenance: PASS, 3 of 3 facts trace to their source episode (episode granularity only).
- Rebuild (same day, cleared group): facts 3 vs 6, exact fact overlap 0.0, fuzzy fact overlap 0.33 both
  ways, entity-name overlap 0.78. Rebuild used 19 LLM calls vs 14.
- Own precision check (agent, against the transcript): 3 facts: 0 about the user's life, 2 faithful to
  the words but taken from background media speech, 1 wrong (relation misread). The user's own
  hand check is still open.

## What this means

On this small day the extractor is cheap (3 calls, about 20 to 50 s per episode) and the JSON is
reliable, but the yield is tiny and the facts it found come from media speech, because no speaker
role can filter it. A rebuild doubles the fact count and shares no exact fact with the first run.
One small day cannot judge precision; 14 Nov (long conversations) is the run that matters next.

## 2026-11-14 (10 episodes, 1 435 to 14 231 chars, 1 541 lines)

Run 2026-11-17, same setup, fresh spike Neo4j. 15 Chronicle conversations: 4 deleted, 1 empty,
10 episodes. 314 lines are in no conversation and were not read.

| Metric | median | p90 | sum |
|---|---|---|---|
| LLM calls per episode | 7 | 25 | 103 |
| Input tokens per episode | 29 939 | 105 058 | 436 302 |
| Output tokens per episode | 1 170 | 3 876 | 16 793 |
| Wall time per episode (s) | 111 | 519 | 1 914 (32 min) |
| New facts per episode | 3 | 20 | 65 |
| New entities per episode | 7.5 | 13 | 79 |
| Facts closed (supersede) | 0 | 0 | 0 |

- Calls by prompt: `dedupe_edges.resolve_edge` 51, `extract_edges.extract_timestamps` 12,
  `dedupe_nodes.nodes` 11, `extract_edges.edge` 10, `extract_nodes.extract_message` 10,
  `extract_nodes.extract_summaries_batch` 9.
- Failures: 0 failed episodes, 0 calls without `usage`. 29 Neo4j driver errors were logged before
  the first episode (empty database, index setup); none after.
- Largest single episode: 105 058 input tokens over 25 calls. This is far above the 1 000-token
  target of the design; Graphiti re-sends the episode text in each call.
- Entities that are only a diarization label: 4 of 79.
- Facts with a `valid_at` time: 55 of 65.
- Provenance: PASS, 50 of 50 checked facts trace to their source episode (episode granularity only).
- Owner gate (applied after the run, by counting): 6 of 10 episodes have a recognised voice;
  44 of 65 facts come from those 6. 21 facts come from conversations with no recognised voice.
- Precision: not checked. `out/golden-1114/facts_sample.csv` (50 facts) waits for the user's hand check.

## User's hand check of 13 Nov (2026-11-17)

3 facts: 2 are the same fact, 1 is probably wrong, all 3 come from a TV show. 0 of 3 are about the
user's life. Result: speaker roles and the owner gate were added (commit de13a4b1).

## User's hand check of 14 Nov (2026-11-17)

Read by the user, not marked row by row (so no precision number): the facts look correct. Two
faults: some facts are duplicates, and some still come from media speech. The user expects the
media share to fall as speaker recognition names more conversations.

## Engine decision (S1.5)

Graphiti stays as the engine behind the memory port. Open work, in order:
1. Cost: up to 105 058 input tokens for one conversation (target about 1 000 per call).
2. Duplicates: Graphiti's own dedupe leaves duplicates; the consolidation job (M5.1) must merge them.
3. Media: handled outside the engine, by speaker roles and the owner gate.
4. Not proven: closing of old facts (0 closed on 2 days), and stability of a rebuild on a long day.

## Cost test 1: no previous episodes (2026-11-17)

`SPIKE_NO_PREVIOUS=1` passes `previous_episode_uuids=[]`, so Graphiti does not put the last 10
episodes into its prompts. Same day (14 Nov), same model, fresh group.

| Metric | Default | No previous | Change |
|---|---|---|---|
| Input tokens | 436 302 | 243 593 | -44 % |
| LLM seconds | 1 881 | 904 | -52 % |
| LLM calls | 103 | 151 | +47 % |
| Largest `extract_message` input | 20 506 | 5 938 | -71 % |
| Facts | 65 | 77 | +12 |
| Entities | 96 vs 79 | | +17 |
| Entities that are a diarization label | 4 | 4 | 0 |
| Failed episodes | 0 | 0 | |

- The four prompts that carry episode text fell from 373 558 to 146 101 input tokens (-61 %).
- Calls rose: `extract_timestamps` 12 to 45, `resolve_edge` 51 to 66. These are per-fact calls and now
  cost 97 492 input tokens (40 % of the total).
- 17 more entities and 12 more facts. Cause not known: it can be more duplicate entities without
  the context, or model variance (the server is not deterministic; an earlier rebuild shared about
  half its facts). Not checked by hand.
