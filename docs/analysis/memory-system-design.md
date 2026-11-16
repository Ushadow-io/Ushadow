# Memory system design: the Ledger model

Status: proposal, not agreed. Written 2026-11-16.
Based on: `docs/analysis/memory-and-reconciliation-report.md` (the "report").
Goal numbers (G1-G12) and section numbers (§) refer to the report.

## 1. Summary

No existing system fits all 12 goals. Each one has a part that works.
This design takes those parts and puts them on one new base.

The base is a **ledger**. A ledger is a list of records that you add to and do not rewrite.

Five rules:

1. **Evidence is never overwritten.** The audio is written once. A transcript can be corrected, but as a new version. The old version stays. New evidence can arrive late and is added.
2. **Each decision is a record.** A join, a split, a duplicate or a merge is saved with who decided it. It is not decided again.
3. **Human decisions always win.**
4. **All other data is an overlay.** An overlay is data that is built from the ledger and can be built again. Episodes, facts, entities, the vector index, the graph and the vault are overlays.
5. **Work is done in small units.** Each unit has a key and a saved state. A retry continues. It does not start again.

What comes from where:

| Part | Source | Why |
|---|---|---|
| Moment as the work unit; episode as an overlay; compact episode state; deterministic close rules; small model only for unclear gaps | Omi (§6.1) | Stable, cheap, keeps progress |
| Keys and states on each work unit; plain-text input | Mycelia (§4) | Idempotent (a second run gives the same result) |
| Anchors: each claim must cite real evidence, checked by code | Chronicle A (§3) | Proof (G5) |
| Vault as the human view | Chronicle | Humans can read and edit it |
| ADD / UPDATE / NONE fact merge with history | mem0 (§5) | Now vs before (G7) |
| Consolidation later, 2 verifiers, journal, undo | Omi Dream (§6.2) | Safe merges (G10) |
| Topic split inside one recording | **New** | Omi has none; §1 needs it |
| Decision records for all joins and splits | **New** (report `Link`, made general) | Decide once (§1) |
| Capture gaps, suppression, per-agent scopes | **New** | G10, G11, G12 |

**We take the methods, not the apps.** The table shows where each idea comes from. We build each idea ourselves in the `ledger` service. We do not run Omi, Mycelia or mem0 to get it.

| Must run | Why |
|---|---|
| One capture app (Chronicle today) | It records and transcribes. The ledger does not do this |
| `ledger` service (new) | All of L0-L6 |
| MongoDB | Evidence, moments, episodes |
| Memory service (new, thin) + Graphiti library | Knowledge facts. Graphiti is a library inside our service, not one more app |
| Neo4j + UltraMind | The knowledge graph and the correction screen |
| taskfacts hub + Postgres | Action facts, boards, Today |
| Qdrant | Maybe not needed: Graphiti keeps its vectors in Neo4j. Decide after the spike |

| Not needed for memory | Note |
|---|---|
| mem0 API (`mem0-api`) | Can be turned off after phase 4 |
| Omi backend | Only if you want it as a second capture app |
| Mycelia | Only if you want it as a second capture app |

What stops:

- Whole-day Pi reconciliation as the thing that decides episode edges.
- mem0 as a writer. Qdrant stays as an index.
- Neo4j as the place where facts are made. Neo4j stays as a view that is built from the ledger. UltraMind is the screen that shows it and corrects it.

## 2. Layers

```
L6  Read API (Ushadow)      context · recall · brief · gaps · forget   → MCP for all agents
L5  Views (rebuildable)     vector index · graph edges · Markdown vault
L4  Consolidation           merge / supersede facts and entities; checked; undoable
L3  Facts and entities      sourced claims; people, projects, tasks
L2  Episodes                overlay on moments; joins and splits are Decisions
L1  Moments                 work unit; cut by code only
L0  Evidence                Recording · Segment · ScreenObservation · CalendarEvent · CaptureGap
```

Data goes up only. A layer never changes a layer below it.

### L0 Evidence

- Types: `Recording`, `Segment`, `Speaker`, `ScreenObservation`, `CalendarEvent`, `Photo` (life-datatypes v2).
- All times are absolute UTC. This corrects the relative-time defects in §5 and §6.
- Each segment keeps its speaker label and role (`owner`, `participant`, `media`, `background`, `unknown`).
- `CaptureGap` is in v2. Code makes it from device heartbeats. It has a `cause`: `device_offline`, `disconnected`, `paused`, `excluded`, `not_recording`, `unknown`. "Not recorded" and "recorded, nothing happened" are different records (G11).
- Duplicates: code compares overlapping absolute times and text. It writes a `duplicate_of` Decision. No segment is deleted.

**Erase (privacy).** "Evidence does not change" is a rule for the pipeline. It is not a rule against the user. The user can erase.

- `erase(selector)` removes the text and the audio reference of the selected segments. This is a real delete, not a hidden flag.
- An empty marker stays: `{segmentId, erased: true, erasedAt}`. It holds no content. It stops a later import from bringing the words back.
- Facts that have only erased evidence are deleted. Facts that have other evidence keep that evidence.
- All views are updated: vector, graph, vault.
- The ledger also asks the source (Chronicle) to delete its copy. If the source keeps its copy, the words still exist there.
- Backups keep the words until the backups expire.
- `forget(topic)` is different. It removes facts and blocks them, but it keeps the recording.

**Transcript errors.** The audio is the evidence. The transcript is a reading of the audio, and a reading can be wrong.

- Each transcript is a `TranscriptRevision` of a recording. A better model or a new speaker label makes a new revision. The old revision stays.
- A human fix ("the word was 'venue', not 'menu'") is a `correction` record on a time range. It is `decidedBy: human`. It is applied on top of every revision, so a new transcription does not undo it.
- All references point to a **time range on the recording**, not to a segment id of one revision. So Decisions and fact evidence stay valid when the text changes.
- When the text of a moment changes:
  1. The moment keeps its time range. It gets a new `contentRevision`.
  2. The episode state is updated for that moment only.
  3. Each fact from that moment is checked. If its quote is still in the text, the fact stays. If not, the fact is extracted again and the old one is retired (not deleted).
  4. Joins and splits are not decided again. A human can ask for it.

**Late evidence.** Evidence can arrive hours or days later (a late upload, a second device, photos, a calendar change).

- Late evidence is added at its recorded time. It never rewrites what is there.
- New moments are made for it. Only the new neighbour pairs get a join decision. Old Decisions stay.
- A closed episode can open again and get a new revision. Its id does not change.
- A `CaptureGap` that the new evidence fills is made smaller or removed. Gaps are calculated, so this is safe.
- If the late evidence is a copy of old evidence, it gets a `duplicate_of` Decision.
- Facts from the new moments are added. Consolidation (L4) then checks them against the old facts.

### L1 Moments

- Code only. No AI.
- A moment ends on a 45 s pause, 600 words or 180 s (Omi values).
- A moment is a time range on a recording. It is cut once, from the first transcript. A later transcript revision fills the same time range with new text. The cut does not move.
- `momentKey` = hash(policyVersion, recordingId, start, end).
- States: `open | ready | processing | done | error`.
- Late audio makes new moments at the recorded time. It does not change old moments.

### L2 Episodes

An episode is an ordered list of moment ranges (`parts[]`). It has a stable id that is made once.

Each new moment goes through 3 steps:

1. **Rules (code).** Close the episode on a gap ≥ 30 min, a 4 h length, or a different calendar event. Continue on a gap < 120 s on the same device.
2. **Small model, unclear cases only.** A gap of 120 s to 30 min, or a device change. The answer is saved as a Decision.
3. **State update (1 small call per moment).** Input: the episode state (≤ 2,400 chars) plus the new moment text with speaker roles. Output: the new state, and optionally `topic_changed_at: <segment id>`.
   - Code checks that the segment id is real and is in this moment. If not, the split is rejected.
   - A valid split closes the episode at that segment and opens a new one. This is the topic split that Omi does not have.

The **episode state** is also the answer to G1. The read API gives it to the assistant as "where the user is now".

After close: 1 composer call writes the title, summary, people and chapters. Each claim cites segment ids. Code checks them.

**The day is a query, not a work unit.** A day pass still runs, but it is small:

- Input: episode titles, states, gaps, photos, screen activity. No transcripts.
- Output: proposed `continues` Decisions between episodes (for example, a talk that paused for lunch).
- It cannot delete or rewrite an episode. So the 14 Nov failure (§3.1) cannot happen: the input is about 2,000 tokens, not 30,000.

### The Decision record

```
Decision {
  id, userId
  kind:      continues | split_at | duplicate_of | same_entity | supersedes | suppress
  subjects:  [ids of the things it joins or splits]
  key:       hash(kind, subjects, policyVersion)   // unique; decided once
  decidedBy: rule | model | human
  model, confidence, reason
  status:    active | overridden
  overriddenBy: <Decision id>
  createdAt
}
```

- A run looks for the key first. If the key exists, the run uses that Decision.
- A human edit in any UI or in the vault writes a `decidedBy: human` Decision. It overrides the others.
- A new model does not decide old days again. Only an explicit "re-run this range" does, and human Decisions stay.

This gives stable results across runs (§3.1 item 7).

### L3 Memory service (separate from the ledger)

L3 and L4 are a **separate service**. The ledger gives it closed episodes. The ledger does not know which engine is behind it.

The interface (the "memory port") is small:

| Call | Does |
|---|---|
| `ingest(episode, reference_time)` | Takes one closed episode: text with speaker roles, and the recording time |
| `search(query)`, `entity(id)` | Reads facts and entities |
| `correct(...)` | Saves a human correction |
| `forget(...)`, `erase(...)` | Removes facts; `erase` also removes the words |

Behind the port there are 2 kinds of fact. They have different jobs.

| | Knowledge | Action facts |
|---|---|---|
| What | People, relations, preferences, what is true and since when | Tasks, promises, decisions, constraints, human corrections |
| Engine | **Graphiti** on our Neo4j (first choice; do a spike first) | **taskfacts** (`../taskfacts`, `ushadow_facts`, Postgres) |
| Screen | UltraMind | Board and Today list |
| Goals | G1, G5, G6, G7 | G2, G3, G4, G6, G10 |

**Why Graphiti (research of 2026-11-16, by a subagent; not all checked by hand).**

- It is a library that builds a time-aware graph from "episodes". It runs on Neo4j. Licence: Apache-2.0. Active.
- `add_episode` takes a required `reference_time`. So "tomorrow" is read against the recording time (the mem0 defect, §5).
- Each link keeps `valid_at` and `invalid_at`. A fact that stops being true is marked, not deleted (G7).
- Each link keeps the list of episodes it came from. We pass our own episode id (G5).
- Custom entity and link types. `add_triplet` writes a fact that a human states.
- Gaps: no "human wins" rule; no quote or time range on a fact; the servers have no login; the number of LLM calls for each episode is not documented (estimate 4-8).

What we build around it (a thin service that we own):

- Login and `group_id = userId`.
- A queue with retry. One job for each episode revision.
- A side table: Graphiti link id → `{recordingId, timeRange, quote}`.
- Human corrections are saved as taskfacts facts (`source: person`). After any re-processing they are applied again. So a re-run cannot undo them.

Spike before we commit (1-2 days, 3 real days of data): relative dates, the number of calls on a local model, a correction that survives a re-run, delete of one episode.

Other candidates:

| Candidate | Result |
|---|---|
| Hindsight (MIT, very active) | Quotes and proof counts on facts. Needs Postgres + pgvector. No valid-from / valid-to found. Second choice |
| MemOS (Apache-2.0) | Uses Neo4j + Qdrant. Has a correction API. Time model and proof are not documented |
| Cognee (Apache-2.0, active) | Graph pipeline with `forget`. Time model not verified |
| Zep community edition | Deprecated. Graphiti is its open engine |
| Khoj, Basic Memory | AGPL-3.0. Do not reuse the code. Basic Memory's idea (edit Markdown, then re-index) is good for the vault view |
| LangMem, Memobase, Letta, LightRAG, TrustGraph | Not a fit: no graph, no time model, or a heavy stack |

**One fact shape: the taskfacts fact.** All facts that we write ourselves use it. The `Decision` record of the ledger uses it too.

```
Fact {                       // ushadow_facts/facts.py
  id
  subject: {kind, id}        // a task, a person, an episode pair
  key                        // what happened: task_requested, promise_made, same_entity, continues
  occurred_at                // when it was said (recording time)
  recorded_at                // when we learned it
  value: {...}               // text, about[], evidence[], direction, due, sensitivity
  source: person | agent | sensor
  scope                      // who can see it
  retracts                   // the id of a fact that was wrong
}
```

- No status is stored. "Active" is worked out: the fact is not retracted and no newer fact replaces it.
- `source` replaces `decidedBy`: human = `person`, model = `agent`, rule or capture = `sensor`.

**Tasks on a board (taskfacts).**

- You say "book the venue, the limit is 2,000". The extractor records `task_requested` and `constraint_added{budget: 2000}`, each with its quote.
- A rulebook works out the column: Mentioned → Confirmed → Waiting on the other person → Due soon → Done. Nobody moves a card.
- A promise has a direction. "Whose turn" is worked out. "What do I owe Alex" is the Today list.
- Anticipation (G4) is an obligation: "a meeting with Alex starts in 1 hour and there are open items → a brief is due → the agent does it → `brief_sent` is recorded".
- When the assistant does a task later, it reads the task's facts: the constraints and decisions with their quotes (G3).

**A change that taskfacts needs.** `uf_facts` refuses each update and each delete (`ushadow_facts/postgres/migrations/001_facts.sql`). A memory fact can hold private words. taskfacts needs one controlled erase: blank the `value`, keep the row, record an `erased` fact.

**What a memory fact holds in `value` (earlier field names).** Key = hash(episodeId, contentRevision, extractorVersion).

```
Fact {
  id, userId
  kind:       fact | preference | decision | constraint | commitment | open_question | task
  text, about: [entityId]
  evidence:   [{recordingId, timeRange, transcriptRevision, quote}]   // required (G5)
  saidBy:     owner | other(personId)
  direction:  owed_by_me | owed_to_me                 // commitments only (G6)
  validFrom, validTo, supersededBy                    // G7
  sensitivity: normal | private | health | finance    // G10
  // no stored status: it is worked out from retractions and newer facts
  decidedBy
}
```

Intake rules:

- A fact with no quote is rejected.
- Segments with role `media` make no facts about the user.
- Owner gate: no facts unless the owner said ≥ 20 words (Omi fork).
- Relative times ("tomorrow") are resolved against the recording time.
- Known entity facts are put in the prompt as "already known" (§7 proposal). The lookup always filters by `userId`.
- Intake does not merge. It files the fact as `candidate` or `active`. Merges are for L4.

Entities: `Person`, `Project`, `Task`, `Place`, `Org`. Each has aliases.

- "Two names are one entity" is a `same_entity` Decision. This prevents the "same name, many nodes" defect (§8).
- Bystanders: a speaker who is not a known contact gets no profile. The user must confirm the person first (G10).
- Tasks and projects link to the facts and episodes they came from (G2, G3).

### L4 Consolidation

- Runs when work is queued, and at least each night.
- Actions: mark a fact `supersededBy` another (sets `validTo`), merge duplicate facts, merge entities, close tasks.
- It never deletes. The old fact stays with its dates (G7).
- 2 independent verifier calls must agree. If they do not, the item goes to a review list.
- Each action is a Decision in the ledger. Undo = override the Decision.

### L5 Views

All views are built from L0-L4 by a projector. A projector is a job that reads ledger changes and updates a view. It uses MongoDB change streams (the replica set is already required).

| View | Holds | For |
|---|---|---|
| Vector index (Qdrant) | Fact and episode-summary embeddings, with `userId` and fact id | Search by meaning |
| Graph (Neo4j, shown in UltraMind) | entities, facts and the links between them | Seeing and correcting; "who", "which project" |
| Markdown vault | `Daily/`, `People/`, `Projects/`, `Conversations/` pages | Human reading and editing |

- Each vault line that states a fact carries the fact id. An edit is read back and saved as a human Decision or a human Fact. So a rebuild keeps it (§8 rule 3).

**Vector and Markdown do different jobs. Neither is the truth.**

- The vector index is for machines. It finds facts by meaning. Example: a search for "ads" finds a fact about "paid marketing". It returns fact ids. The ledger then gives the fact with its proof.
- The Markdown vault is for the human. The user reads it and edits it in Obsidian. An agent can also search it as text.
- If either one is lost, a projector builds it again from the ledger.

**The graph: Neo4j, from the start, as a view.**

An earlier draft said "add Neo4j later". That was wrong. A graph that the user can see and correct is part of G10, and UltraMind (`../ultramind`) is already built on Neo4j. So the graph is in the design from phase 4.

There are 3 separate questions:

| Question | Answer | Why |
|---|---|---|
| Do we need a graph view to see and correct facts? | Yes | G10. It is the best screen for "this is wrong, this is the same person" |
| Must the graph be the source of truth? | No | A graph node cannot hold the proof, the history and "who decided" well. This caused "one name, many nodes" and corrections that a re-run undid |
| Must the view be Neo4j? | No, but use it | UltraMind has its Cypher in one file (`backend/app/services/neo4j_service.py`), with neighbourhood and shortest-path queries. Neo4j is deployed now. A Mongo edge collection could feed the same screen, but that means a rewrite for no gain |

How a correction works:

1. The user changes a node or a link in UltraMind.
2. UltraMind sends the change to the ledger (`correct`, `same_entity`, `forget`). It does not write to Neo4j.
3. The ledger saves a `decidedBy: human` Decision.
4. The projector updates Neo4j, the vector index and the vault.

So a correction is made one time and is seen in all views. A re-run cannot undo it.

Rules for the Neo4j view:

- Only the projector writes to it.
- Each node and each link has a `userId`. Each query filters by it. This closes the §7 leak.
- Each node has the ledger id (`factId` or `entityId`), so a click shows the proof.
- Interests are a query on this graph: the entities and topics with the most and the most recent links.

### L6 Read API

One service in Ushadow. All agents use it. It is also an MCP server.

| Call | Returns | Goal |
|---|---|---|
| `context(now)` | Open episode state, participants, recent entities, next calendar event | G1 |
| `resolve(text)` | Entity candidates for "he", "the venue", "the launch plan" | G1, G2 |
| `recall(query, range?)` | Facts with quote, time and recording | G5 |
| `brief(entityId \| eventId)` | Last talk, open tasks, commitments both ways, decisions | G3, G6, G8 |
| `timeline(range)` | Episodes plus capture gaps | G9, G11 |
| `why(factId)` | Evidence, Decisions, who decided | G10 |
| `correct(factId, …)` / `forget(selector)` | Human Decision; `forget` also writes a `suppress` Decision so that a re-run does not make the fact again | G10 |

- Each agent has a scope: which fact kinds and which sensitivity classes it can read and write (G12). The check is in this service, not in each agent.
- When there is a `CaptureGap` in the range, the answer says so (G11).
- **Anticipation (G4)** is a small agent on top. Triggers: a calendar event starts soon, a commitment is due, an episode opens with a known person. Action: call `brief` and show it.

## 3. Where each part runs

Chronicle is an external repo (`Ushadow-io/chronicle` is a fork of `SimpleOpenSoftware/chronicle`).
So the ledger does **not** go in Chronicle. It is a new service that Ushadow owns.
Chronicle, Mycelia and Omi are sources. Each one sends evidence through a small adapter.

```
Chronicle ─┐
Mycelia  ──┼─ adapters ─→  Ledger service (L0-L5, own Mongo database)  ─→  Read API + MCP (L6)  ─→  agents
Omi      ──┘                       │
coding sessions ─┘                 └─→ views: Qdrant · Neo4j (UltraMind) · vault
```

| Part | Runs in | Notes |
|---|---|---|
| L0-L5: ledger, pipeline workers, projectors | New Ushadow service `ledger` | Own Mongo database on the shared Mongo. Deployed like other Ushadow services |
| L6 read API + scopes + MCP | The `ledger` service. Ushadow reaches it through the generic proxy `/api/services/ledger/proxy/...` | Replaces `routers/memories.py` and `services/graph_enrichment.py` |
| Chronicle adapter | A Chronicle plugin | Chronicle has plugin events `conversation.complete`, `transcript.streaming`, `transcript.batch` (`chronicle/backend/src/backend/plugins/events.py:13`). The plugin posts segments to the ledger |
| Old data | Ledger job | Reads the Chronicle REST API, or reads Chronicle Mongo read-only |
| Schema | `life-datatypes` v2 | Add `Decision`, `Fact`, `CaptureGap`, `Moment`, and `entities` on `Conversation` (§12 gap) |

Changes in Chronicle core: **none**. Two config items only: add the plugin, and turn off the 4 h timeline schedule when the ledger timeline is ready.

To check before phase 1:

- Can Chronicle load a plugin from outside its repo? If not, the plugin is one file in the fork.
- Do the plugin events give absolute times and speaker roles? If not, the adapter reads them from the Chronicle API (`audio_chunks.captured_at`).
- Screen items (`device_input_items`) have no plugin event. The adapter must pull them.

Optional later: a thin provider in the fork behind `MemoryServiceBase` (`services/memory/base.py:111`) that calls the ledger read API. Then Chronicle chat uses the same memory. This is one small file. It is not needed for the design to work.

Good side effect: this serves G12 better. The ledger does not depend on one capture app.

Source of truth: **MongoDB**. Reasons: it is deployed now, episodes and facts must link in one store, and change streams feed the views.
Redis holds jobs and locks only. Progress is saved in Mongo on the work unit.

Coding context (§9) uses the same ledger:

- A coding session transcript is a `Recording` with source `agent_session`.
- Secrets are removed before storage.
- Joins are rule Decisions (same branch, PR or issue).
- Each fact keeps the commit it was true at. The agent verifies it before use.

## 3a. Proposed schema (life-datatypes v2, revised)

Source: `schema/conversation.json` v2.0.0, branch `schema-v2` of `Ushadow-io/life-datatypes`.
Local clone: `/Users/stu/repos/life-datatypes`. The changes below are done and pushed (commit `963eb3a`, 2026-11-16). The branch is not merged to `main` and has no release tag.

**Verdict: v2 is mostly valid.** The evidence types fit the new structure with no change. 4 types need a change. 4 types are new. v2 is not published yet, so make the changes in 2.0.0 before the first commit.

Where this section and an earlier section use different words, this section wins. Examples: the v2 name `Conversation` is the "episode" of this document. The v2 speaker roles and gap causes replace the ones in §2.

### How a real conversation maps to the names

One real morning. You plan the launch with Alex. You stop for coffee. You continue. The plumber calls. The pendant goes on charge. Later the TV is on.

```
Time           08:55            09:20  09:26       09:40 09:41     09:52             10:30     10:45
What happened  |=== Launch plan with Alex ===|pause|== continues ==||== Plumber ==|  on charge     |  TV news  |
Recording      |============ A ==============|     |============== B =============|  CaptureGap    |==== C ====|
Fragment       |-- F1 Budget --|-- F2 Venue -|     |-F3 Budget-|-F4 Next-||-- F5 Leak ----|
Thread         "Budget" = F1 + F3   (the subject comes back after the pause)
Conversation   |======== 1, part 1 ==========|     |== 1, part 2 ==||===== 2 ======|                (none: media)
Link           continues: A -> B                                    split_at: B at 09:41
```

What it shows:

- Conversation 1 is in 2 recordings (A and B). A `Link` of kind `continues` joins them.
- Recording B holds the end of conversation 1 and all of conversation 2. A `Link` of kind `split_at` cuts it at 09:41.
- The coffee pause is a pause in the conversation. It is the time between 2 parts. It is not a gap.
- The charge time is a `CaptureGap` (`cause: device_offline`). The AI says "I have no data", not "nothing happened".
- Recording C is TV. Its speakers have the role `media`. It makes no conversation and no facts about you.

The lines inside F1, like a screenplay:

```
08:55:02  ALEX (participant)  Can we look at the budget first?
08:55:06  YOU  (owner)        Yes. The limit is 2,000.
```

The second line gives one fact: `constraint_added {budget: 2000}`, with an `EvidenceRef` to recording A, 08:55:06-08:55:09, and the quote.

### Names, from small to large

```
CaptureBundle (one span, for example one day)
├── Recording            one piece of audio, from cut to cut ("the tape")
│   └── Transcript       one reading of the tape; there can be many versions
│       ├── Speaker      a voice in this recording ("Speaker 0"), with a role
│       └── Segment      one line of speech, like a line in a screenplay
├── Fragment             lines that follow each other, on one subject, in one recording (a scene)
├── Conversation         the whole exchange, pauses allowed (was "episode" in this document)
│   ├── ConversationPart the piece of one recording that belongs to this conversation
│   ├── Participant      one person, joined from the voices in each recording
│   └── Thread           a subject that comes back: fragments that need not follow each other (a storyline)
├── Link                 a saved decision: continues / split_at / duplicate_of / overlaps / unrelated
├── CaptureGap           a time with no data, and the cause
├── Entity               a person, project, task, place or org
└── Fact                 something that was said or done, with proof (EvidenceRef)
```

| Name | In the real world | Rule | Made by |
|---|---|---|---|
| `Segment` | One line of speech | One speaker, until the speaker changes or pauses. The smallest unit | Transcription |
| `Speaker` | A voice on one tape | The label is local to the recording. "Speaker 0" on 2 tapes can be 2 people | Transcription |
| `Recording` | The tape | From cut to cut. A cut is technical (silence, button, disconnect). It is not the end of a talk | Capture |
| `Transcript` | One reading of the tape | Never overwritten. A better reading is a new version | Transcription |
| `Fragment` | A scene | Lines that follow each other, one subject, one recording | Model, checked by code |
| `Thread` | A storyline | Fragments on the same subject. They can be apart, and in different recordings | Model |
| `ConversationPart` | "This piece of the tape is ours" | One time range of one recording | Code, from Links |
| `Participant` | A person in the talk | Joins the voices from each recording to one person | Speaker match, or a human |
| `Conversation` | The talk | One exchange between people. Pauses are allowed | Code, from Links |
| `Link` | "Same talk" or "new talk" | Decided once. A human Link wins | Rule, model or human |
| `CaptureGap` | The pendant was off | "No data" is not "nothing happened" | Code |
| `Moment` | (none) | About 3 minutes. A work unit inside the ledger only | Code |

Writing rules for names:

- Types: `PascalCase`, singular (`Fragment`, not `Fragments`).
- Fields: `camelCase`. A time is `...At` (`recordedAt`). A reference is `...Id` or `...Ids`.
- Enum values: `snake_case` (`duplicate_of`, `device_offline`).
- Fact keys: `snake_case`, a thing plus a past verb (`task_requested`, `promise_made`). A key says what happened. It never says a status.
- Do not use "episode", "session" or "chunk" in the schema. Use `Conversation`, `Recording` and `Fragment`.

### Check of each v2 type

| v2 type | Verdict | Change |
|---|---|---|
| `TimeRange`, `CaptureSource`, `Speaker`, `SpeakerRole`, `Segment` | Keep | None. Absolute UTC and speaker roles are there |
| `ScreenObservation`, `ScreenSample`, `FrameRef` | Keep | None |
| `MeetingMarker` | Keep | It covers calendar events (`detectedBy: calendar`) |
| `CaptureGap`, `GapCause` | Keep | Use `excluded` for a range that the user erased |
| `Participant`, `SpeakerRef`, `ConversationPart`, `Thread` | Keep | None |
| `Recording` | **Change** | It holds 1 transcript. Move the segments to a new `Transcript` type, so that a recording can have many transcript versions |
| `Fragment` | **Change** | It points to `segmentIds`, which are valid in 1 transcript version only. Make `range` required. `segmentIds` becomes optional |
| `Link` | **Change** | Add `split_at`. Add `key` (decide once), `policyVersion`, `model`, `at`, `recordedAt`, `retracts` (override without overwrite) |
| `Conversation` | **Change** | Add `revision`, `closedAt`, `entityRefs` (the gap in the report, §12) |
| `CaptureBundle` | **Change** | Add the new lists |
| `Transcript`, `TranscriptCorrection` | **New** | Transcript versions and human word fixes |
| `EvidenceRef` | **New** | One standard pointer to proof: recording + time range + quote |
| `Fact` | **New** | The taskfacts fact shape, for all facts that we write |
| `Entity` | **New** | Person, project, task, place, org |

Not in the shared schema: `Moment`. It is a work unit inside the ledger service. Other apps do not need it.

### Proposed definitions

Fields with `*` are required. Types that are not shown stay as in v2.

```
// ---- Evidence -------------------------------------------------------------

Recording {                       // CHANGED: segments and speakers move to Transcript
  id*, sourceId*, modality, range*: TimeRange
  origin, startReason, endReason: CutReason
  contentHash                     // finds the same audio stored twice
  currentTranscriptRevision       // the version to use by default
  metadata
}

Transcript {                      // NEW: one reading of a recording. Never overwritten
  recordingId*, revision*
  createdAt*, model               // which ASR / diarization made it
  speakers: [Speaker]
  segments*: [Segment]            // absolute UTC. Segment ids are valid in this revision only
}

TranscriptCorrection {            // NEW: a human fix. Applied on top of every revision
  id*, recordingId*, range*: TimeRange
  text                            // the correct words for that range, or
  speakerLabel, personId          // the correct speaker for that range
  author                          // who made the fix. A correction is always human
  recordedAt*
}

EvidenceRef {                     // NEW: the one way to point at proof
  recordingId*, range*: TimeRange // the anchor. Valid for every transcript revision
  transcriptRevision              // the revision the quote was read from
  quote                           // exact words, for display and for a re-check
}

CaptureGap { id*, sourceId*, range*, cause*: GapCause }     // as v2
  // GapCause: device_offline | disconnected | paused | excluded | not_recording | unknown
  // an erased range becomes a gap with cause `excluded`

// ---- Structure ------------------------------------------------------------

Fragment {                        // CHANGED: anchored on time, not on segment ids
  id*, recordingId*, range*: TimeRange
  transcriptRevision, segmentIds  // optional, a convenience for 1 revision
  topic, summary, metadata
}

Link {                            // CHANGED: the saved decision
  id*
  kind*: continues | duplicate_of | overlaps | unrelated | split_at     // split_at is new
  fromId*, toId                   // split_at has only fromId (the recording)
  at                              // split_at: the UTC time of the split
  key*                            // hash(kind, fromId, toId|at, policyVersion): decided once
  decidedBy*: rule | model | human
  policyVersion, model, confidence, gapSeconds, reason
  recordedAt*
  retracts                        // the id of the Link that this one overrides
}

Conversation {                    // CHANGED. This is the "episode"
  id*, range*, parts*: [ConversationPart]
  revision*                       // goes up when late evidence or a correction changes it
  closedAt                        // not set while it is open
  title, summary
  citations: [EvidenceRef]        // proof for the claims in the summary
  participants, fragmentIds, threads, screenObservationIds, meetingId
  entityRefs: [{ entityId*, kind, name }]
  metadata
}

// ---- Memory ---------------------------------------------------------------

Entity {                          // NEW
  id*, kind*: person | project | task | place | org
  name*, aliases: [string]
  confirmed: boolean              // false: a bystander. No profile until the user confirms
}

Fact {                            // NEW: same shape as taskfacts (ushadow_facts/facts.py)
  id*
  subject*: { kind*, id* }        // an Entity, a task, a Conversation
  key*                            // what happened. See the list below
  occurredAt*                     // when it was said or done (recording time)
  recordedAt*                     // when we learned it
  value: {
    text, about: [entityId]
    evidence: [EvidenceRef]       // required when source is agent
    direction: owed_by_me | owed_to_me
    due, sensitivity: normal | private | health | finance
  }
  source*: person | agent | sensor
  scope                           // who can see it
  retracts                        // the id of a fact that was wrong
}
  // No status field. "Active" is worked out.
  // First keys: task_requested, promise_made, decision_made, constraint_added,
  //             preference_stated, question_opened, done_reported,
  //             same_entity, correction, forget, erased

CaptureBundle {                   // CHANGED: add the new lists
  schemaVersion*, range*, timezone
  sources, recordings, transcripts, corrections, fragments,
  screenObservations, meetings, gaps, links, conversations,
  entities, facts
}
```

### Two word lists that must agree

`Link.decidedBy` (v2) and `Fact.source` (taskfacts) say the same thing with different words. Keep both. The mapping is fixed:

| `Link.decidedBy` | `Fact.source` |
|---|---|
| `human` | `person` |
| `model` | `agent` |
| `rule` | `sensor` |

### Open points on the schema

- 1 file or 3 files (`evidence`, `structure`, `memory`)? Recommended: 1 file now. Split when it is hard to read.
- Knowledge facts live in Graphiti. Graphiti has its own shape. The `Fact` type above is for facts that we write, and for export from Graphiti.
- `Photo` has a modality in v2 but no type. Add it when the photo source is built.

## 4. Goals check

| Goal | Served by |
|---|---|
| G1 Context | Episode state (L2) + `context`, `resolve` |
| G2 Projects, tasks | `Project` / `Task` entities linked to facts (L3) |
| G3 Later tasks | `decision` and `constraint` facts linked to the task; `brief` |
| G4 Anticipate | Trigger agent on calendar and commitments |
| G5 Proof | Evidence is required on each fact; code checks segment ids |
| G6 People, promises | `Person` entities; `commitment` with `direction` |
| G7 Now vs before | `validFrom`, `validTo`, `supersededBy`; no deletes |
| G8 Briefings | `brief` |
| G9 Patterns | Episodes with absolute times + `CaptureGap` |
| G10 Control | `why`, `correct`, `forget`, `suppress`; human wins; sensitivity; bystander rule |
| G11 Honest gaps | `CaptureGap` with a reason |
| G12 Many agents | One read API, MCP, per-agent scopes, life-datatypes |

## 5. Cost for a day like 14 Nov (75 min of audio)

| | Today (A) | Ledger model |
|---|---|---|
| Largest model input | About 30,000 tokens, read in 30 parts | About 1,000 tokens (state + 1 moment) |
| Calls | 2 long agent runs | About 30 small state calls + about 8 composer calls + about 8 fact calls |
| Model needed | Strong | Small for state; medium for composer and facts |
| Failure scope | The whole day | 1 moment |
| Result after a retry | Different (8, 10, 11 episodes) | The same (Decisions are saved) |
| Delay | 4 h or on demand | Minutes after each moment |

## 6. Build order

The full plan with tasks and a check for each milestone is in `docs/analysis/memory-system-dev-plan.md`. That file moves erase of evidence to the first milestone and runs the Graphiti spike in parallel.

| Phase | Work | Result |
|---|---|---|
| 0 | Add the `user_id` filter in `graph_enrichment.py` (Ushadow). Optional, in the fork: inline `task.json` when it fits; stable investigation id (§11 items 1, 3) | The leak is closed |
| 1 | New `ledger` service. `Decision`, `Moment`, `CaptureGap` in life-datatypes and Mongo. Chronicle plugin adapter. Moment cutter. Duplicate rule | L0-L1 |
| 2 | Episode layer with rules, gap model, state update and topic split. Composer. Small day pass. Then turn off the Chronicle timeline schedule (config) | L2. Timeline is stable |
| 3 | Graphiti spike on 3 real days. Then the memory service: port, queue, proof side table. Action-fact extraction into taskfacts. Erase in taskfacts | L3 |
| 4 | Read API + scopes + MCP. Vector and Neo4j projectors. UltraMind reads the memory graph and sends corrections to the ledger. Remove the mem0 read routes in Ushadow | L5-L6. G1, G5, G8 work. Corrections work (G10) |
| 5 | Consolidation with 2 verifiers and undo. Vault projector with edit read-back. Erase | L4. G7, G10 |
| 6 | Task board and Today from a taskfacts rulebook. Anticipation as obligations. Coding-session source. Mycelia and Omi adapters | G2, G4, G12, §9 |

Old data: the ledger pulls the stored recordings from Chronicle and runs the moment cutter and the episode layer on them. Existing hand edits on `timeline_episodes` become human Decisions.

## 7. Risks

- **Topic split by a small model can be wrong.** The control: the split must cite a real segment, a split needs a minimum size on each side, and a human can override it.
- **Many small calls.** About 45 calls for 75 min. They are small and can run on a local model.
- **Shared Mongo is small** (768Mi, memory note). Facts and Decisions are small records, but check the memory before phase 3.
- **Vault read-back is hard.** Until phase 5, the vault is read-only output.

## 8. Test questions (to be written by the user)

The report recommends 2-3 real questions for each goal, with the expected answer. They are the acceptance test for each phase.

TODO (user): fill this table from real days. Start with G1-G4.

| Goal | Question | Day | Expected answer |
|---|---|---|---|
| G1 | | | |
| G2 | | | |
| G3 | | | |
| G4 | | | |

## 9. Open decisions

1. Agree goals 5-12 (§13 of the report).
2. Stores: MongoDB for evidence and episodes, Postgres (taskfacts) for action facts, Neo4j for knowledge. This replaces the earlier "Mongo or Postgres" question.
5. Knowledge engine: Graphiti behind our memory port, after a spike (recommended), or our own extraction on taskfacts with Neo4j as a view (more work, full control).
3. Graph view: Neo4j as a view with UltraMind (recommended) or a Mongo edge collection that feeds UltraMind (no Neo4j, but a rewrite of `neo4j_service.py`).
4. Chronicle adapter: a plugin (recommended; a clean contract) or a read-only watch on Chronicle Mongo (no Chronicle change at all, but it breaks when upstream changes its collections).

Human-readable version: see the artifact link in the chat that made this file.
