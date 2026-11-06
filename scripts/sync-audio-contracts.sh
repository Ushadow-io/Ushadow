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

# Backend relay (ushadow/backend/src/services/audio_v2) uses the Python protobuf.
PY_SRC="$ROOT/chronicle/backend/src/backend/audio_contract/v2"
PY_DST="$ROOT/ushadow/backend/src/services/audio_v2"
cp "$PY_SRC/audio_pb2.py" "$PY_SRC/audio_pb2.pyi" "$PY_DST/"

echo "Synced audio-v2 contracts from chronicle@$REV"
