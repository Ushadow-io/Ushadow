# Memory system: development plan

Date: 2026-11-16
Design: `docs/analysis/memory-system-design.md` (the "what"). This file is the "how and in which order".
Schema: branch `schema-v2` of `Ushadow-io/life-datatypes` (commit `963eb3a`).

Sizes are estimates. S = some days. M = 1 to 2 weeks. L = more than 2 weeks. No size is measured.

## 1. Rules for the build

1. **Each milestone ends with a check on real days.** No milestone is done because the code is written. It is done when the check passes.
2. **Golden days.** We export 3 real days from Chronicle one time (14 Nov is one of them). Each layer is tested by a replay of these days. A replay must give the same result two times.
3. **The old system stays on** until milestone M4. The ledger runs beside it. We compare the two.
4. **Erase comes early.** The ledger holds private words from the first day. So erase of evidence is in M1, not at the end. Each later layer adds its part of the cascade.
5. **Chronicle core does not change.** All ledger code is in Ushadow repos.
6. **One layer per pull request group.** Each layer has a version number (`policyVersion`). A change of rules is a new version, not an edit of old records.

## 2. Checks done today

| Question from the design | Answer | Proof |
|---|---|---|
| Can Chronicle load a plugin from outside its repo? | **Yes.** It reads the `PLUGINS_DIR` environment variable | `chronicle/backend/src/backend/services/plugin_service.py:43` |
| Do the plugin events give absolute times and speaker roles? | Not checked | Task M1.3 |
| Is there a plugin event for screen items? | No. The adapter must pull them | `chronicle/backend/src/backend/plugins/events.py:13` |

So the Chronicle adapter is a folder that we mount into the Chronicle container. The fork does not change.

## 3. Two tracks

```
Track A (ledger):   M0 ─→ M1 evidence + moments ─→ M2 conversations ─┐
                                                                      ├─→ M4 read API + views ─→ M5 ─→ M6
Track B (memory):   S1 Graphiti spike ─→ M3 memory service ──────────┘
```

- Track B needs only transcripts. It does not need the ledger. So S1 can start on day 1, at the same time as M1.
- M3 needs M2 (it reads conversations) and S1 (it tells us which engine).
- M4 needs M2 and M3.

## 4. Milestones

### M0. Close the leak and make the test data (S)

| # | Task | Repo |
|---|---|---|
| 0.1 | Add the `user_id` filter in `openmemory/openmemory/api/app/services/graph_enrichment.py` | openmemory (submodule) |
| 0.2 | Script: export 3 golden days from Chronicle (recordings, segments, times, speakers) to JSON in the `CaptureBundle` shape | Ushadow `ledger/tools/` |
| 0.3 | User writes 2-3 test questions for each of G1-G4, with the expected answer (section 8 of the design) | User |
| 0.4 | Merge `schema-v2` of life-datatypes and tag `v2.0.0` so the packages publish | life-datatypes |

Done when: a second user cannot see the first user's graph data. The 3 golden days load and pass the schema check.

### S1. Graphiti spike (S, in parallel with M1)

| # | Task |
|---|---|
| S1.1 | Run Graphiti on Neo4j in a throw-away compose file |
| S1.2 | Feed the 3 golden days as episodes with the real `reference_time` |
| S1.3 | Measure: model calls per episode, cost, time, and how many facts are correct (hand check of 50 facts) |
| S1.4 | Test: does a new fact close an old one (`invalid_at`)? Can we find the source episode of each fact? Does `add_triplet` let us write a human fix? |
| S1.5 | Write the result in 1 page. Decide: Graphiti, or our own extraction on taskfacts |

Done when: the 1-page result exists and the engine is chosen. The spike code is thrown away.

### M1. Ledger service: evidence and moments (M)

| # | Task | Repo |
|---|---|---|
| 1.1 | New service `ledger`: FastAPI, own Mongo database, health route, `compose/ledger-compose.yaml` with `x-ushadow` metadata | Ushadow `ledger/` |
| 1.2 | Stores for `Recording`, `Transcript`, `TranscriptCorrection`, `CaptureGap`, `Link` (the Decision record). Code refuses an update of evidence | Ushadow `ledger/` |
| 1.3 | Chronicle adapter plugin in a mounted folder (`PLUGINS_DIR`). It posts segments to `POST /ingest`. Check that the events give absolute times; if not, read them from the Chronicle API | Ushadow `ledger/adapters/chronicle/` |
| 1.4 | Ingest is safe to repeat: the same segment two times gives one record (key = recording id + time range) | Ushadow `ledger/` |
| 1.5 | Moment cutter: code only, about 3 min, keyed on time range | Ushadow `ledger/` |
| 1.6 | Duplicate rule: two sources of the same time range become one, by a rule Decision | Ushadow `ledger/` |
| 1.7 | Erase of evidence: delete words and audio pointer, leave a `CaptureGap` with `cause: excluded` | Ushadow `ledger/` |
| 1.8 | Replay job: load a golden day, or pull old days from Chronicle | Ushadow `ledger/` |
| 1.9 | Check that the generic proxy works: `/api/services/ledger/proxy/health`. No custom route | Ushadow |

Done when:
- A live Chronicle session shows as moments in the ledger in less than 1 minute.
- A replay of a golden day two times gives the same moments.
- An erase removes the words, and a new replay does not bring them back.

### M2. Conversations (M to L)

| # | Task |
|---|---|
| 2.1 | Join rules in code: same recording, short gap, same people, same place |
| 2.2 | Gap model: a small model call only when the rules cannot decide |
| 2.3 | State update per moment, with topic split. A split must cite a real segment and needs a minimum size on each side |
| 2.4 | Each join and split is saved as a Decision with `key`, `policyVersion`, `model`, `decidedBy` |
| 2.5 | Human override: `POST /decisions` with `decidedBy: human`. A re-run keeps it |
| 2.6 | Composer: title and summary for each closed conversation, with citations |
| 2.7 | Small day pass: fix edges across the day |
| 2.8 | Compare screen or report: ledger timeline beside the Chronicle timeline for the same day |
| 2.9 | Config only: turn off the Chronicle 4 h timeline schedule, after the check passes |

Done when:
- 3 replays of 14 Nov give the same conversations (today: 8, 10 and 11).
- The user agrees with the conversation borders on the 3 golden days, or fixes them by hand, and the fixes stay after a re-run.
- The largest model input is about 1,000 tokens.

### M3. Memory service (L)

| # | Task | Repo |
|---|---|---|
| 3.1 | Memory port: `ingest`, `search`, `entity`, `correct`, `forget`, `erase`. One interface, engine behind it | Ushadow `memory/` |
| 3.2 | Engine from S1 (Graphiti on Neo4j, or our own) | Ushadow `memory/` |
| 3.3 | Queue from the ledger: each closed conversation goes to `ingest` one time (key = conversation id + revision) | Ushadow `ledger/`, `memory/` |
| 3.4 | Proof side table: each fact keeps its `EvidenceRef` (recording + time range + quote). Code checks that the quote is in the transcript | Ushadow `memory/` |
| 3.5 | Human-wins table: human fixes are saved outside the graph and applied again after each rebuild | Ushadow `memory/` |
| 3.6 | Action facts (tasks, promises, decisions) written to taskfacts in the taskfacts fact shape | Ushadow `memory/`, taskfacts |
| 3.7 | Controlled erase in taskfacts (`uf_facts` refuses delete today) | taskfacts |
| 3.8 | Erase cascade: an evidence erase removes the facts that have no other proof | Ushadow `memory/` |

Done when:
- 50 facts from the golden days are checked by hand; each one has a real quote.
- A human fix stays after a full rebuild of the graph.
- An erase of one recording removes its facts from Neo4j and from taskfacts.

### M4. Read API, views, UltraMind (M to L)

| # | Task | Repo |
|---|---|---|
| 4.1 | Read API: `context`, `resolve`, `search`, `brief`, `timeline`, `why`, `correct`, `forget` | Ushadow `ledger/` |
| 4.2 | Per-agent scopes, checked in the service | Ushadow `ledger/` |
| 4.3 | MCP server over the read API | Ushadow `ledger/` |
| 4.4 | Vector view (Qdrant) and Neo4j view, both rebuildable from the ledger | Ushadow `ledger/` |
| 4.5 | UltraMind reads the memory graph and sends each correction to `correct` | ultramind |
| 4.6 | Ushadow frontend calls the read API. Remove `routers/memories.py` mem0 read routes and `services/graph_enrichment.py` | Ushadow |
| 4.7 | `CaptureGap` in each answer when the range has a gap | Ushadow `ledger/` |

Done when:
- The user's test questions for G1, G5 and G8 give the expected answers.
- A correction in UltraMind changes the answer of `search`, and stays after a rebuild.
- An agent without scope cannot read a `private` fact.
- Then: the old memory path is turned off.

### M5. Consolidation and vault (M)

| # | Task |
|---|---|
| 5.1 | Consolidation job: merge duplicates, close old facts. 2 verifiers must agree. Each change is a Decision with undo |
| 5.2 | Vault view: Markdown files made from the ledger |
| 5.3 | Vault read-back: an edit in the vault becomes a human Decision |
| 5.4 | Backups: erase must also remove data from backups, or the backup has an end date |

Done when: the test questions for G7 and G10 pass. An undo of a merge gives back the 2 facts.

### M6. Tasks, anticipation, more sources (L)

| # | Task | Repo |
|---|---|---|
| 6.1 | taskfacts rulebook for the task board and the Today list | taskfacts, Ushadow |
| 6.2 | Anticipation as obligations: calendar event soon, promise due, known person starts to talk. Action: call `brief` | Ushadow |
| 6.3 | Coding-session source (`agent_session`), with secrets removed before storage | Ushadow `ledger/adapters/` |
| 6.4 | Mycelia adapter and Omi adapter | Ushadow `ledger/adapters/` |

Done when: the test questions for G2, G3, G4 and G12 pass.

## 5. Where the code lives

Recommended: in the Ushadow repo, as two top-level folders with their own Dockerfile and compose file.

```
Ushadow/
  ledger/            L0-L2, L5-L6. Own pyproject, own image
    adapters/chronicle/   the mounted plugin folder
    tools/                golden-day export, replay
  memory/            L3-L4. Own pyproject, own image. Talks to the ledger by HTTP only
  compose/ledger-compose.yaml
  compose/memory-compose.yaml
```

The two services do not import each other. So each one can move to its own repo later with no code change.

## 6. What is not in this plan

- Photos as a source.
- A move of Chronicle chat to the new memory (optional thin provider behind `MemoryServiceBase`).
- Sharing memory between users.

## 7. Decisions needed before the start

1. **Where the code lives.** Folders in the Ushadow repo (recommended; one deploy flow, one pull request flow) or two new repos (cleaner borders, more setup).
2. **Start order.** M0 + S1 + M1 together (recommended) or S1 first and wait for the result.
3. The user writes the test questions (task 0.3). M2 can start without them. M4 cannot end without them.

## 8. First 5 tasks

1. 0.1 leak fix.
2. 0.2 golden-day export.
3. 1.1 ledger service skeleton + compose file.
4. 1.3 Chronicle adapter, with the check of times in the events.
5. S1.1 Graphiti in a throw-away compose file.

## 9. Findings from the first build wave (2026-11-16)

Built on branch `feat/ledger-memory`: ledger core (M1), Chronicle adapter (1.3), golden-day export tool (0.2), Graphiti spike harness (S1). The leak fix (0.1) is on branch `fix/graph-enrichment-user-filter` of the `openmemory` submodule.

| Finding | Effect |
|---|---|
| Chronicle events give seconds from the conversation start, not clock time, and no speaker role | The adapter reads the time in-process: `Conversation.audio_ranges`, or `claim_capture_window` for live speech (`chronicle/backend/src/backend/services/audio_claims.py:439`). If the time cannot be proven, it sends nothing |
| Chronicle sends a live transcript, then processes the audio again at close | Revision `live` is a draft: it can grow and change until a final revision exists. Then it is frozen. This is the one named exception to "evidence is never overwritten" |
| `Transcript` has no draft/final field; `CaptureBundle` has no owner; `Recording` has no audio pointer; `CaptureGap` has no `recordingId` | Schema gaps. For now: revision id `live`, an ingest envelope `{userId, bundle}`, and a ledger-only `Erasure` record |
| Graphiti `add_episode(uuid=...)` loads an existing episode | We cannot use our id as the Graphiti id. Keep a map: our episode id ↔ Graphiti id. (The design doc assumed we could.) |
| Graphiti `search` with no `group_ids` searches all users | The memory port must always pass the user's group |
| Graphiti telemetry is on by default | Turn it off in the spike and in the service |
| Graphiti `remove_episode` does not reopen older facts that the episode closed | Our erase must do that step |
| The leak fix filters on `user_id`, but Chronicle writes all users under one shared id | The leak is closed only for users with their own id. The full fix is the ledger |
| The root `.gitignore` ignores `tests/` | `ledger/.gitignore` and `memory/.gitignore` turn that rule off |

Not done yet: a real golden-day export, a spike run with a real model, the adapter against a running Chronicle, the adapter and the ledger together over HTTP, the generic proxy check (1.9), auth on the ledger routes.
