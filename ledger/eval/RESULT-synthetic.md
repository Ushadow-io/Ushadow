# L2 with a real model: synthetic days (first run, 2026-11-16/17)

All numbers below were measured. Nothing is estimated.

## Setup

- Model server: the user's lemonade/llama.cpp server (`svc/gpu`, port-forward `127.0.0.1:18080/v1`).
- Model: `Qwen3.6-35B-A3B-MTP-GGUF` in **every role** (gap, state, composer). The planned
  comparison of small models (`Qwen3-1.7B`, `Llama-3.2-3B`, `Gemma-4-12B`) was **dropped**. The
  server holds one model at a time and swaps on demand. Another agent used the same server, so
  each change of model meant a reload: one probe call to Qwen3-1.7B took 296 s, then 169 s, for
  about 1 s of generation. The 35B model is the one Chronicle uses, so it stays loaded.
- Storage: mongomock (in memory) only. Concurrency against the server: 1.
- Days: `eval/days/day1_saturday.py` and `eval/days/day2_workday.py`, built by `eval/synth.py`.
  The names and text are invented. Ground truth is the `@cN` tags in the scripts.
- Runner: `eval/run_eval.py`. Tables: `eval/summarize.py`. Raw results: `eval/results/*.json`.
- Border scoring: a border is the start of a conversation. A predicted border matches a true
  border when it is **within 30 s**, one to one. Every matched border in these runs was exact
  (0.0 s).

**Size of the days (smaller than asked).** Day 1 has 15.1 min of speech, 231 segments,
7 recordings and 11 moments. Day 2 has 12.2 min of speech, 190 segments, 8 recordings and
9 moments. Each day spans about 4 h. The target was 60-90 min of speech; I wrote the text by
hand and stopped at about 2,000 words a day. The real golden days (100-150 min) cover the
volume (`RESULT-golden.md`).

What the days test (ground truth, 8 conversations each):

| day | case | expected |
|---|---|---|
| 1 | breakfast with TV news (media) in the background, topics drift | no split |
| 1 | neighbour at the door, inside the same recording | topic split |
| 1 | phone call to a restaurant, 3 min later, other device | gap model: new |
| 1 | back with the partner (not identified), 1.5 min after the call | gap model: new |
| 1 | same talk after a 7 min pause | gap model: continues |
| 1 | pendant dies, phone takes over 50 s later | gap model: continues |
| 1 | speakerphone call in the middle of cooking, then the return | 2 topic splits |
| 2 | barista, then a colleague on the walk, same recording | topic split |
| 2 | standup ends, one person stays to talk about his flat | topic split |
| 2 | 1:1 with a 2-line knock at the door; pendant restart 30 s later | no split; rule join |
| 2 | dentist call on the phone | gap model: new |
| 2 | bug fix at the desk, then the same talk after a 9 min pause | new; then gap model: continues |

## Results (one fresh run per prompt version)

Prompt versions: v1 is the original. v2 has the concrete split prompt (kept). v3 is v2 plus a
content-based gap prompt (reverted). All runs use the client fixes below.

| day | prompt | conv (true 8) | calls gap/state/composer | invalid JSON | fallbacks | median s/call g/s/c | max prompt tokens | wall s | border P / R | missed splits | wrong joins | wrong "new" at a recording start | exact conv |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | v1 | 5 | 4/11/5 | 0 | 0 | 2.5/3.7/6.5 | 1,908 | 80 | 1.00 / 0.57 | 3 (c2, c7, c8) | 0 | 0 | 3/8 |
| 1 | v2 | 7 | 4/12/7 | 0 | 0 | 2.3/3.6/4.9 | 1,902 | 91 | 0.83 / 0.71 | 2 (c7, c8) | 0 | 1 (phone handover) | 4/8 |
| 2 | v2 | 7 | 3/9/7 | 0 | 0 | 1.8/3.5/5.1 | 1,613 | 73 | 0.83 / 0.71 | 2 (c2, c4) | 0 | 1 (9 min pause) | 3/8 |
| 1 | v3 | 3 | 4/11/3 | 0 | 0 | 2.4/3.4/6.0 | 1,805 | 63 | 1.00 / 0.29 | 3 | 2 (restaurant call joined) | 0 | 1/8 |
| 2 | v3 | 6 | 3/9/6 | 0 | 0 | 1.6/3.0/5.2 | 1,613 | 63 | 1.00 / 0.71 | 2 | 0 | 0 | 4/8 |

Gap model decisions over all five runs: 18 asked, 4 wrong (2 wrong "new", 2 wrong joins).
Rules decided the other joins: the long gap, the same recording, and the pendant restart on
the same device.

**Splits are the weak part.** Across 5 runs, 1 of the 10 expected topic splits was found
(the neighbour, v2). One split proposal was rejected by the code check (`min_size`). There
were 0 wrong splits.

- The model rarely sets `topicChangedAt`. It adds the new people to the state instead (for
  example `people: [..., "Mr Haddad"]`).
- Design limit: after a split, the rest of that moment is updated with `allowSplit=false`.
  A call and the return from it in the same ~3 min moment (day 1, c7 and c8, 65 s apart)
  can never both be split.

**Composer.** On the synthetic days: 0 invalid answers, 0 citation retries, 0 dropped
citations. The code checks every stored citation. I read every title and summary.

- Most are faithful.
- Slips: v1 day 1 says "Priya's mother's 70th birthday" (it is Tom's mother) and titles a
  lunch "Cooking dinner". v2 day 1 says "their mother's".
- Where a split was missed, the summary faithfully covers both talks, for example
  "Export fix and Fernhill flat viewing".

## Stability

- **Same ledger:** every same-ledger re-run (5 of 5) asked **0** model calls and gave the
  identical result.
- **Fresh ledgers:** the server is **not deterministic** at `temperature 0` and `seed 0`.
  In v2 and v3 the first state call of day 1 had the same prompt (empty state, same lines,
  same system text). It gave different answers. In the third call, v2 split at the neighbour
  and v3 did not. So fresh ledgers differ run to run, whatever the prompt. Likely causes on
  the server: `--parallel 2` batching, MTP speculative decoding, `--cache-reuse`. Only the
  saved decisions make a result stable, and they do.
- The 3-fresh-run stability test was done on the real day 14 Nov (`RESULT-golden.md`), not
  on the synthetic days.

## Fixes made

1. **Thinking off** (`llm/client.py`). With thinking on, Qwen3 spent the whole `max_tokens`
   in `reasoning_content` and returned `content: null`. Seen with Qwen3-1.7B at 60 tokens and
   with Qwen3.6-35B at 400 tokens. The client now sends
   `chat_template_kwargs: {"enable_thinking": false}`; `LEDGER_LLM_THINKING=1` turns thinking
   back on. Measured on Qwen3.6-35B with thinking off: valid JSON, 17 completion tokens, 0.76 s
   on the server, 24 s wall (the server was busy). The first call took 376 s (model load).
2. **Fixed seed** (`llm/client.py`): `seed` is sent (`LEDGER_LLM_SEED`, default 0). It did not
   make the server deterministic (see Stability).
3. **Composer token budget** (`services/l2/composer.py`, `COMPOSER_MAX_TOKENS`): 500 cut 2 of
   10 composer answers mid-JSON on 14 Nov (`finish=length`, then JSONDecodeError). Full answers
   were 310-460 tokens. Now 1000.
4. **Short line refs** (`services/l2/prompts.py`, `states.py`, `composer.py`). The model now
   sees `L1`, `L2`, ... and code maps each ref back to its segment. Real segment ids are 65-79
   characters (two UUIDs and an index). On 14 Nov they cost about 1.6 characters per token,
   and the composer mis-copied them: 11 composer answers with unknown citations over 3 runs. `ref_index`
   accepts `L3`, `l3`, `3` and rejects refs that are out of range. A bad ref is still rejected
   as `unknown_segment` or `unknown_citations`.
5. **Split prompt** (`prompts.py`, `STATE_SYSTEM`): it now names concrete cases (a visitor at
   the door, a phone call, a shop assistant or waiter, a meeting that ends and a private talk
   starts) and says that TV and radio voices never start a conversation. Measured gain: 1 split
   found (v2 day 1), within the server noise. Not yet checked on golden days beyond one run.
6. **Gap prompt, tried and reverted** (v3): judging by content fixed the two wrong "new"
   decisions. It then joined a restaurant call into breakfast because the topic matched.
   Wrong joins are worse than wrong splits: the day pass can join short neighbours later, but
   nothing undoes a join. The original gap prompt is kept.

New tests: `test_llm_client.py` (thinking switch and seed in the body) and `test_l2_checks.py`
(the model sees refs, not segment ids; the ref mapping). The ledger suite: 121 passed with
`LEDGER_TEST_MONGO_URI` set.

## Recommendation

- **One model for all roles: `Qwen3.6-35B-A3B-MTP-GGUF`, thinking off.** No small model was
  measured, so I cannot say whether a small model is good enough for the state role. On this
  server a second model costs a reload on every swap, which makes the "small for state" plan
  slower than one medium model. With the model loaded:
  - gap calls take a median of 1.6-2.5 s;
  - state calls 3.0-3.7 s;
  - composer calls 4.9-6.5 s (synthetic) and 12-35 s (14 Nov, where inputs are up to
    4.2k tokens).
- The budget comment in `prompts.py` assumes 4 characters per token. That was about 2.8 on
  the synthetic days (5,221 characters gave 1,908 tokens) and about 1.6 on 14 Nov with long
  ids, before the ref fix. It is no overflow (largest prompt 4,204 tokens), but the token
  estimates in `ModelStats` are about 2x too low.

## What the real golden days must still confirm

- Whether the v2 split prompt makes wrong splits on real speech. On 14 Nov, the 3 fresh runs
  (v1 prompt) differed in exactly one model split.
- How many conversations a human would see. There is no ground truth for the golden days;
  label at least 14 Nov by hand.
- A small model for the state role, on a server that keeps two models loaded (not possible
  here).
- How splits behave when a call and its return fall in one moment.
