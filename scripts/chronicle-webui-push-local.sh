#!/bin/bash
# Build the Chronicle web UI image for the local K8s registry.
#
# Builds from the committed chronicle submodule HEAD (git archive), so local
# uncommitted edits in chronicle/ never end up in the image. Uses our own
# production Dockerfile (docker/chronicle-webui/), because upstream ships only
# Dockerfile.dev. Its .dockerignore sends only backend/webui and the audio
# contract to the builder.
#
# Pushes two tags:
#   <registry>/chronicle-webui:latest           what the cluster runs (CHRONICLE_WEBUI_IMAGE)
#   <registry>/chronicle-webui:<branch>-<sha>   fixed tag, for rollback
#
# Usage: K8S_REGISTRY=anubis:32000 ./scripts/chronicle-webui-push-local.sh
set -euo pipefail

REGISTRY="${K8S_REGISTRY:-anubis:32000}"
PLATFORM="${PLATFORM:-linux/amd64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHRONICLE="$ROOT/chronicle"

branch="$(git -C "$CHRONICLE" rev-parse --abbrev-ref HEAD)"
sha="$(git -C "$CHRONICLE" rev-parse --short=8 HEAD)"
fixed_tag="${branch//\//-}-${sha}"
image="$REGISTRY/chronicle-webui"

if [[ -n "$(git -C "$CHRONICLE" status --porcelain)" ]]; then
  echo "note: chronicle/ has uncommitted changes; they are NOT in this image (building $sha)"
fi

src="$(mktemp -d -t chronicle-webui-src)"
trap 'rm -rf "$src"' EXIT

git -C "$CHRONICLE" archive HEAD | tar -x -C "$src"
# Keep the Dockerfile and its .dockerignore side by side so the ignore file applies.
cp "$ROOT/docker/chronicle-webui/Dockerfile" "$src/webui.Dockerfile"
cp "$ROOT/docker/chronicle-webui/Dockerfile.dockerignore" "$src/webui.Dockerfile.dockerignore"

echo "Building $image:$fixed_tag ($PLATFORM)"
docker build \
  --platform "$PLATFORM" \
  --file "$src/webui.Dockerfile" \
  --tag "$image:$fixed_tag" \
  --tag "$image:latest" \
  "$src"

docker push "$image:$fixed_tag"
docker push "$image:latest"

echo "Pushed $image:$fixed_tag and $image:latest"
echo "Next: make chronicle-webui-redeploy-k8s"
