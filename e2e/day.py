"""A synthetic day, shaped like Chronicle, turned into ledger posts by the adapter's REAL
`mapping.build_bundle` (loaded read-only from its file). All text is made up.

The conversation shapes follow the existing fixtures (ledger/tests/test_live.py `_facts`,
ledger/tests/fixtures/l2_day.py: 5 s lines every 6 s, Sam the owner, a "Different thing"
topic change inside one recording, a late recording from a second device).

09:00  c-e2e-a  pendant, Sam + Alex, 24 lines; line 14 starts "Different thing" (topic change
               inside the recording). Live hears line 1 as "Brightmoor", the final as
               "Brightwater": only the final may become a fact.
11:00  c-e2e-b  pendant, Sam + Kim, 20 lines; line 1 holds the words that are erased later
               ("Quokkaville"); a human splits it at line 10.
14:00  c-e2e-c  pendant, Sam + Alex, 12 lines.
13:58  c-e2e-late  phone, Sam + Alex, 8 lines, sent LAST (late evidence before c-e2e-c).
"""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from harness import LEDGER_DIR, SPLIT_MARKER

_MAPPING = LEDGER_DIR / "adapters" / "chronicle" / "mapping.py"
_spec = importlib.util.spec_from_file_location("chronicle_mapping_e2e", _MAPPING)
mapping = importlib.util.module_from_spec(_spec)
sys.modules["chronicle_mapping_e2e"] = mapping
_spec.loader.exec_module(mapping)

OWNER_NAMES = ["Sam"]
DAY = datetime(2026, 11, 14, tzinfo=UTC)
DAY_RANGE = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}
ERASED_WORD = "Quokkaville"
LIVE_ONLY_WORD = "Brightmoor"
SAM, ALEX, KIM = ("Speaker 0", "Sam"), ("Speaker 1", "Alex"), ("Speaker 1", "Kim")
LINE_STEP, LINE_LEN = 6.0, 5.0


def at(hms: str) -> datetime:
    h, m, s = (int(p) for p in hms.split(":"))
    return DAY.replace(hour=h, minute=m, second=s)


@dataclass
class Rec:
    cid: str
    client_id: str
    t0: datetime
    lines: list[tuple[tuple[str, str], str]]
    live_text: dict[int, str] = field(default_factory=dict)  # what live ASR heard instead

    @property
    def recording_id(self) -> str:
        return f"chronicle:{self.cid}"

    def raw(self, final: bool) -> list[dict[str, Any]]:
        out = []
        for i, ((label, name), text) in enumerate(self.lines):
            start = i * LINE_STEP
            out.append({"start": start, "end": start + LINE_LEN, "speaker": label, "words": [],
                        "identified_as": name,
                        "text": text if final else self.live_text.get(i, text)})
        return out

    def seconds(self) -> float:
        return len(self.lines) * LINE_STEP + 1

    def line_range(self, i: int) -> dict[str, str]:
        start = self.t0 + timedelta(seconds=i * LINE_STEP)
        return {"start": mapping.iso(start), "end": mapping.iso(start + timedelta(seconds=LINE_LEN))}

    def facts(self, user_id: str, upto: float, final: bool) -> dict[str, Any]:
        end = self.t0 + timedelta(seconds=upto)
        return {
            "conversation_id": self.cid, "client_id": self.client_id, "user_id": user_id,
            "started_at": self.t0, "ended_at": end if final else None,
            "end_reason": "inactivity_timeout" if final else None, "capture_origin": "streaming",
            "audio_ranges": [{"started_at": self.t0, "ended_at": end, "time_basis": "captured",
                              "capture_session_ids": [f"sess-{self.cid}"]}],
            "version_id": f"ver-{self.cid}" if final else None,
            "version_created_at": end if final else None, "model": "nova-3",
            "segments": self.raw(final),
        }


def _filler(who: tuple[str, str], topic: str, n: int) -> list[tuple[tuple[str, str], str]]:
    out = []
    for i in range(n):
        if i % 2 == 0:
            out.append((SAM, f"I keep thinking about the {topic}, point {i}, and what we still "
                             "need to settle together before the end of the week."))
        else:
            out.append((who, f"Agreed on the {topic}, point {i}."))
    return out


REC_A = Rec("c-e2e-a", "omi-pendant-1", at("09:00:00"), [
    (SAM, "Morning Alex, thanks for coming in early to plan the spring market launch with me."),
    (ALEX, "Happy to help. Alex works at Brightwater Labs."),
    (SAM, "Great, I will send the launch budget to you by Friday afternoon at the latest."),
    (ALEX, "The budget is four thousand for the whole launch."),
    *_filler(ALEX, "market launch", 10),
    (SAM, f"{SPLIT_MARKER}: the garden fence at my place needs fixing before the storm this weekend."),
    (ALEX, "Sam lives in Riverton, by the old mill."),
    (SAM, "Yes, and I will buy the fence posts at the hardware store on Saturday morning early."),
    (ALEX, "We decided to use cedar for the new fence panels."),
    *_filler(ALEX, "garden fence", 6),
], live_text={1: f"Happy to help. Alex works at {LIVE_ONLY_WORD} Labs."})

REC_B = Rec("c-e2e-b", "omi-pendant-1", at("11:00:00"), [
    (SAM, "Hi Kim, good to see you, tell me how the move went and how the new place feels."),
    (KIM, f"It went well. Kim lives in {ERASED_WORD} now."),
    (SAM, "That sounds lovely, I have never been out that way but I hear it is very quiet."),
    (KIM, "It is quiet, I like it a lot."),
    *_filler(KIM, "house move", 6),
    (SAM, "Now about the book club next month, which book should we pick for the whole group."),
    (KIM, "Kim prefers Green Tea at the book club, by the way."),
    (SAM, "Noted, I will bring a pot of green tea and some biscuits for everyone there."),
    *_filler(KIM, "book club", 7),
])
B_SPLIT_LINE = 10
B_ERASE_LINE = 1

REC_C = Rec("c-e2e-c", "omi-pendant-1", at("14:00:00"), [
    (SAM, "Alex, quick update on the market launch before I head out for the evening today."),
    (ALEX, "Sure. Alex works at Northwind Traders now, I switched jobs last week."),
    (SAM, "Congratulations, that is big news, I will update the stall contact list tonight."),
    *_filler(ALEX, "stall contacts", 9),
])

REC_LATE = Rec("c-e2e-late", "phone-1", at("13:58:00"), [
    (SAM, "Alex, are you nearly here, I am waiting outside the cafe by the station right now."),
    (ALEX, "Two minutes away, I am parking the car."),
    *_filler(ALEX, "meeting point", 6),
])

DAY_RECS = [REC_A, REC_B, REC_C]


def live_then_final(rec: Rec, user_id: str, steps: int = 4) -> list[dict[str, Any]]:
    """What the plugin queues for one recording: live deltas (new or changed segments only,
    `new_or_changed`), then the final transcript from conversation.complete."""
    posts, sent = [], {}
    raw = rec.raw(final=False)
    for k in range(1, steps + 1):
        last = max(1, len(raw) * k // steps)
        delta, sent = mapping.new_or_changed(raw[:last], sent)
        if not delta:
            continue
        facts = rec.facts(user_id, raw[last - 1]["end"] + 1, final=False)
        data = {"conversation_id": rec.cid, "segments": delta, "timestamp_clock": "conversation"}
        bundle, why = mapping.build_bundle(mapping.EVENT_STREAMING, data, facts, OWNER_NAMES)
        assert bundle, why
        posts.append(mapping.ingest_request(user_id, bundle)[0])
    facts = rec.facts(user_id, rec.seconds(), final=True)
    bundle, why = mapping.build_bundle(mapping.EVENT_COMPLETE, {"conversation_id": rec.cid}, facts,
                                       OWNER_NAMES)
    assert bundle, why
    posts.append(mapping.ingest_request(user_id, bundle)[0])
    return posts
