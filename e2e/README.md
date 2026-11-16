# e2e: ledger + memory together

One story, over real HTTP, on real MongoDB, with both services as real processes (or as
their Docker images). Synthetic data only. Opt-in: nothing runs unless `E2E_MONGO_URI` is set.

The story (`story.py`) runs twice: straight through, and with both services killed (SIGKILL)
and started again after step e. Both runs must end in the same state (step j).

| Step | What is checked |
|---|---|
| a | The Chronicle adapter's real `mapping.build_bundle`: live deltas, then the final transcript, into ledger `/ingest` |
| b | `POST /pipeline/run`: closed conversations with title, summary and citations; the topic change inside `c-e2e-a` makes two |
| c | memory `POST /sync`: facts exist; every proof quote is in the ledger's FINAL transcript; live-only words are nowhere in memory; `GET /search` finds a fact |
| d | A second `/sync` does nothing (the ledger cursor works, no duplicate facts) |
| e | A human correction in memory survives a sync and a `/rebuild` |
| f | A human `split_at` in the ledger: memory undoes the old revision and ingests the new conversations; no orphan units, proofs or action facts |
| f2 | A human `continues` that cancels the model's topic split: the second part is retired with `replacedBy`; memory retires it and re-ingests (the correction from e holds) |
| g | Ledger `/erase` of a quoted line: after `/sync` the words are in no document of either test database; that fact is gone; the others remain |
| h | Late evidence (an earlier recording sent last): conversation id as the ledger promises (same id, or retired with `replacedBy`); memory consistent |
| i | No token / wrong token: 401 on both services. Memory with a wrong ledger token: a clean 502 that names the status and route only |
| k | Read API `GET /v1/timeline`: conversations in order; the erase of step g is a gap with cause `excluded`; a service principal without a scope gets 403 |
| k2 | `GET /v1/search`: facts (memory) and conversations (ledger) merged; every fact quote is in the FINAL transcript |
| k3 | Scope: one standing action fact is marked `private` in this run's memory test DB (the fake extractor sets no sensitivity); the `reader` principal (normal only) does not get it and sees `withheld >= 1` |
| k4 | The read-only `reader` gets 403 on `POST /v1/correct`; the fact is unchanged |
| k5 | `POST /v1/correct` (a knowledge fact) is a human decision in memory and holds after memory `/rebuild` |
| k6 | `POST /v1/forget`: a `suppress` decision; the fact stays gone after `/rebuild` |
| k7 | The MCP tool `search` (Streamable HTTP at `/mcp`, real SDK client) returns the same items as `GET /v1/search`; `/mcp` without a token is 401 |
| k8 | Memory killed: `/v1/search` is 200 with `partial: true`, reason `memory_unreachable`, and the ledger's conversations; a write is 503; memory is started again |
| j | The restarted run ends in the same state as the straight one |

## Safety

- Only databases named `ledger_test_e2e_<random>` and `memory_test_e2e_<random>` are created,
  read and dropped; `harness.TestDbs` refuses any other name. They are dropped at the end,
  also on failure, and the run prints which of its databases are left (it must say `none`).
- Servers bind to 127.0.0.1 on free ports and are stopped at the end. Tokens are random per
  run, passed in the environment only, never printed.
- The read-API principals `agent` and `reader` get random tokens too; their scopes are passed as
  `LEDGER_SCOPES` (`read_steps.READ_SCOPES`).
- The ledger runs with its deterministic fake model through the test-only switch
  `LEDGER_TEST_FAKE_MODEL=1` (refused together with a real model; not passed by
  `compose/ledger-compose.yaml`). Memory runs with `MEMORY_ENGINE=fake-mongo` (the fake engine,
  kept in its own Mongo database so restarts and the erase scan can see it),
  `MEMORY_ACTION_EXTRACTOR=fake` and `MEMORY_ACTION_STORE=mongo`.

## Run it (local processes)

```bash
cd ledger && uv sync && cd ..
cd memory/service && uv sync && cd ../..

export E2E_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'
ledger/.venv/bin/python -m pytest e2e -q          # pass/fail
cd e2e && ../ledger/.venv/bin/python story.py     # the same, with PASS/FAIL per step
```

Service logs go to a temp folder (printed as `logs:` by `story.py`; pytest's `tmp_path`).

## Run it against the Docker images

Builds `ledger/Dockerfile` and `memory/service/Dockerfile` (random tags), puts the two
containers on a new private network and on the existing `infra-network` (only to reach the
running `mongo` container, which is not changed or restarted), publishes their ports on
127.0.0.1, and removes containers, network and images at the end.

```bash
export E2E_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'  # the test's view
export E2E_DOCKER_MONGO_URI='mongodb://mongo:27017/?replicaSet=rs0'  # the containers' view (default)
cd e2e && ../ledger/.venv/bin/python story.py --docker
# or: E2E_DOCKER=1 ledger/.venv/bin/python -m pytest e2e -q
```

## Lint

```bash
cd e2e && ../ledger/.venv/bin/ruff check .
```
