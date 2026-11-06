"""Chronicle audio v2 relay support.

`audio_pb2.py` / `audio_pb2.pyi` are vendored from the chronicle submodule
(chronicle/backend/src/backend/audio_contract/v2). Regenerate with
scripts/sync-audio-contracts.sh; do not edit them by hand.
"""

from .relay import SUBPROTOCOL, run_v2_relay

__all__ = ["SUBPROTOCOL", "run_v2_relay"]
