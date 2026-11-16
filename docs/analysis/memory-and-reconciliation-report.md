# Memory and day reconciliation: analysis

Status: analysis, not a decision. Written 2026-11-16. Human-readable version:
https://claude.ai/artifact/Qqv8RZVbLSKxJzwssgiaNJ (version 7).

Audience: agents working on Chronicle timeline/episodes, the mem0 fork, Ushadow
memory surfaces, or the `life-datatypes` schema. Every claim has a code reference.
Verify each reference before you act on it. The code changes.

Repo roots used below:

| Name | Path | Notes |
|---|---|---|
| Chronicle | `chronicle/` (submodule) | Python paths are under `chronicle/backend/src/backend/` |
| Mycelia | `mycelia/` (submodule) | TypeScript workers in `mycelia/backend/workers/` |
| mem0 fork | `openmemory/` (submodule, `Ushadow-io/mem0`) | API is in `openmemory/openmemory/api/app/` |
| Omi fork | `../omi` (self-hosted fork, commit `693dd8820a`) | Python backend is in `../omi/backend/` |
| Ushadow | `ushadow/backend/src/` | |
| life-datatypes | `Ushadow-io/life-datatypes`, branch `schema-v2` (not pushed) | `schema/conversation.json` v2.0.0 |

## 1. Problem

Capture units (recordings) are not events (conversations or episodes):

- One conversation can pause and continue, so it spans several recordings.
- One recording can hold the end of one conversation and the start of the next.
- The same moment can be captured twice. Examples: a double upload, or 2 devices.

Retries must not lose progress. Joins and splits must be decided once, saved, and
not decided again on every run.

## 2. Goals of the storage system

Status: draft. Goals 1-4 come from the user. Goals 5-12 are proposed and not yet agreed.

Every design choice in this document must serve at least one goal. Goals 5, 10 and
11 are the base: without proof, control and honest gaps, goals 1-4 cannot be trusted.

| # | Goal | Example test question | What the store must hold |
|---|---|---|---|
| 1 | **Context and references.** When the user talks to the AI, it understands the context the user is in and the references the user makes. | "What did he mean about the venue?" The AI resolves "he" and "the venue" from the current episode. | Current episode state, participants, recent entities |
| 2 | **Projects and tasks.** When the user talks about a project or a task, the AI knows what it is, and can organise projects. | "Add this to the launch plan." The AI finds the right project and its open tasks. | Project and task entities, linked to the episodes and facts they came from |
| 3 | **Context for later tasks.** If the AI does a task, it knows the user's needs and the task context, even when the task is done later. | Two days later: "Book the venue." The AI uses the budget limit and dates agreed in the meeting. | Decisions, constraints and preferences, with sources, linked to the task |
| 4 | **Anticipate.** An agent anticipates needs. It can act, or surface useful information. | Before a meeting with Alex, the AI shows the open budget question without being asked. | Calendar, commitments, open questions, interests |
| 5 | **Exact recall with proof.** Each answer shows where it came from. | "What did Alex say about paid ads?" The AI gives the quote, the time and the recording. | Facts that keep their segment ids (see §5, §7 defects) |
| 6 | **People and promises.** The AI knows who each person is, how they relate to the user, when they last talked, and what each side promised. | "What do I owe Alex?" | Person entities, `Participant` to `personId` mapping, commitments with direction |
| 7 | **Now vs before.** A fact can stop being true. The AI keeps the old fact with the date it changed, and does not mix the two. | "Where do I live?" after a move. | Versioned facts with valid-from and valid-to dates, `superseded_by` (as in Omi §6.2) |
| 8 | **Briefings.** A short page before a meeting, or when the user restarts a project: last talk, open items, decisions. | "Brief me on the launch." | Episodes + facts + tasks per project and per person |
| 9 | **Patterns and review.** Where time goes, habits, mood and health, over weeks and months. | "How much time did I spend in meetings this month?" | Episodes with absolute times, categories, and capture-gap records |
| 10 | **User control.** The user can see why the AI knows something, and can correct it or make it forget. Sensitive topics stay private. Bystanders are not profiled. Human corrections always win. | "Forget everything about the dentist." | Provenance on every fact, `decidedBy: human`, sensitivity class, per-agent access |
| 11 | **Honest gaps.** The AI knows where it has no data, and says "I don't know" instead of guessing. | "What did I do on Tuesday afternoon?" when the pendant was off. | `CaptureGap` records that separate "not recorded" from "recorded, nothing happened" |
| 12 | **One memory for many agents.** Chronicle, Mycelia, Hermes and coding agents read and write one shared format, with access controlled for each agent. | A coding agent and the chat assistant both know the same project decision. | `life-datatypes` as the contract; per-agent scopes (see §8, §9) |

Next step (recommended): for each goal, write 2-3 test questions from real days,
with the expected answer. Use them to evaluate each design option in §11.

## 3. Chronicle today: explicit day reconciliation

**Trigger:** "Start analysis" on the Timeline page, or the 4 h schedule.

**Job:**
- One RQ job, `timeline-explicit_<request_id>`, on queue `default`.
- `job_timeout` = 2700 s.
- Retry: 2 tries, after 30 s, then 300 s.
- Code: `workers/timeline_jobs.py`, `services/timeline/executor.py`.

**Stages:**

| # | Stage | What it does | Notes |
|---|---|---|---|
| 1 | Photos | Inspects Immich photos | Does nothing without Immich |
| 2 | Evidence | Runs `assemble_day_evidence` (`services/timeline/evidence.py`), then leases the `DirtyEvidenceRange` | Each transcript block gets start and end anchors |
| 3 | Context | Was meant to shorten large evidence blocks | **Never runs.** `_prepare_context_workspace` (`services/timeline/pi_executor.py:994`) has no caller |
| 4 | Separation (Pi) | Decides the episode edges, which must cite real anchors | Checked by Chronicle, repair loop on failure |
| 5 | Interpretation (Pi) | Adds title, summary, people, importance and speaker roles (for example `media_content`) | Claims are checked against evidence |
| 6 | Publication | Writes the episodes, then switches `timeline_days.active_run_id` last | Hand edits are kept |
| + | Day memory | The memory agent writes `Daily/<date>.md` once (`timeline_days.memory_state`) | Runs later |

**Pi runtime:**
- `pi_tasks.run_task` (`services/timeline/pi_tasks.py`) runs an investigation harness.
- Its tools are `read_material`, `search_material` and `finish_task`.
- The timeout is `DEFAULT_TIMEOUT_SECONDS = 900` (`services/memory/agent/pi_agent.py:86`).
- Saved state is in `/app/data/inference_artifacts/timeline-investigations/<canonical_hash(request)>/`. It holds `active.jsonl`, `checkpoint.json`, `budget.json`, `events-*.jsonl` and `owner.lock`.
- Finished stages are cached in `pi_timeline_separation/` and `pi_timeline_interpretation/`.

**What Pi can read** (built in memory when stages 4 and 5 start; not stored in Mongo):

| File | Content | Size for 14 Nov (chars) |
|---|---|---|
| `task.json` | manifest + evidence (28 blocks) + anchors (56) + windows (10 × 20 min) + task | 117,613 (evidence 93,774 · anchors 19,810 · windows 3,453 · task 157) |
| `windows/0000-0009.json` | **The same evidence again**, at most 30,000 chars per window | copy |
| `anchors.json` | **The same anchors again** | copy |
| `windows/index.json`, `manifest.json`, `source-index.json` | Indexes | small |
| `draft.json` | Added only after a rejection | — |

**Storage by stage:**

| Stage | Mongo reads | Mongo writes | Redis / disk |
|---|---|---|---|
| Start | — | `timeline_reconciliation_requests` (queued), `dirty_evidence_ranges` | RQ job |
| Evidence | `conversations`, `audio_chunks`, `audio_evidence_spans`, `device_input_items`, `manual_memories`, `timeline_episodes` | `dirty_evidence_ranges` (leased) | temp dir `chronicle-reconcile-*` |
| Pi stages | — | — | Pi session and cache dirs |
| Publish | — | `timeline_episodes`, `timeline_analysis_runs`, `timeline_publication_journals`, `timeline_days` | temp dir deleted |
| Error | — | request back to queued with `last_error`; range unleased | RQ retry |

Progress is stored only in RQ `job.meta["progress"]`, in Redis. A Redis restart or a
cancel loses the activity list.

### 3.1 Failure on 14 Nov 2026 (root causes)

Input: about 75 min of Omi audio in 6 blocks, 07:10 to 11:44.

1. Pi gets `task.json` inline only if it is ≤ 5,000 chars (`pi_tasks.py:1059`). Here it was 117,613 chars.
2. Read size is 4,000 chars by default and 8,000 at most (`pi_tasks.py:851`, `:220`). Pi made about 30 reads, which took about 10 min.
3. Each text is given 3 times: `task.json`, the window files and `anchors.json`.
4. Writing the answer took about 6 min. One anchor was wrong. The 900 s limit was reached with 23 s left.
5. Try 3 got a new investigation id and started from zero. The retry did not resume.
6. Stage 3 (condenser) never runs.
7. Results were not stable across runs: 8, then 10, then 11 episodes. Episode links break.

The model context window is 131,072 tokens. The 14 Nov day is about 30,000 tokens, so it fits.

Why upstream works this way:
- `docs/backend/rolling-reconciliation.md` (accepted, Pass A) describes dirty ranges with context expansion.
- `docs/backend/memory-segmentation-storage.md` describes a condenser and direct context. It is out of date.
- Commit `e5d5a165` (22 Sep 2026) moved to `pi_tasks.run_task` and removed the condenser call. It gives no reason.

### 3.2 Chronicle per-conversation path (B)

- Steps: recording closes → transcript → short summary (1 call) → detailed summary (1 call) → `Conversations/<id>.md`.
- Code: `workers/conversation_jobs.py`.
- Continuous capture skips the memory write. Day memory owns it.

**Recording cuts:**
- Omi and streaming end on any of these:
  - `speech_inactivity_threshold: 60` s
  - user stop
  - the button
  - disconnect
  - 24 h
- ScreenPipe only: `_MAX_WINDOW` 2 h and `_TARGET_SESSION` 30 min, cut at the quietest point (`device_audio_ingest.py`).

| | A: day reconciliation | B: per conversation |
|---|---|---|
| Edges from | Meaning | Capture cuts |
| Sees | The whole day: audio, screen, photos, gaps | 1 transcript |
| Claims checked | Yes (anchors, evidence) | No |
| TV / media | Labelled `media_content` | Can become facts about you |
| Memory duplicates | Once per day | Once per window |
| Latency | 4 h or on demand; 15+ min per run | Minutes |
| Failure scope | The whole day | 1 recording |
| Stable | No | Yes |
| Model needed | Strong | Small |

## 4. Mycelia

Files:
- `mycelia/backend/workers/conversationChunkCreator.ts`
- `mycelia/backend/workers/conversationExtractor.ts`
- `mycelia/app/lib/jobs/trigger-config.ts`
- `docs/DATABASE.md`

**Pipeline:**
1. **Chunking.** Code only, no AI. Runs every 30 s.
   - Transcriptions are added to a chunk in time order.
   - Adaptive gap rule (based on the chars in the chunk so far):
     - ≤ 100 chars: no limit
     - < 500 chars: 45 min
     - < 20,000 chars: 5 min
     - otherwise: 40 s
   - Live mode: one open chunk per `original_id`. It is finalized after 60 s with no new transcripts.
   - Backfill: batches of 100.
   - Each transcription gets a `chunk_id`.
   - Chunk states: `open | ready | processing | completed | error | empty`.
   - `chunkKey` = hash(policyVersion, start, end).
2. **Extraction.** Runs every 300 s.
   - It claims a chunk atomically (`ready → processing`).
   - Input: plain text with `[time:]` marks, and `[silence Xm Ys]` for gaps over 30 s. **No speaker labels.**
   - LLM call 1 returns segments `{title, start, end}`. They are clipped to the chunk, and segments with no utterances are dropped.
   - LLM call 2, per conversation: entities, emoji, `agreed_upon_something`.
   - Then `deleteConversationsInRange`, and it creates `objects` with `isConversation` and `timeRanges[]`, plus entity relations.
   - `extractionKey` = hash(chunkId, promptVersion, model, extractorVersion).

**Borrow:**
- work units with saved state and a key
- a density-based join rule
- short plain-text input
- 2 small calls
- `timeRanges[]`

**Avoid:**
- no speaker labels in the AI input
- AI times not checked against evidence
- chunk edges are final (no join across chunks)
- the 45 min sparse join can merge unrelated remarks
- replace-by-range deletes hand edits
- no duplicate check, no screen activity

## 5. mem0 fork (OpenMemory)

**Deployment:**
- Deploy `mem0-api` in namespace `chakra-3eye`, image `anubis:32000/mem0:v1.0.8-expansion-fix`.
- Chronicle stopped writing to it in about July 2026 (Chronicle commit `07e194ee`). Chronicle has one memory provider now: the Markdown vault (`services/memory/service_factory.py`).
- Ushadow still reads from it (`ushadow/backend/src/routers/memories.py`).

**Add flow** (`POST /api/v1/memories`; `controllers/memory_controller.py`):
1. Saves a placeholder row in state `processing` (Postgres/SQLite, `DATABASE_URL`). The request metadata is stored on this row only.
2. Starts the work with `asyncio.create_task`, inside the API process. There is no retry.
3. mem0 `add()` (`openmemory/mem0/memory/main.py`):
   - LLM call 1 extracts facts. The fork changed the prompt to plain `Input:` text.
   - Prompts can be edited in the UI. They are stored in the DB (`utils/memory.py:411-423`).
4. For each fact, it does a vector search for the top 5 (`limit=5`, Qdrant). LLM call 2 then returns `ADD | UPDATE | DELETE | NONE`.
5. Fork only: one LLM call per ADD or UPDATE fact adds `timeRanges` and `entities` (`services/temporal_service.py`). With `MYCELIA_MODE=true` it also adds `isEvent`, `isPerson`, `isPromise` and `emoji`.
6. It applies the events and writes history rows. The first ADD takes over the placeholder. The placeholder is deleted if nothing is new.

**Defects:**
- Relative times are read against `datetime.now()` (`temporal_service.py:134`), not the recording time.
- mem0 gets only `{"source_app","mcp_client"}` as metadata (`memory_controller.py:212`). So Qdrant facts do not point back to a recording or segment.
- No speaker roles.
- Work is lost on restart, and nothing retries it.
- At least 3 LLM calls per request, plus 1 per new fact.

mem0 is a fact store that runs after conversations exist. It does not make episodes.

## 6. Omi fork

Files:
- `../omi/backend/utils/episodes/ARCHITECTURE.md`
- `../omi/backend/utils/conversations/ARCHITECTURE.md`
- `../omi/backend/docs/canonical_memory_architecture.md`
- `../omi/backend/docs/runbooks/dream-agent.md`

### 6.1 Segmentation

**Conversations:**
- A conversation ends after 120 s of silence.
  - Constants: `config/recorded_time_tolerances.py:6-8`: `CONTINUE_GAP_SECONDS=120`, `CLOSE_GAP_SECONDS=1800`, `MAX_EPISODE_SECONDS=14400`.
  - The user can raise the timeout, but not lower it below 120 s (`utils/transcribe_decisions.py:161-167`).
  - A calendar meeting extends it to the meeting end plus 120 s (`models/conversation_continuity.py:73-104`).

**Smart merge:**
- A small classifier ("Jev", `config/jev_decisions.py`) decides it.
- It applies only to pendant conversations from the same device.
- The gap must be from 120 s to 1 h, with at least 25 words on each side.
- It merges when P(same) ≥ 0.35. The merged span is capped at 3 h, 4,000 segments.
- Code: `config/conversation_smart_merge.py`.
- The survivor keeps its id. The donor becomes a tombstone. **This changes the stored conversations.**

**Topic splitting:** none.

**Moments:**
- A moment ends on a 45 s pause, 600 words or 180 s (`config/episodes.py:199-203`).
- A moment is the work unit.

**Episodes** are an overlay. They "never rewrite, merge or delete a conversation, and never write a task or a memory" (`utils/episodes/ARCHITECTURE.md:6-8`).
- Deterministic close: the 4 h cap, a gap of ≥ 30 min, or 2 different calendar events.
- Ask Jev: a gap of ≥ 120 s, or a device change. It closes only if P(same) < 0.2 (`config/episodes.py:238`).
- Per moment: gpt-5-nano updates a compact state of at most 2,400 chars. It sees the state plus the new text only. It does not see the whole day.
- After close: 1 composer call writes the title, lede, follow-ups, people and 1-8 chapters (`utils/episodes/composer.py`).
- Idempotent:
  - compare-and-swap store
  - content-revision receipts
  - composer fingerprint + 150 s lease
  - back-off at 10/20/40 min
  - restart recovery

  Caveat: the deferred queue is process-local.

**Late audio:**
- It uses the same 120 s rule and joins in either direction (`utils/sync/ARCHITECTURE.md:42-52`).
- With no covering episode, it creates a closed historical episode at the recorded times.

### 6.2 Memories

- **Relevance gate:** user restore > rules > Jev (discard if P ≥ 0.80) > LLM. A calendar overlap overrides a discard.
- **Owner gate (fork only):** no memories unless the owner said ≥ 20 words (`utils/conversations/owner_memory_gate.py:31`).
- **Extraction:**
  - At most 32 items per conversation.
  - Each item needs a quote and an `about` subject. No to-dos, no plots.
  - The last 8 rejections are given as negative examples.
  - Code: `utils/llm/working_observations.py:297-342`.
- **Intake routing:** promote, archive, review or reject. The model is told not to merge or supersede at intake (`utils/memory/canonical_consolidation.py:615-650`).
- **Dream** (`docs/runbooks/dream-agent.md`):
  - An agentic cleanup that runs every 30 min for owners with queued work, and at least every 24 h.
  - It can merge, retire or supersede memories, merge conversations and fix titles.
  - 2 independent verifier calls must agree.
  - Every edit is journaled, with a 30-day Undo.
- **Memory items:** versioned. Evidence holds `conversation_id` and `quote_refs` (`models/memory_evidence.py:108-129`).
- **Speakers:**
  - The prompt uses cluster-key renders and no "Speaker N" labels (`utils/conversations/transcript_for_llm.py`).
  - Owner attribution is fail-closed: the owner must be exactly one cluster.
  - TV and media are classified as `media`.
- **Daily recap:** built from titles, overviews and action items, not from transcripts. Sent at 22:00 local.
- **Weak points:**
  - very complex
  - transcript times relative to the conversation start
  - smart merge changes the evidence
  - no topic splitting

## 7. Ushadow memory surfaces

| Path | When | Behaviour | Use |
|---|---|---|---|
| mem0 add | write | Sees only the new text, then the top 5 similar facts | Making memories |
| `POST /api/v1/memories/filter/enriched`, `GET /entity/{name}` (`services/graph_enrichment.py`) | read | Finds names (capitalised-word regex + `metadata.entities`) and looks up Neo4j nodes and relations | Context for an LLM that searches memories |
| `GET /{memory_id}/related` (fork `routers/memories.py:683`) | read | Same-category memories, size 5. Entities are not used | Memory detail page |
| `ushadow/backend/src/services/interest_extractor.py` | read | Categories + typed entities become hashtags. Private categories are excluded | Feed (Mastodon) |
| `ushadow/backend/src/services/interest_scorer.py` | read | Merges feed scores with `/api/v1/graph/interests` | Feed ranking |
| `GET /memories/interests` (`ushadow/backend/src/routers/memories.py:387`) | read | Reads `metadata.interests` | Interest profile |

**Defects:**
- **Cross-user leak (security).** The Neo4j queries in `graph_enrichment.py` match `toLower(e.name)` with no `user_id` filter, on both the entity query and the relationship query.
- **`metadata.interests` is never written.** It exists only in `openmemory/openmemory/INTEREST_EXTRACTION.md`. So `GET /memories/interests` returns empty data.
- **`/api/v1/graph/interests` is missing.** It is not in any branch of the local `openmemory` clone. The deployed image may have it from code that is not in the repo.
- **Entities are used only on read.** The fact finder never gets known entity facts.

**Proposal: inject known entity facts into extraction.**
1. Before extraction, resolve the known names in the text.
2. Fetch the top 3 facts per name, filtered by `user_id`.
3. Add them to the prompt as "already known, do not repeat".

The cost is 1 search and no extra LLM call. Fix the leak first.

## 8. Storage options

| Store | Good at | Bad at | Used by |
|---|---|---|---|
| MongoDB | Nested, changing records: recordings, segments, episodes | Cross-collection joins and strict rules | Chronicle, Mycelia, Omi fork (`database/mongo_firestore.py`) |
| Postgres / SQLite | Strict records, history, permissions, transactions | Free-form nested data; migrations | mem0 fork |
| Neo4j | Relationship traversal | Exact text and time. Identity: the same name becomes many nodes. Needs a user filter on every query | mem0 fork, Ushadow interests |
| Vector DB (Qdrant / Pinecone / Typesense) | Semantic search | Exact facts. Changes when the embedding model changes. Not a source of truth | mem0 fork (Qdrant), Omi (Pinecone, Typesense) |
| Markdown vault (Obsidian) | Humans can read and edit it; wikilinks; an agent can grep it | Cross-page queries; 2 writers at once (`services/memory/vault_lock.py`, Syncthing audit); no schema | Chronicle memory |
| Redis | Jobs, streams, locks, progress | Anything that must survive (it ran out of memory on 2026-11-15) | Chronicle |

**Rule:**
1. Keep evidence and decisions (Links, episodes, sourced facts) in one source of truth: Mongo or Postgres.
2. The vector DB, the graph and the vault are derived indexes or views. They can be rebuilt.
3. Human edits in a view are saved back as `decidedBy: human` records. If they are not, a rebuild deletes them.

## 9. Coding context with the same method

| Life capture | Coding |
|---|---|
| Recording | An agent session transcript (`~/.claude/projects/*/<session>.jsonl`), a terminal log, a CI run |
| Segment | A message or tool call |
| Cut reason | Context limit, user quit, crash, new day |
| Link `continues` | Same branch, PR or issue, or a summary hand-over |
| Episode | One task, from the request to the commit |
| Entity | Repo, service, file, module, person, ticket |
| Sourced fact | Decision, rule or known issue, with a `file:line`, a commit or a message id |
| Screen observation | Files opened, commands run, pages read |

**The same:**
- Inject known facts at the start. `CLAUDE.md` and `MEMORY.md` already do this in a simple form. Scope them to the entities the task touches.
- Work in small units with saved state.
- Consolidate later, in a checked job.

**Different:**
- The code is its own truth. Store the *why* (decisions, rejected options, user rules), not the code structure.
- Facts go stale fast. Each fact keeps the commit it was true at. Verify it before use.
- Joins are mostly deterministic, from ids, branches and PRs.
- Logs contain secrets. Redact them before storage.

## 10. Comparison

| | Chronicle (A) | Mycelia | mem0 fork | Omi |
|---|---|---|---|---|
| Work unit | Whole day | Chunk | 1 request | Moment |
| Join rule | Pi decides each run | Gap rule by text density | None | Rules, then a classifier for 2-30 min gaps |
| Progress kept on retry | No | Yes | No | Yes |
| Speakers in AI input | Yes | No | No | Yes, fail-closed owner |
| Changes the evidence | No | Replaces its own output | n/a | Episodes no; smart merge yes |
| Memory merge | Day note in vault | None | At intake (ADD/UPDATE/DELETE) | Later (Dream), double-verified, undoable |

## 11. Recommendations (ordered)

1. **Inline `task.json` when it fits.** Change the 5,000-char rule (`pi_tasks.py:1059`) so that it uses the model's context window.
2. **Size reads by model.** Replace the fixed 4,000/8,000-char read limits (`pi_tasks.py:851`, `:220`).
3. **Resume on retry.** Use a stable investigation id for the same day and the same evidence revision.
4. **Persist progress.** Report each tool call or step, outside Redis-only `job.meta`.
5. **Work units (from Mycelia).**
   - Make chunks with a density-based gap rule and saved state and keys.
   - Keep speaker labels and roles in the AI input.
   - Check times against evidence.
   - Store each join as a `Link`.
6. **mem0 merge step for memory only.**
   - Use ADD/UPDATE/DELETE with history.
   - Resolve relative times against the recording time.
   - Keep segment ids on each fact.
7. **Omi episode layer as the main model.**
   - Process one moment at a time, with a compact saved state per episode.
   - Close on deterministic rules: 30 min gap, 4 h cap, calendar.
   - Ask a small model only for 2-30 min gaps, and save each answer as a `Link`.
   - Never change the conversations.
   - Consolidate memory later, in a checked, undoable job.
8. **Entity injection and the graph leak.**
   - Add a `user_id` filter to every Neo4j query in `graph_enrichment.py`.
   - Inject known entity facts into extraction.
   - Delete or rebuild the `metadata.interests` path.

## 12. Mapping to life-datatypes v2

| v2 type | Chronicle | Mycelia | Omi |
|---|---|---|---|
| `Recording` + `Segment` (absolute UTC) | `conversations` + transcript revisions; times from `audio_chunks.captured_at` | `transcriptions` (relative times) | `conversations.transcript_segments` (relative times) |
| `Speaker` (label + role) | Speaker names; `media_content` role in the timeline | `diarizations` (not used for chunking) | `speaker_id`, `is_user`, `person_id`; `media` class |
| Work unit | Whole day (dirty range) | `conversation_chunks` | Moment |
| `Link` (continues, duplicate_of) | Not stored | Implied inside a chunk | `episode_links`; smart-merge tombstone |
| `Conversation.parts` | `timeline_episodes.audio_ranges` | `objects.timeRanges` | Episodes over conversations |
| `ScreenObservation` | `device_input_items` (ScreenPipe) | None | Screen activity (`database/screen_activity.py`) |

**Gap in v2:** `Conversation` has no `entities` field. Both Mycelia and Omi produce entities.

## 13. Open items

- **Goals (§2): goals 5-12 not yet agreed by the user.**
- **Next step: pending a user choice.** Either write 2-3 real test questions per goal in §2 (recommended), or the episode design doc `docs/backend/timeline-episodes.md` in Chronicle.
- **Data issues not investigated:**
  - stuck session `8431f8-omi-381cf897…`: about 48 min on 7 Nov, 19:24-20:12, is not in Mongo
  - duplicate conversations `3397ae69` / `64df4755`
  - the 0:00-0:00 "leased" coverage interval
- **Uncommitted:**
  - the Chronicle Redis stream leak fix
  - life-datatypes `schema-v2`
