#!/usr/bin/env bash
# Copy Chronicle's generated audio-v2 contracts into the Ushadow mobile app.
#
# The mobile app vendors these files instead of using a file: dependency on the
# chronicle submodule, because EAS builds do not check out submodules.
# Run this after bumping the chronicle submodule, then commit the result.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/chronicle/contracts/audio/v2/typescript"
DST="$ROOT/ushadow/mobile/app/protocol/contracts"
REV="$(git -C "$ROOT/chronicle" rev-parse --short HEAD)"

cp "$SRC/backend/audio_contract/v2/audio_pb.ts" "$DST/audio_pb.ts"
sed "s#'./backend/audio_contract/v2/audio_pb'#'./audio_pb'#" "$SRC/codec.ts" > "$DST/codec.ts"
cat > "$DST/index.ts" <<EOF
// Vendored from chronicle@$REV contracts/audio/v2/typescript.
// Regenerate with: scripts/sync-audio-contracts.sh (do not edit by hand).
export * from './audio_pb';
export * from './codec';
EOF

# Upstream's audio-v2 socket client, unchanged.
cp "$ROOT/chronicle/app/src/protocol/audioV2Socket.ts" "$DST/../audioV2Socket.ts"

# Web frontend uses the same TypeScript contracts and socket client.
WEB_DST="$ROOT/ushadow/frontend/src/protocol/audio-v2"
mkdir -p "$WEB_DST/contracts"
cp "$DST/audio_pb.ts" "$DST/codec.ts" "$DST/index.ts" "$WEB_DST/contracts/"
cp "$DST/../audioV2Socket.ts" "$WEB_DST/audioV2Socket.ts"

# Backend relay (ushadow/backend/src/services/audio_v2) uses the Python protobuf.
PY_SRC="$ROOT/chronicle/backend/src/backend/audio_contract/v2"
PY_DST="$ROOT/ushadow/backend/src/services/audio_v2"
cp "$PY_SRC/audio_pb2.py" "$PY_SRC/audio_pb2.pyi" "$PY_DST/"

echo "Synced audio-v2 contracts from chronicle@$REV"
