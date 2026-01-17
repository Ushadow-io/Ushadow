# Ushadow Version Management

This document describes how to manage versions across the Ushadow platform and create GitHub releases.

## Overview

Ushadow uses a **centralized version management system** that keeps all packages (frontend, backend, launcher, mobile) synchronized at the same version. The version is tied to GitHub releases for proper change tracking.

## Quick Start

### View Current Version

```bash
./scripts/sync-version.sh get
```

### Bump Version

```bash
# Patch version (0.1.0 → 0.1.1)
./scripts/sync-version.sh bump patch

# Minor version (0.1.0 → 0.2.0)
./scripts/sync-version.sh bump minor

# Major version (0.1.0 → 1.0.0)
./scripts/sync-version.sh bump major
```

### Set Specific Version

```bash
./scripts/sync-version.sh set 1.2.3
```

## Version Storage Locations

The sync script updates versions in all these files:

| File | Path | Format |
|------|------|--------|
| Frontend | `ushadow/frontend/package.json` | `"version": "0.1.0"` |
| Backend | `ushadow/backend/pyproject.toml` | `version = "0.1.0"` |
| Launcher | `ushadow/launcher/package.json` | `"version": "0.1.0"` |
| Launcher Tauri | `ushadow/launcher/src-tauri/tauri.conf.json` | `"version": "0.1.0"` |
| Launcher Cargo | `ushadow/launcher/src-tauri/Cargo.toml` | `version = "0.1.0"` |
| Mobile | `ushadow/mobile/package.json` | `"version": "0.1.0"` |

## Creating a Release

### 1. Update Version Across All Packages

```bash
# Bump the version
./scripts/sync-version.sh bump minor

# Current version will be displayed
```

### 2. Commit the Version Changes

```bash
git add .
git commit -m "Bump version to v0.2.0"
```

### 3. Create and Push Version Tag

```bash
# Create annotated tag
git tag -a v0.2.0 -m "Release v0.2.0"

# Push commits and tags
git push origin main
git push origin v0.2.0
```

### 4. Automatic GitHub Release

The GitHub Actions workflow (`.github/workflows/release.yml`) will automatically:

1. **Detect the tag** - Triggers when you push a tag like `v0.2.0`
2. **Verify consistency** - Checks that all package versions match the tag
3. **Generate changelog** - Creates changelog from commits since last release
4. **Create GitHub release** - Publishes the release with auto-generated notes

## How Version Display Works

### Frontend Footer

The footer at the bottom of the application displays the version dynamically:

1. **Backend API** - The `/api/version` endpoint serves version from `pyproject.toml`
2. **Frontend Fetch** - `EnvironmentFooter` component fetches version on mount
3. **Fallback** - Defaults to `0.1.0` if API is unavailable

### Backend API

```bash
# Check backend version
curl http://localhost:8000/api/version

# Response:
{
  "version": "0.1.0",
  "api_version": "v1"
}
```

## Release Workflow Example

Here's a complete example of releasing version 0.2.0:

```bash
# 1. Make your changes and commit them
git add .
git commit -m "Add new feature XYZ"

# 2. Bump version to 0.2.0
./scripts/sync-version.sh bump minor
# Output: Bumping version from 0.1.0 to 0.2.0 (minor)

# 3. Commit version changes
git add .
git commit -m "Bump version to v0.2.0"

# 4. Create annotated tag
git tag -a v0.2.0 -m "Release v0.2.0

Features:
- New feature XYZ
- Performance improvements

Bug Fixes:
- Fixed issue ABC
"

# 5. Push everything
git push origin main
git push origin v0.2.0

# 6. Wait for GitHub Actions
# Check: https://github.com/Ushadow-io/Ushadow/actions

# 7. Release is published!
# View: https://github.com/Ushadow-io/Ushadow/releases/tag/v0.2.0
```

## Versioning Strategy

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.1.0): New features, backwards-compatible
- **PATCH** (0.0.1): Bug fixes, backwards-compatible

### When to Bump

| Change Type | Version Bump | Example |
|------------|--------------|---------|
| Bug fix | PATCH | 0.1.0 → 0.1.1 |
| New feature | MINOR | 0.1.0 → 0.2.0 |
| Breaking change | MAJOR | 0.1.0 → 1.0.0 |
| Security patch | PATCH | 0.1.0 → 0.1.1 |
| Dependency update | PATCH | 0.1.0 → 0.1.1 |

## Pre-release Versions

For alpha, beta, or release candidates:

```bash
./scripts/sync-version.sh set 1.0.0-alpha.1
./scripts/sync-version.sh set 1.0.0-beta.1
./scripts/sync-version.sh set 1.0.0-rc.1
```

Pre-release tags are automatically marked as "pre-release" on GitHub.

## Troubleshooting

### Version Mismatch Error

If the GitHub Actions workflow fails with a version mismatch:

```bash
# Check all versions
grep -r "version" ushadow/frontend/package.json
grep -r "version" ushadow/backend/pyproject.toml

# Re-sync to fix
./scripts/sync-version.sh set 0.2.0
git add .
git commit --amend --no-edit
git push --force
```

### Footer Shows Wrong Version

The frontend caches the version. To force refresh:

1. Clear browser cache
2. Hard reload (Cmd+Shift+R or Ctrl+Shift+F5)
3. Restart backend if needed

### Script Permission Denied

```bash
chmod +x scripts/sync-version.sh
```

## CI/CD Integration

The release workflow is defined in `.github/workflows/release.yml`:

- **Trigger**: Push tags matching `v*.*.*`
- **Permissions**: Requires `contents: write` for creating releases
- **Steps**:
  1. Extract version from tag
  2. Verify all package versions match
  3. Generate changelog from git history
  4. Create GitHub release with notes

## Future Enhancements

Potential improvements to the version system:

- [ ] Automated version bumping based on commit messages (conventional commits)
- [ ] Release notes template for GitHub releases
- [ ] Docker image tagging with version
- [ ] Version endpoint for launcher and mobile apps
- [ ] Automated changelog generation from PR labels
