# Staged engine on a golden day (numbers only)

> Private real speech. Counts only: no text, names or facts. Extracted facts are in the
> git-ignored `eval/out/<run>/facts.jsonl`.

Day 2026-11-14: 10 conversations, 1 541 lines, about 2 hours of speech. Model
`Qwen3.6-35B-A3B-MTP-GGUF` (thinking off), `nomic-embed-text`, throw-away Neo4j. Run 2026-11-17 with
`eval/run_staged.py --reconcile collection`. Graphiti columns are from `memory/spike/RESULT-golden.md`.

| Metric | Graphiti | Graphiti, no previous | Staged 1 | Staged 2 | Staged 3 |
|---|---|---|---|---|---|
| Code | 0.31.2 | `SPIKE_NO_PREVIOUS=1` | 4b991dbc | 764efbcb | 332bf504 |
| Input tokens | 436 302 | 243 593 | 62 155 | 89 532 | 89 227 |
| Output tokens | 16 793 | 16 538 | 35 047 | 43 239 | 26 690 |
| LLM calls | 103 | 151 | 25 | 39 | 36 |
| LLM seconds | 1 881 | 904 | 829 | 963 | 738 |
| Facts | 65 | 77 | 23 | 179 | 138 |
| Entities | 79 | 96 | 21 | 117 | 94 |
| Facts closed | 0 | 0 | 0 | 4 | 2 |
| Facts dropped, no usable line | n/a | n/a | 127 | 0 | 0 |
| Failed conversations | 0 | 0 | 1 | 0 | 0 |
| Chunks retried as two halves | n/a | n/a | n/a | 1 | 1 |

- Staged 1: the line reference the model wrote was not accepted, so 127 of 150 facts were dropped,
  and one answer that was not JSON lost a whole conversation.
- Staged 2: tolerant line references, quote fallback, one retry of a failed chunk as two halves.
- Staged 3: strict answer structure (only line refs and ids that exist, fixed entity types, an
  example in each prompt). The model wrote 38 % fewer output tokens than in Staged 2.
- Staged 3 decisions: entity match 117 by rule and 6 by model (3 calls); fact reconcile 86 by rule
  and 52 by model (5 calls). Confidence: entity matches 100 at 0.8 or more, 23 at 0.6 to 0.8; facts
  94 and 44; none below 0.6, so the review job had no work.
- One extract chunk failed in Staged 2 and in Staged 3 (the conversation with the longest
  answers); the retry as two halves worked both times.

Not known: precision. Staged 2 and Staged 3 differ by 41 facts on the same day (the server is not
deterministic, and the structure changed). Nobody has read the facts. 138 to 179 facts against
Graphiti's 65 can be better recall, or small talk and duplicates. The owner gate and media roles
are not applied in this script (the golden export has no owner role yet).
