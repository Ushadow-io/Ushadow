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
| 2026-11-14 | **not run**: the command was refused by the session's permission classifier; needs the user's go-ahead |
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
