#!/bin/bash
# Build the Chronicle backend image (backend + workers) for the local K8s registry.
#
# Builds from the committed chronicle submodule HEAD (git archive), so local
# uncommitted edits in chronicle/ never end up in the image. Adds the ushadow-prod
# stage (discovery.py + plugins baked in; K8s has no compose bind mounts).
#
# Pushes two tags:
#   <registry>/chronicle-backend:latest           what the cluster runs (CHRONICLE_BACKEND_IMAGE)
#   <registry>/chronicle-backend:<branch>-<sha>   fixed tag, for rollback
#
# Usage: K8S_REGISTRY=anubis:32000 ./scripts/chronicle-push-local.sh
set -euo pipefail

REGISTRY="${K8S_REGISTRY:-anubis:32000}"
PLATFORM="${PLATFORM:-linux/amd64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHRONICLE="$ROOT/chronicle"

branch="$(git -C "$CHRONICLE" rev-parse --abbrev-ref HEAD)"
sha="$(git -C "$CHRONICLE" rev-parse --short=8 HEAD)"
fixed_tag="${branch//\//-}-${sha}"
image="$REGISTRY/chronicle-backend"

if [[ -n "$(git -C "$CHRONICLE" status --porcelain)" ]]; then
  echo "note: chronicle/ has uncommitted changes; they are NOT in this image (building $sha)"
fi

src="$(mktemp -d -t chronicle-src)"
dockerfile="$(mktemp -t chronicle-Dockerfile)"
trap 'rm -rf "$src" "$dockerfile"' EXIT

git -C "$CHRONICLE" archive HEAD | tar -x -C "$src"
cat "$src/backend/Dockerfile" "$ROOT/docker/chronicle-backend/ushadow-stage.Dockerfile" > "$dockerfile"

echo "Building $image:$fixed_tag ($PLATFORM)"
docker build \
  --platform "$PLATFORM" \
  --file "$dockerfile" \
  --target ushadow-prod \
  --build-context "chronicle_root=$src" \
  --build-arg "CHRONICLE_BUILD_VERSION=$fixed_tag" \
  --tag "$image:$fixed_tag" \
  --tag "$image:latest" \
  "$src/backend"

docker push "$image:$fixed_tag"
docker push "$image:latest"

echo "Pushed $image:$fixed_tag and $image:latest"
echo "Next: make chronicle-redeploy-k8s"
