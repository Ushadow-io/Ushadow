"""Generate the 3-day SYNTHETIC fixture (invented people and places only).

  uv run python fixtures/synthetic/3day/make_fixture.py

Writes <date>.bundle.json + <date>.expected.json next to this file and ground_truth.json
(what a correct extractor should find, for the hand check). The story covers:
recurring people, a fact that changes over time (Maya's employer, Lena's home town,
the Heron deadline), commitments (one fulfilled), decisions, and a media line to drop.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent

# (conv id, day, start "HH:MM" UTC, recording id, source, [(speaker label, role, name)], lines)
# lines: (speaker label, text). Each line lasts 6 s with a 2 s gap.
CONVS = [
    ("c1", "2026-02-02", "09:00", "rec-0202-a", "src-pendant",
     [("S0", "owner", None), ("S1", "participant", "Maya Lindqvist")], [
        ("S0", "Morning Maya, how is the Heron migration going at Brightwater Labs?"),
        ("S1", "Slowly. I am the only data engineer on it at Brightwater right now."),
        ("S0", "Are you still planning to keep Heron on MongoDB?"),
        ("S1", "No, we decided this morning to move Heron to Postgres instead of MongoDB."),
        ("S0", "Good call. What is the deadline?"),
        ("S1", "The Heron go-live deadline is the twenty-eighth of February."),
        ("S0", "Can you send me the new schema draft?"),
        ("S1", "Yes, I will send you the schema draft by Friday."),
     ]),
    ("c2", "2026-02-02", "13:00", "rec-0202-b", "src-pendant",
     [("S0", "owner", None), ("S1", "participant", "Jonas Okafor"), ("S2", "media", None)], [
        ("S1", "Are we still doing the Riverside half marathon on the fifteenth of March?"),
        ("S0", "Yes, I signed us both up last night."),
        ("S2", "Coming up after the break, the traffic report for the ring road."),
        ("S1", "My left knee has been sore since Sunday, so I am resting it this week."),
        ("S0", "Take it easy. We can do short runs until it settles."),
     ]),
    ("c3", "2026-02-02", "18:30", "rec-0202-c", "src-phone",
     [("S0", "owner", None), ("S1", "participant", "Lena")], [
        ("S1", "Hi, it is Lena. Just calling from Leeds to say hello."),
        ("S0", "Hi sis. How is everyone in Leeds?"),
        ("S1", "Good. Ivy turns six on the twentieth of February, she wants a party."),
        ("S0", "I will buy Ivy a telescope for her birthday, she loves the stars."),
        ("S1", "She will be thrilled."),
     ]),
    ("c4", "2026-02-03", "10:00", "rec-0203-a", "src-pendant",
     [("S0", "owner", None), ("S1", "participant", "Maya Lindqvist"),
      ("S2", "participant", "Raj Patel")], [
        ("S2", "Hi, I am Raj Patel, I manage Maya's team at Brightwater Labs."),
        ("S2", "I approve the decision to move Heron to Postgres."),
        ("S1", "Thanks Raj. We also need more time for the migration."),
        ("S2", "Agreed. The Heron deadline moves from the twenty-eighth of February "
               "to the fourteenth of March."),
        ("S0", "That works for us."),
     ]),
    ("c5", "2026-02-03", "16:00", "rec-0203-b", "src-phone",
     [("S0", "owner", None), ("S1", "participant", "Jonas Okafor")], [
        ("S1", "Good news, my knee feels much better."),
        ("S1", "My physio, Doctor Elena Ruiz, says I can run again."),
        ("S0", "Great. Shall we run on Saturday at seven in the morning at Kelsey Park?"),
        ("S1", "Yes, Saturday at seven at Kelsey Park."),
     ]),
    ("c6", "2026-02-03", "20:00", "rec-0203-c", "src-phone",
     [("S0", "owner", None), ("S1", "participant", "Lena")], [
        ("S1", "Big news. I got the head teacher job at Elmfield Primary School in York."),
        ("S0", "Congratulations! So you are leaving Leeds?"),
        ("S1", "Yes, we are moving from Leeds to York in April."),
     ]),
    ("c7", "2026-02-04", "09:30", "rec-0204-a", "src-pendant",
     [("S0", "owner", None), ("S1", "participant", "Maya Lindqvist")], [
        ("S1", "I have news: I resigned from Brightwater Labs yesterday."),
        ("S1", "I now work at Northwind Analytics, I start there next Monday."),
        ("S0", "Wow. Who takes over Heron?"),
        ("S1", "Raj's team at Brightwater takes over the Heron migration."),
        ("S1", "And I sent you the schema draft this morning, as promised."),
        ("S0", "Got it, thanks Maya."),
     ]),
    ("c8", "2026-02-04", "15:00", "rec-0204-b", "src-pendant",
     [("S0", "owner", None), ("S1", "participant", "Jonas Okafor")], [
        ("S1", "Bad news, my knee flared up again after Saturday's run."),
        ("S1", "I have withdrawn from the Riverside half marathon."),
        ("S0", "Sorry to hear that. I will run the Riverside half marathon alone then."),
        ("S0", "By the way, I bought the telescope for Ivy yesterday."),
     ]),
]

GROUND_TRUTH = {
    "note": "SYNTHETIC. What a correct extractor should find. 'Owner' is the device owner.",
    "facts": [
        {"conv": "c1", "fact": "Maya Lindqvist works at Brightwater Labs as a data engineer",
         "valid": "until 2026-02-03 (resigned), superseded by c7"},
        {"conv": "c1", "fact": "Maya works on the Heron migration"},
        {"conv": "c1", "fact": "Decision 2026-02-02: Heron moves to Postgres instead of MongoDB"},
        {"conv": "c1", "fact": "Heron deadline is 2026-02-28", "valid": "superseded by c4"},
        {"conv": "c1", "fact": "Commitment: Maya sends Owner the schema draft by Friday 2026-02-06",
         "valid": "fulfilled in c7 (sent 2026-02-04)"},
        {"conv": "c2", "fact": "Owner and Jonas Okafor signed up for the Riverside half marathon "
                               "on 2026-03-15", "valid": "Jonas withdrew in c8"},
        {"conv": "c2", "fact": "Jonas's left knee is sore (since Sunday)", "valid": "better in c5, "
                                                                                     "flared again in c8"},
        {"conv": "c3", "fact": "Lena (Owner's sister) lives in Leeds", "valid": "moving to York in April"},
        {"conv": "c3", "fact": "Ivy (Lena's daughter, implied) turns six on 2026-02-20"},
        {"conv": "c3", "fact": "Commitment: Owner buys Ivy a telescope", "valid": "fulfilled in c8"},
        {"conv": "c4", "fact": "Raj Patel manages Maya's team at Brightwater Labs"},
        {"conv": "c4", "fact": "Raj approved the Postgres decision"},
        {"conv": "c4", "fact": "Heron deadline moved to 2026-03-14"},
        {"conv": "c5", "fact": "Jonas's physio is Dr Elena Ruiz; she says he can run again"},
        {"conv": "c5", "fact": "Plan: Owner and Jonas run Saturday 2026-02-07 07:00 at Kelsey Park"},
        {"conv": "c6", "fact": "Lena got the head teacher job at Elmfield Primary School in York"},
        {"conv": "c6", "fact": "Lena moves from Leeds to York in April 2026"},
        {"conv": "c7", "fact": "Maya resigned from Brightwater Labs on 2026-02-03"},
        {"conv": "c7", "fact": "Maya works at Northwind Analytics, starting Monday 2026-02-09"},
        {"conv": "c7", "fact": "Raj's team takes over the Heron migration"},
        {"conv": "c7", "fact": "Maya sent Owner the schema draft on 2026-02-04"},
        {"conv": "c8", "fact": "Jonas's knee flared up again after Saturday's run"},
        {"conv": "c8", "fact": "Jonas withdrew from the Riverside half marathon"},
        {"conv": "c8", "fact": "Owner will run the Riverside half marathon alone"},
        {"conv": "c8", "fact": "Owner bought the telescope for Ivy on 2026-02-03"},
    ],
    "traps": [
        "c2 media line (traffic report) must not produce a fact (it is dropped by role)",
        "Owner has no name: facts about 'Owner' are fine; inventing a name is an error",
        "Ivy is not stated to be Lena's daughter; 'Lena's daughter' is an inference",
        "c8 says Saturday's run happened; c7/c8 dates are relative ('yesterday', 'next Monday')",
    ],
}


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def build() -> None:
    days = sorted({c[1] for c in CONVS})
    truth_path = HERE / "ground_truth.json"
    truth_path.write_text(json.dumps(GROUND_TRUTH, indent=2) + "\n", encoding="utf-8")
    for day in days:
        d0 = datetime.fromisoformat(day)
        bundle = {"schemaVersion": "2.0.0",
                  "range": {"start": _iso(d0), "end": _iso(d0 + timedelta(days=1))},
                  "timezone": "Europe/London",
                  "sources": [
                      {"id": "src-pendant", "kind": "wearable", "modalities": ["audio_input"],
                       "label": "Synthetic pendant"},
                      {"id": "src-phone", "kind": "phone", "modalities": ["audio_input"],
                       "label": "Synthetic phone"}],
                  "recordings": [], "transcripts": [], "corrections": []}
        convs = []
        for cid, cday, hhmm, rec, src, speakers, lines in CONVS:
            if cday != day:
                continue
            t = datetime.fromisoformat(f"{day}T{hhmm}:00")
            start = t
            segs = []
            for i, (spk, text) in enumerate(lines):
                segs.append({"id": f"{rec}-{i}", "text": text, "speakerLabel": spk,
                             "start": _iso(t), "end": _iso(t + timedelta(seconds=6))})
                t += timedelta(seconds=8)
            end = t + timedelta(seconds=30)
            bundle["recordings"].append({"id": rec, "sourceId": src,
                                         "range": {"start": _iso(start), "end": _iso(end)},
                                         "currentTranscriptRevision": "r1"})
            spk_list = []
            for label, role, name in speakers:
                s = {"label": label, "role": role}
                if name:
                    s["displayName"] = name
                spk_list.append(s)
            bundle["transcripts"].append({"recordingId": rec, "revision": "r1",
                                          "createdAt": _iso(end), "model": "synthetic",
                                          "speakers": spk_list, "segments": segs})
            convs.append({"id": cid, "revision": 1, "title": f"synthetic {cid}",
                          "range": {"start": _iso(start), "end": _iso(end)},
                          "parts": [{"recordingId": rec,
                                     "range": {"start": _iso(start), "end": _iso(end)}}]})
        (HERE / f"{day}.bundle.json").write_text(json.dumps(bundle, indent=1) + "\n", encoding="utf-8")
        (HERE / f"{day}.expected.json").write_text(
            json.dumps({"date": day, "conversations": convs}, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {day}: {len(convs)} conversations")


if __name__ == "__main__":
    build()
