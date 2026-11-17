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

## Hand check of Staged 3, and Staged 4 (owner name, tidy stage)

The user read the Staged 3 facts. Found, with the cause:

| Found | Cause | Fix |
|---|---|---|
| Many facts from TV | No speaker had the role owner, so no owner gate; every line counted the same | `--owner-name`: owner lines get the role owner, owner gate applies; a fact heard only from unknown speakers scores 0.5 |
| The user under 3 names ("the owner", the full name, the short name) | The prompt said "Owner"; the full name was said one time in the text | `MEMORY_OWNER_NAME`: one entity, one name, in subject, object and sentence |
| A fact from the user to the user | 2 names for one person | Same fix; a fact from an entity to itself is dropped |
| One sentence 2 to 4 times (6 extra copies) | One sentence with 2 subjects and 2 objects became 4 edges | Stage 1b: one sentence, one fact |
| Facts that are a part of a longer fact | A list became one fact per item | Prompt rule; stage 1b drops a fact whose words are all in a longer fact of the same subject |
| "X ... for the owner" (5 facts) | The answer shape needs an object; the model added the owner | Prompt rule |
| An entity made from a word of the text ("mentioned in the conversation") | The word is in the text one time; it is not a scrubbed record (the text has no `*`) | Prompt rule |

| Metric | Staged 3 | Staged 4a | Staged 4b |
|---|---|---|---|
| Conversations read | 10 | 6 (4 skipped, no owner speech) | 6 |
| Lines read (by the owner) | 1 541 | 1 377 (160) | 1 377 (160) |
| Input tokens | 89 227 | 76 216 | 83 718 |
| Output tokens | 26 690 | 10 161 | 11 939 |
| LLM calls | 36 | 25 | 28 |
| LLM seconds | 738 | 389 | 440 |
| Facts | 138 | 40 | 61 |
| Facts with confidence 0.6 or more | 138 | 23 | 40 |
| Facts heard only from unknown speakers (0.5) | not measured | 17 | 21 |
| Entities | 94 | 35 | 65 |
| Facts with the same sentence as another | 6 | 0 | 0 |
| Facts with the word "owner" | 36 | 0 | 0 |
| Facts dropped: subject is the object | n/a | 17 | 1 |
| Failed conversations | 0 | 0 | 0 |

- Staged 4a dropped 17 facts because the model gave the user as subject and as object; real facts
  about the user were lost. Staged 4b adds one prompt rule ("the object is never the
  subject; use the thing the fact is about"): 1 dropped, and those facts are back.
- Not known: precision of Staged 4b. One fact the user marked as false in Staged 3 has a
  matching word in Staged 4b; nobody has read the new facts. 12 % of the lines read are by the
  owner; the other lines are unknown speakers (people in the room, or TV), so the 0.5 score is
  the only signal until speaker recognition names more speakers.
- Not applied here: the service's media and background roles (the golden export has none).
