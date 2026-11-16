# ledger_adapter: Chronicle plugin that feeds the ledger

A Chronicle plugin that lives outside the Chronicle repo. It sends each conversation
(recording + transcript with absolute times and speaker labels) to the ledger:
`POST {LEDGER_URL}/ingest` with a `CaptureBundle`. The ledger is idempotent, so a
repeat send is safe. Chronicle core is not changed.

## Mount it

Chronicle discovers plugins as `<PLUGINS_DIR>/<plugin_id>/plugin.py`
(`services/plugin_service.py:43` `_get_plugins_dir`, `:601` `discover_plugins`).
The directory name is the plugin id, so this folder must appear as `ledger_adapter`.

```yaml
# compose override for the chronicle backend + worker services
services:
  chronicle-backend:            # and the worker service, if separate: events fire in workers too
    volumes:
      - ./ledger/adapters/chronicle:/app/plugins/ledger_adapter:ro
      - ledger_adapter_outbox:/app/debug/ledger_outbox    # keeps unsent data across restarts
    environment:
      LEDGER_URL: http://ledger:8200
      # PLUGINS_DIR: /app/plugins   # only needed if Chronicle's plugins live elsewhere;
      #                             # then mount this folder as $PLUGINS_DIR/ledger_adapter
volumes:
  ledger_adapter_outbox:
```

`config/plugins.yml` in Chronicle (orchestration only, the entry is required):

```yaml
plugins:
  ledger_adapter:
    enabled: true
    events:
      - conversation.complete
      - transcript.streaming
      - transcript.batch
    condition:
      type: always
```

Plugin settings are in this folder's `config.yml`. Values:

| Key / env | Default | Meaning |
|---|---|---|
| `LEDGER_URL` | `http://ledger:8200` | ledger base URL |
| `LEDGER_TOKEN` | empty | optional bearer token (put in `plugins/ledger_adapter/.env`) |
| `timeout_seconds` | 10 | per-request timeout (connect timeout max 3 s) |
| `LEDGER_OUTBOX_DIR` | `/app/debug/ledger_outbox` | where unsent bundles wait. Mount a volume here |
| `outbox_max_items` | 5000 | cap; oldest dropped with an error log when full |
| `LEDGER_OWNER_NAMES` | empty | comma list; a speaker whose `identified_as` matches gets role `owner` |

Run the tests (no Chronicle needed):
`cd ledger/adapters/chronicle && python -m pytest tests -q` (needs `pytest`; `jsonschema` enables the schema test).

## What the events carry (checked in the Chronicle source)

Short answer: the events carry **neither absolute times nor speaker roles**.

- Segment `start`/`end` are seconds on the *conversation clock* (0 = first claimed audio sample),
  not wall time. The adapter reads `Conversation.audio_ranges` (absolute UTC `started_at`/`ended_at`
  per range) and maps offsets with the same algorithm Chronicle uses
  (`processing_artifacts.absolute_time_for_offset`).
- Speakers are only labels (`"Speaker 0"`) and optionally `identified_as` (a name). There is no role.
  Everything is sent as `role: unknown`, except names listed in `LEDGER_OWNER_NAMES` (`owner`).
- `conversation.complete` usually carries no segments; the adapter reads the active transcript.
- `transcript.streaming` from `streaming_consumer.py` has no `conversation_id` and a capture-session
  clock: skipped and logged.
- Live streaming (`timestamp_clock == "conversation"`) while `audio_ranges` is still empty: the adapter
  rebuilds Chronicle's own temporary claim, `claim_capture_window(capture_session_id, conversation.started_at, now)`
  (`services/audio_claims.py:439`; same call as `_resolve_live_capture_clock_offset`,
  `workers/conversation_jobs.py:1624-1632`). If that fails, nothing is sent. `started_at` alone is never used.
- Live segments are provisional: revision `live`, `Transcript.metadata.chronicle.provisional = true`
  (the schema has no dedicated field). Only new or changed segments are sent (key = start ms).
  The final transcript comes from `conversation.complete` as a separate revision (the version id).
- Time is never guessed: a segment with no provable absolute time is dropped; if none is left,
  nothing is sent and the reason is logged (`ledger_adapter: ... nothing sent: <reason>`).

## Failure handling

The handler never blocks or raises into Chronicle (the router awaits plugins in a chain).
It reads the conversation (5 s timeout), writes the bundle to the on-disk outbox and returns.
A background task sends with timeouts and exponential backoff (1 s up to 60 s). Bundles stay on
disk until the ledger answers 2xx. `transcript.streaming` repeats overwrite one outbox file per
recording and revision. A 4xx answer (except 408/429) is logged as an error and dropped, because
a retry cannot fix it. Leftovers are sent at the next start.

## Screen items (not built)

`device_input_items` (screen captures) have no plugin event. A pull-based adapter would run as a
small job in the ledger (or a cron plugin), keep a cursor (`created_at` of the last item sent),
and every minute call Chronicle's `device_input_routes` API (or read the Mongo collection read-only)
for items after the cursor. It maps them to `ScreenObservation` entries in a `CaptureBundle`
and posts them to the same `/ingest`. The cursor makes it restart safe; idempotency makes
overlap safe.
