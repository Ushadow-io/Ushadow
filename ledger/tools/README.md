# ledger/tools

## export_golden_days.py

Exports "golden days" of real capture data from Chronicle as JSON for replay tests of `ledger`.
Read-only: GET requests (REST) or `find()` (Mongo). Output is private (real speech) and goes to
`ledger/tools/golden/`, which is git-ignored. Transcript text is never printed; only counts are.

```bash
export CHRONICLE_TOKEN=...            # bearer token of the user (or a superuser)
uv run ledger/tools/export_golden_days.py \
  --date 2026-11-14 --user <id-or-email> --tz <IANA tz, e.g. Europe/London> \
  --chronicle-url http://localhost:8090 --out ledger/tools/golden/
```

Mongo mode (second option; set the URI in the env so it is not on the command line):

```bash
export CHRONICLE_MONGO_URI='mongodb://...'   # read-only user recommended
uv run ledger/tools/export_golden_days.py --date 2026-11-14 --user <user-id> --tz Europe/London --mongo-db chronicle
```

Env vars: `CHRONICLE_TOKEN` (REST), `CHRONICLE_URL`, `CHRONICLE_MONGO_URI`, `CHRONICLE_MONGO_DB`,
`LIFE_DATATYPES_SCHEMA` (default `~/repos/life-datatypes/schema/conversation.json`, branch `main`, commit `5937cd4` or later),
`LEDGER_TZ`. Repeat `--date` for several days. `--owner-name` marks a speaker name as `role=owner`.

Outputs per day: `<date>.bundle.json` (CaptureBundle, validated against the schema before writing;
a validation error exits 1 and writes nothing) and `<date>.expected.json` (Chronicle's conversations
and timeline episodes, with `human: true` and `humanFields` on episodes a person confirmed).
Files are sorted-key JSON, so the same input gives byte-identical output.

### Mapping notes

- One Chronicle conversation becomes one `Recording` (id = conversation id) plus one `Transcript`.
  Recordings that overlap the day (in `--tz`) are included whole, also when they cross midnight.
- Segment times in Chronicle are seconds from the start of the conversation's audio. They are made
  absolute by laying `audio_ranges` end to end (their absolute times come from `audio_chunks.captured_at`).
- Every exported transcript has `status: final` (Chronicle's stored version, not a live draft).
- `Recording.audio` and `CaptureBundle.ownerPersonId` are left out: Chronicle has no stable audio
  file pointer (audio is rendered on request from chunks) and no person id (only the account id).
- A missing speaker becomes label `unknown`. Speaker roles are `unknown` unless `--owner-name` matches.
- Gaps are written only when the cause is known: previous recording ended by `websocket_disconnect`
  (`disconnected`), `user_stopped`/`close_requested` (`paused`), or a Chronicle privacy interval
  (`excluded`; a privacy gap that lies inside one recording gets that `recordingId`). Gaps shorter than `--min-gap-seconds` (60) are ignored. The count of skipped unknown-cause gaps is printed.
- REST mode fetches each conversation detail; to keep this fast, conversations created more than
  `--created-slack-hours` (48) before the day starts are skipped. Use a negative value to fetch all.

### Tests

```bash
cd ledger/tools && uv run --no-project --with pytest --with jsonschema --with tzdata python -m pytest tests -q
```
