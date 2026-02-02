# Building and Pushing Images to GHCR

This guide explains how to build and push Chronicle and Mycelia Docker images to GitHub Container Registry (ghcr.io).

## Prerequisites

### 1. Docker Buildx

Ensure you have Docker with buildx support:
```bash
docker buildx version
```

### 2. GitHub Container Registry Access

Login to GHCR with a Personal Access Token (PAT):

```bash
# Create a PAT at https://github.com/settings/tokens
# Required scopes: write:packages, read:packages

echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## Quick Commands

### Build and Push Chronicle

```bash
# Build and push with default tag (latest)
make chronicle-push

# Build and push with specific tag
make chronicle-push TAG=v1.0.0
```

**This builds:**
- `ghcr.io/ushadow-io/chronicle-backend:latest` (or your TAG)
- `ghcr.io/ushadow-io/chronicle-webui:latest` (or your TAG)

**Platforms:**
- linux/amd64
- linux/arm64

### Build and Push Mycelia

```bash
# Build and push with default tag (latest)
make mycelia-push

# Build and push with specific tag
make mycelia-push TAG=v2.0.0
```

**This builds:**
- `ghcr.io/ushadow-io/mycelia-backend:latest` (or your TAG)

**Platforms:**
- linux/amd64
- linux/arm64

## What Happens Under the Hood

The Makefile targets use `scripts/build-and-push.sh` which:

1. **Creates a buildx builder** (if needed): `ushadow-builder`
2. **Builds multi-arch images** for AMD64 and ARM64
3. **Pushes to ghcr.io/ushadow-io** registry
4. **Tags with your specified version**

### Chronicle Build Details

```bash
# Backend
Context: chronicle/backends/advanced/
Dockerfile: chronicle/backends/advanced/Dockerfile
Image: ghcr.io/ushadow-io/chronicle-backend:TAG

# WebUI
Context: chronicle/backends/advanced/webui/
Dockerfile: chronicle/backends/advanced/webui/Dockerfile
Image: ghcr.io/ushadow-io/chronicle-webui:TAG
```

### Mycelia Build Details

```bash
# Backend (context is mycelia root)
Context: mycelia/
Dockerfile: mycelia/backend/Dockerfile
Image: ghcr.io/ushadow-io/mycelia-backend:TAG
```

Note: Mycelia's Dockerfile is at `mycelia/backend/Dockerfile` but the build context is `mycelia/` because it needs to copy from multiple subdirectories (`./backend`, `./myceliasdk`, etc.).

## Advanced Usage

### Using the Build Script Directly

If you need more control, use the underlying script:

```bash
# Chronicle backend
./scripts/build-and-push.sh chronicle/backends/advanced latest chronicle-backend

# Chronicle webui
./scripts/build-and-push.sh chronicle/backends/advanced/webui latest chronicle-webui

# Mycelia backend (from mycelia directory)
cd mycelia
../scripts/build-and-push.sh . latest mycelia-backend
```

### Building Without Pushing

For local testing without pushing to GHCR:

```bash
# Chronicle backend (local only)
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag chronicle-backend:test \
    chronicle/backends/advanced

# Load for local use (single platform)
docker buildx build \
    --platform linux/amd64 \
    --tag chronicle-backend:test \
    --load \
    chronicle/backends/advanced
```

## Troubleshooting

### Builder Not Found

```bash
# Create the buildx builder manually
docker buildx create --name ushadow-builder --driver docker-container --bootstrap
docker buildx use ushadow-builder
```

### Authentication Errors

```bash
# Re-login to GHCR
docker logout ghcr.io
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Build Failures

Check the Dockerfile exists:
```bash
ls -la chronicle/backends/advanced/Dockerfile
ls -la chronicle/backends/advanced/webui/Dockerfile
ls -la mycelia/backend/Dockerfile
```

## CI/CD Integration

These same commands can be used in GitHub Actions:

```yaml
- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Build and Push Chronicle
  run: make chronicle-push TAG=${{ github.ref_name }}
```

## Image Visibility

By default, images pushed to ghcr.io are private. To make them public:

1. Go to https://github.com/orgs/ushadow-io/packages
2. Find your package (chronicle-backend, mycelia-backend, etc.)
3. Click "Package settings"
4. Scroll to "Change package visibility"
5. Choose "Public"

## Pulling Images

After pushing, others can pull:

```bash
docker pull ghcr.io/ushadow-io/chronicle-backend:latest
docker pull ghcr.io/ushadow-io/chronicle-webui:latest
docker pull ghcr.io/ushadow-io/mycelia-backend:latest
```

## Related Commands

- `make chronicle-build-local` - Build Chronicle locally without pushing
- `make chronicle-dev` - Build and run Chronicle locally for development
- See `make help` for all available commands
