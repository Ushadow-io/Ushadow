# S1 result: SYNTHETIC data (not the golden days)

> **Synthetic data only.** Invented people and places (`fixtures/synthetic/3day/`, 8 conversations
> over 3 days, plus the scripted probe texts). This shows how Graphiti and this model behave, not how
> well they do on real speech. Golden-day numbers are in `RESULT-golden.md`.

**Decision question: Graphiti behind our memory port, or our own extraction on taskfacts?**

Setup: graphiti-core 0.31.2, model `Qwen3.6-35B-A3B-MTP-GGUF` (llama.cpp via Lemonade, own cluster,
thinking off through `chat_template_kwargs.enable_thinking=false`), `json_schema` structured output,
embedder `nomic-embed-text` (768) on Ollama, `SEMAPHORE_LIMIT=1`. Days 2026-02-02..04 (synthetic),
8 episodes (3 to 8 lines, 182 to 531 chars each). Run 2026-11-16.

| Criterion | Target | Measured | OK? |
|---|---|---|---|
| LLM calls per episode (median / p90) | fits budget | 5.5 / 10 (min 3, sum 46 for 8 episodes) | ok for short chats |
| Tokens per episode (in / out, median) | | 9 460 / 591 | |
| Wall time per episode (median / p90) | | 71 s / 100 s (server compute 67 s median; rest is queueing on a shared GPU) | slow but usable for batch |
| Cost per golden day | | 0 (own GPU); time is the cost | |
| Fact precision, hand check (strict / lenient) | >= 0.8 | 0.71 / 0.96 (all 24 facts: 17 y, 6 partial, 1 n) | strict NO, lenient yes |
| Recall against the ground truth (own check) | | 23 of 25 facts found | good |
| Supersede works (`invalid_at` set) | PASS | probe FAIL (model mis-dates the new fact); 3 of 3 natural cases in the 3-day run PASS | partial |
| Provenance: every fact to a source episode | PASS | PASS (24/24, and 4/4 in the probe) | yes |
| Human fix: human wins after a later conflicting episode | PASS or side table | FAIL: human fact and machine fact both stay open | side table needed |
| Erase: nothing left behind | PASS | PASS (11 derived marker hits before, 0 after; 3 LLM calls). The "undo invalidation" part was not exercised: the erased episode closed no fact | partial |
| User separation | PASS | PASS (0 leaks, 0 cross-group edges); unscoped search sees all groups | yes |
| Rebuild stability (fuzzy fact overlap @0.6) | >= ____ | 0.50 run1-in-run2, 0.57 run2-in-run1; exact 0.05; entity names 0.70; facts 24 vs 21 | LOW |

LLM calls by prompt (main 3-day ingest, 46 calls): `extract_nodes.extract_message` 8,
`extract_edges.edge` 8, `dedupe_edges.resolve_edge` 19, `dedupe_nodes.nodes` 6,
`extract_edges.extract_timestamps` 3, `extract_nodes.extract_summaries_batch` 2. Input tokens are
dominated by the prompts plus previous episodes (about 2 000 to 2 700 tokens per extraction call on
300-char chats). JSON schema failures: **0** failed attempts of 46 + 100 more (probes, rebuild); no
`finish_reason=length`, no `<think>` blocks in content, all calls returned `usage`. Embedding calls:
4 per episode (median). Facts per episode median 3 (sum 24), new entities per episode median 2 (sum 23).

Hand check (all 24 facts of run 1, against the invented transcripts):
- 1 wrong: an invented kinship relation ("Ivy is Lena's sister's child").
- 6 partial: wrong time 3 (relative "yesterday"/"next Monday"/"in April" not put into `valid_at`;
  `LIVES_IN York` valid from the call date although the move is in April), wrong target entity 1
  (deadline edge points to Postgres), odd subject 1 (the deadline itself became an entity), lost detail 1
  (who/when of the Saturday run).
- Duplicate entities: 3 pairs of 23 entities (Maya / Maya Lindqvist, Brightwater / Brightwater Labs,
  Heron / Heron migration). Abstract things become entities (schema draft, telescope, deadline).
- Missed: Jonas's sore knee (day 1), and the owner's commitment to buy a telescope. The commitment
  "Maya will send the schema draft" stays open after "I sent it": Graphiti does not link the
  fulfilment to the commitment.
- The `media` speaker line was dropped by the harness (role filter), so it produced nothing.

Supersede detail (cause found by dumping model output, synthetic only): the LLM *does* flag the
contradiction (`resolve_edge` returned `contradicted_facts: [0]` for the Acme fact, in 2 of 2 runs),
but `extract_edges.edge` gave the new facts the **previous episode's** timestamp as `valid_at`
(2026-03-02 instead of 2026-04-01). Graphiti only closes an old edge whose `valid_at` is earlier, so
nothing closed. In the 3-day run the dates were right and Maya's employer, the Heron deadline and
Jonas's race entry were all closed correctly.

What Graphiti gives us for free: entity/fact extraction with dedupe, contradiction detection,
bi-temporal edges, episode-level provenance with back-references, group scoping, `remove_episode`
that cleans derived facts and entities, hybrid search.

What we must build around it anyway: a human-decision side table that is re-applied after every
ingest (`add_triplet` does not make the human fact win), our episode id map (Graphiti uuid != ours),
quote/time-range provenance (episode only), undo of invalidations on erase (not tested here, code
says it does not), always-scoped search, a guard that checks `valid_at` against `reference_time`
(the model can copy an older timestamp and silently disable supersede), and commitment tracking.

**Decision (provisional, confidence low-medium):** Graphiti behind the memory port is viable on this
model: JSON extraction is reliable (0 schema failures) and supersede, provenance, erase and
separation work in the normal case. **Why:** the parts that fail (human wins, mis-dated facts,
rebuild instability) need our own wrapper either way, and building extraction + dedupe +
contradiction ourselves would cost more. **Against:** strict precision 0.71 and fuzzy rebuild
overlap 0.5 are weak, and the rebuild number matters for "replay is the source of truth".

What the golden-day run must still confirm: precision on real, noisy speech with unknown speaker
roles; how much media/background speech becomes facts; calls and time per episode for long
conversations (up to 14k chars); whether rebuild overlap stays this low; a 50-fact hand check by the
user. Not run here: the small-model trial (dropped by the coordinator: one model only), the reranker
(`OpenAIRerankerClient` needs `logprobs` and `max_tokens=1`; it is not used by `add_episode` or by
`search()` with the default RRF config, so it was never called).
