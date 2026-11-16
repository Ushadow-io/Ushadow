"""life-datatypes v2 models used by the memory service.

`life_datatypes.py` is vendored from Ushadow-io/life-datatypes, branch schema-v2, commit 963eb3a
(schema/conversation.json sha256 db5bd4a46c0ef6932963718b38c73b9b909c76e4aba1e699b0fdecce45de45d7),
the same generated file and source commit as `ledger/src/ledger/schema/life_datatypes.py`.
It is a copy, not an import: the memory service never imports ledger code.
"""

from memory_service.schema.life_datatypes import (
    Conversation,
    ConversationPart,
    Direction,
    EntityKind,
    EvidenceRef,
    Fact,
    FactSource,
    FactSubject,
    FactValue,
    Segment,
    Sensitivity,
    Speaker,
    SpeakerRole,
    TimeRange,
    Transcript,
)

__all__ = [
    "Conversation",
    "ConversationPart",
    "Direction",
    "EntityKind",
    "EvidenceRef",
    "Fact",
    "FactSource",
    "FactSubject",
    "FactValue",
    "Segment",
    "Sensitivity",
    "Speaker",
    "SpeakerRole",
    "TimeRange",
    "Transcript",
]
