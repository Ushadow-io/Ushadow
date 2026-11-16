# S1: Graphiti spike harness (throw-away)

Evaluates Graphiti (`graphiti-core`) as the knowledge engine behind the memory port
(`docs/analysis/memory-system-design.md`, "L3 Memory service"; plan task S1 in
`docs/analysis/memory-system-dev-plan.md`). The code gets deleted after S1. The numbers must be honest.

## Privacy

- Golden days are private, real speech. Put them in `golden/` here (git-ignored) or outside the repo.
- The harness sends text only to the endpoints in `SPIKE_LLM_BASE_URL` / `SPIKE_EMBED_BASE_URL`.
  It does **not** fall back to `OPENAI_API_KEY`. Graphiti telemetry (PostHog) is forced off
  (`GRAPHITI_TELEMETRY_ENABLED=false`, set in `run_spike.py` before the import).
- Console output: ids and counts only. Library log messages (graphiti_core, openai, httpx, neo4j)
  are redacted, because they can quote prompts. `SPIKE_LOG_VERBOSE=1` turns this off. Use it only on
  synthetic data.
- Everything under `out/` is git-ignored. `facts_sample.csv`, `run*_facts.json` and `errors.log`
  hold real extracted facts or tracebacks. Do not share them.
- Probe evidence holds synthetic text only. Rebuild and provenance on real data print counts only.

## Pinned version and verified API (graphiti-core 0.31.2, released 2026-10-20)

Checked by reading the installed source (`.venv/lib/python3.11/site-packages/graphiti_core/`) and the
README in the wheel metadata. Line numbers are for 0.31.2.

| Fact | Where | Status |
|---|---|---|
| `add_episode(name, episode_body, source_description, reference_time, source=EpisodeType.message, group_id=None, uuid=None, ...)`. `reference_time` is required and becomes `EpisodicNode.valid_at` | `graphiti.py:1334` | verified |
| `uuid=` on `add_episode` **loads an existing episode** (`EpisodicNode.get_by_uuid`). We cannot pass our own episode id as the Graphiti uuid. The harness keeps our id in `name` and writes a map to `out/episode_map.json` | `graphiti.py:1448` | verified. The design doc assumption "we pass our own episode id" is wrong in this form |
| `group_id` must match `^[a-zA-Z0-9_-]+$`. On Neo4j, `driver.clone()` is the base no-op, so all groups share one database and `group_id` is a property filter | `helpers.py:145`, `driver/driver.py:131`, `graphiti.py:1304` | verified |
| `search(query, group_ids=None, ...)` returns `EntityEdge`. With `group_ids=None`, it searches **all** groups. The port must always pass the user's group | `graphiti.py:1913` | verified (the separation probe shows it) |
| `EntityEdge` fields: `fact, name, episodes: list[str], valid_at, invalid_at, expired_at, reference_time, attributes` | `edges.py:263` | verified |
| Supersede: an old edge gets `invalid_at = new.valid_at` and `expired_at = now` only when the LLM marks it as contradicted **and** both edges have `valid_at`, with the old one earlier. Edges with no `valid_at` from the LLM get the episode's `valid_at` | `utils/maintenance/edge_operations.py:748`, `:353` | verified in code; behaviour on our data: run the probe |
| Provenance: `edge.episodes` lists episode uuids, and `EpisodicNode.entity_edges` is the back-reference. Granularity is the whole episode: no quote, no time range | `edges.py:267`, `nodes.py:325` | verified |
| `add_triplet(source_node, edge, target_node, episode=None)` writes a given fact. It runs LLM dedupe/contradiction against existing edges, so it can close machine facts. Without `episode=`, the edge is stored with `episodes=[]` (no provenance). Edge `attributes` are stored as edge properties (`decided_by` in the probe) | `graphiti.py:2033` | verified (stub run: edge stored, `decided_by=human`, `episodes=0`) |
| `remove_episode(uuid)` deletes edges whose only source is that episode, entities that only that episode mentions, and the episode. It does **not** undo `invalid_at`/`expired_at` that the episode set on older edges. Summaries of surviving entities are rebuilt with LLM calls | `graphiti.py:2174` | verified in code; the erase probe measures it |
| OpenAI-compatible endpoints: `OpenAIGenericClient(config=LLMConfig(api_key, model, small_model, base_url), client=AsyncOpenAI, structured_output_mode='json_schema'|'json_object')`, `OpenAIEmbedder(OpenAIEmbedderConfig(embedding_model, embedding_dim, base_url), client=...)`, `OpenAIRerankerClient(config, client)` | `llm_client/openai_generic_client.py:60`, `embedder/openai.py`, README "OpenAI Compatible" | verified |
| Neo4j 5.26+, no APOC. Concurrency: `SEMAPHORE_LIMIT` env (default 10, harness default 2) | README, source grep | verified |
| `OpenAIGenericClient` does not record token usage itself. So the harness counts at the HTTP layer | `openai_generic_client.py:140` | verified |
| Number of LLM calls per episode | none | **not documented: this is what the spike measures** |

Not verified: quality on our speech, behaviour of a given local model with Graphiti's JSON
schemas, and whether `episode_metadata` on `EpisodicNode` can hold our provenance (the field exists, but
`add_episode` does not set it).

## How the measurement works

- `s1/episodes.py`: CaptureBundle (life-datatypes schema v2) to episodes. There is one episode per
  conversation in `<date>.expected.json` (accepted: a list, `{"conversations": [...]}`, or the bundle's own
  `conversations`). A segment belongs to a part when its midpoint is in the part's range on the same
  recording. The transcript is `currentTranscriptRevision`, else the newest. Speakers with role `media`
  are dropped by default. Episodes longer than 16000 characters are split at line boundaries (`#pN` ids).
  When there are no conversations, fixed 10-minute windows are used. `reference_time` is the absolute
  start of the episode's first line. TranscriptCorrections are **not** applied (they are counted).
- `s1/instrument.py`: every request from the OpenAI SDK (LLM, reranker, embedder) goes through an
  httpx client with event hooks. One response is one counted call, retries included. Tokens come from the
  endpoint's own `usage` field. Calls without `usage` are counted and reported as such, never estimated.
  "Logical" calls (Graphiti `generate_response`) are counted separately.
- Per episode: wall time of `add_episode`, LLM calls, input/output tokens, embedding calls, new facts
  (edges), new entities, existing facts closed, plus graph totals.

## Commands

Run from this folder (`memory/spike/`). You need `uv` and Docker.

```bash
# 0. Install and run the offline checks (no LLM, no Neo4j)
uv sync
uv run ruff check . && uv run pytest -q
uv run python run_spike.py episodes --bundle-dir fixtures/synthetic

# 1. Start the throw-away Neo4j (container s1-graphiti-spike-neo4j, ports 17474/17687,
#    volume s1_graphiti_spike_neo4j_data). It does not touch the shared infra Neo4j.
docker compose -f compose.yaml up -d --wait

# 2. Plumbing test with a fake local endpoint (no network, no cost; results are meaningless)
uv run python run_spike.py run --bundle-dir fixtures/synthetic --user stub-user --fresh --stub-llm --out out/stub

# 3. Configure the model endpoint (example: local Ollama)
export SPIKE_LLM_BASE_URL=http://localhost:11434/v1
export SPIKE_LLM_API_KEY=ollama
export SPIKE_LLM_MODEL=qwen2.5:14b-instruct      # use the most capable model you can run
export SPIKE_EMBED_MODEL=nomic-embed-text SPIKE_EMBED_DIM=768
# optional: SPIKE_LLM_SMALL_MODEL, SPIKE_EMBED_BASE_URL, SPIKE_EMBED_API_KEY,
#           SPIKE_STRUCTURED_OUTPUT=json_object (if the server ignores json_schema),
#           SEMAPHORE_LIMIT=2, S1_NEO4J_URI/USER/PASSWORD

# 4. Dry run on the synthetic fixture with the real model (cheap: 2 episodes + probes)
uv run python run_spike.py run --bundle-dir fixtures/synthetic --user dry --fresh --rebuild --out out/dry

# 5. Probes only (synthetic text)
uv run python run_spike.py probes --out out/probes

# 6. Real run on the golden days (private). Put <date>.bundle.json + <date>.expected.json in golden/
uv run python run_spike.py run --bundle-dir golden --user stu --fresh --rebuild \
    --price-in 0.15 --price-out 0.60          # optional: price per 1M tokens, for a cost figure
#    --days 2026-11-10 2026-11-11 to choose days; --windows to force fixed windows

# 7. Hand check: fill the correct? column (y / n / partial) in out/facts_sample.csv, then
uv run python run_spike.py precision out/facts_sample.csv

# 8. Clean up
uv run python run_spike.py reset             # wipe the spike graph
docker compose -f compose.yaml down -v       # remove the container and volume
```

Outputs in `out/`: `metrics.json`, `report.md`, `calls.json` (one row per HTTP call: kind, episode id,
prompt name, tokens, latency), `facts_sample.csv`, `episode_map.json`, `run1_facts.json`,
`run2_facts.json` (with `--rebuild`), `errors.log`.

## Cost warning

Graphiti makes several LLM calls per episode: node extraction, node dedupe, edge extraction, edge
dedupe/contradiction for **each** new edge, attributes, and summaries. The count grows with the number of
facts, and each prompt also carries previous episodes. On a hosted model, a day with many conversations
can cost real money. `--rebuild` doubles it. The probes add about 10 episodes. First run the synthetic
dry run (step 4), read `calls.json`, then decide. With a local model the cost is time: expect minutes per
episode.

## Probes

| Probe | What it does | PASS means |
|---|---|---|
| supersede | "Alice works at Acme", then 30 days later "Alice now works at Globex" | an Acme edge gets `invalid_at`/`expired_at` |
| provenance | every sampled edge: `episodes` non-empty, uuids resolve to episodes in the group, they map to our episode ids, back-reference exists | 100% traceable (granularity: episode only) |
| human_fix | episode "Carol lives in Paris", `add_triplet` "Carol lives in Lyon" (`decided_by=human`), then a later episode says Paris again | human edge stays open **and** every Paris edge is closed. FAIL = machine wins or the conflict stays open (expected; we then need the side table) |
| erase | 3 episodes, the 3rd has marker names. `remove_episode` on it, then a scan of every string property in the group for the markers, a check of facts that the erased episode closed, and of dangling refs | nothing derived from the episode remains |
| user_separation | 2 groups, scoped searches, cross-group edges | no leak. Also shows that an unscoped search sees all groups |
| rebuild | (with `--rebuild` on `run`) snapshot, clear the group, re-run the same days, compare counts, exact and fuzzy fact overlap, entity-name overlap | INFO: judge stability by the numbers |

UNCLEAR means the model did not extract the facts that the probe needs, so the test did not run. Look at
the evidence lines.

---

## Result template (1 page; copy to `docs/analysis/` when done)

**Decision question: Graphiti behind our memory port, or our own extraction on taskfacts?**

Setup: graphiti-core 0.31.2, model `____` at `____`, embedder `____`, days `____`, episodes `____`.

| Criterion | Target | Measured | OK? |
|---|---|---|---|
| LLM calls per episode (median / p90) | fits budget of ____ | ____ / ____ | |
| Tokens per episode (in / out, median) | | ____ / ____ | |
| Wall time per episode (median / p90) | < ____ s | ____ / ____ | |
| Cost per golden day | < ____ | ____ | |
| Fact precision, hand check of 50 (strict / lenient) | >= 0.8 | ____ / ____ | |
| Supersede works (`invalid_at` set) | PASS | | |
| Provenance: every fact to a source episode | PASS | | |
| Human fix: human wins after a later conflicting episode | PASS, or a side table we accept | | |
| Erase: nothing left behind | PASS | | |
| User separation | PASS | | |
| Rebuild stability (fuzzy fact overlap) | >= ____ | | |

What Graphiti gives us for free: ____

What we must build around it anyway (side table for quotes and time ranges, human-wins re-apply,
undo of invalidations on erase, our episode id map, always-scoped search): ____

**Decision:** Graphiti / own extraction on taskfacts. **Why (3 lines):** ____
