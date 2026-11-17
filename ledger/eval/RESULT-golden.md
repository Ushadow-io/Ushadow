# L2 with a real model: golden days (numbers only)

The golden days hold the user's real speech, so this file has counts and seconds only. The
result files are in the git-ignored `eval/out/`. All numbers were measured.

- Model: `Qwen3.6-35B-A3B-MTP-GGUF` for gap, state and composer. Thinking is off.
  `temperature 0`, `seed 0`.
- Server: the user's own (`127.0.0.1:18080/v1`). Storage: mongomock only. Concurrency: 1.
- "v1 code" means the original prompts plus thinking off. "final code" adds the composer
  budget of 1000 tokens, short line refs and the v2 split prompt (see `RESULT-synthetic.md`).
- Speaker roles in these days: all `unknown`, no person ids.

## 2026-11-14 (11 recordings, 131.1 min, 1,872 segments, 53 moments)

### Three fresh ledgers, v1 code

| run | conversations | calls gap/state/composer | invalid gap/state/composer | composer all-attempts-invalid (citations dropped) | state fallbacks | largest input (chars / prompt tokens) | median s/call g/s/c | wall s |
|---|---|---|---|---|---|---|---|---|
| 1 | **7** | 4 / 51 / 10 | 0 / 0 / 3 | 0 | 0 | 6,559 / 4,178 | 4.6 / 10.7 / 35.3 | 887 |
| 2 | **6** | 4 / 50 / 11 | 0 / 0 / 7 | 2 | 0 | 6,622 / 4,204 | 4.6 / 12.5 / 28.8 | 912 |
| 3 | **6** | 4 / 50 / 10 | 0 / 0 / 6 | 2 | 0 | 6,622 / 4,204 | 6.0 / 7.7 / 12.1 | 564 |

Invalid composer answers by cause:

| run | cut by max_tokens 500 (JSONDecodeError) | unknown citations |
|---|---|---|
| 1 | 2 | 1 |
| 2 | 2 | 5 |
| 3 | 1 | 5 |

Two of the 10 composer answers in run 1 hit `finish=length`.

Join decisions per run: 48 in total.

| decided by | count |
|---|---|
| rule `same_recording_short_gap` | 38 |
| rule `same_device_short_gap` | 5 |
| rule `long_gap` | 1 |
| gap model | 4 (1 continues, 3 new) |
| rule `same_people` | 0 (no person ids) |

There was also 1 duplicate recording (rule).

**Stability across fresh ledgers: 7, 6, 6 conversations.** Runs 2 and 3 have exactly one
border fewer than run 1, and no other difference (0 borders moved, 0 new). The only
difference is one model topic split (`split_at`): 2 splits in run 1, 1 in runs 2 and 3. All
gap and rule decisions were the same in all three runs.

**Same ledger.** Re-running the pipeline alone gives the same result with 0 model calls.

- Measured on 13 Nov 3 of 3 times, and on 14 Nov 2 of 2 times with the final code.
- In the first v1 test, the re-run also ingested the identical bundle again. That made
  **33 new model calls** (29 state, 4 composer) and changed 2 conversations. Re-runs 2 and 3
  after it made 0 calls.
- Cause, found offline with the fake model (`eval/reingest_check.py`): ingesting the same
  bundle a second time cuts **5 new one-segment moments**, one in each of 5 recordings
  (53 to 58). That is in L1 (ingest / moment cutter), not in L2, and was not fixed here.

**Compared with Chronicle** (11 Chronicle conversations not deleted, 0 episodes), by time
overlap:

| run | ledger | one-to-one | ledger overlapping several Chronicle | Chronicle overlapping several ledger | ledger overlapping none |
|---|---|---|---|---|---|
| v1 run 1 | 7 | 2 | 3 | 2 | 1 |
| v1 runs 2 and 3 | 6 | 2 | 2 | 1 | 1 |
| final code | 6 | 3 | 2 | 1 | 0 |

### One fresh ledger, final code

| conversations | calls gap/state/composer | invalid g/s/c | fallbacks | largest prompt tokens g/s/c | median s/call g/s/c | wall s | same-ledger re-runs |
|---|---|---|---|---|---|---|---|
| 6 | 4 / 49 / 6 | 0 / 0 / 0 | 0 | 1,164 / 1,828 / 2,580 | 2.7 / 4.5 / 8.1 | 259 | 2 of 2 identical, 0 calls |

- Short refs cut the largest prompt by 36-39 %: state 2,654 to 1,828 tokens, composer 4,204
  to 2,580.
- No composer answer was invalid (v1: 3 to 7 per run).
- This run made 0 model splits; the gap model said "new" 4 times.
- Its borders differ from the v1 runs by 1-2. One gap decision differs from all v1 runs, and
  the v1 split at one border was not made.
- Durations of the 6 conversations: 947, 339, 436, 942, 2,912 and 969 s.

## 2026-11-13 (7 recordings, 13.5 min, 46 segments), v1 code plus the 1000-token composer budget

| run | conversations | calls g/s/c | invalid | fallbacks | largest prompt tokens (state / composer) | median s/call g/s/c | wall s |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 1 / 7 / 3 | 0 | 0 | 1,580 / 2,728 | 2.0 / 3.1 / 9.8 | 56 |
| 2 | 3 | 1 / 7 / 3 | 0 | 0 | 1,580 / 2,721 | 2.0 / 2.2 / 9.9 | 50 |
| 3 | 3 | 1 / 7 / 3 | 0 | 0 | 1,580 / 2,724 | 2.1 / 2.1 / 7.4 | 45 |

- Fresh ledgers: 3, 3, 3 conversations, with the same borders (0 differ).
- Same ledger: 3 of 3 re-runs identical, 0 model calls.
- Joins: 2 `same_recording`, 2 `same_device`, 1 `long_gap`, 1 gap model ("new").
- Compared with Chronicle (3 episodes, 7 conversations not deleted): the 3 ledger
  conversations match the 3 Chronicle episodes one to one. Against Chronicle conversations
  (recordings): 1 one-to-one, 2 ledger conversations each overlap several of them, and
  1 Chronicle conversation overlaps no ledger conversation.

## Not run

- 2026-11-07 and 2026-11-10: there was not enough time on the shared server.
- 14 Nov with the final code: only 1 fresh ledger, not 3.
