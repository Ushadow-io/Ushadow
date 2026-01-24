# Vibe Kanban Git Support Fix

## Problem

Vibe Kanban's Docker image was missing git, causing worktree creation to fail with:
```
git executable not found or not runnable
```

## Solution

Created a custom Dockerfile (`Dockerfile.ushadow`) that extends the original by adding git and SSH support to the runtime stage, with proper git config mounting strategy.

### Changes Made

1. **Created custom Dockerfile** (`vibe-kanban/Dockerfile.ushadow`):
   - Based on the original Vibe Kanban Dockerfile
   - Added `git` and `openssh-client` to runtime dependencies
   - Created `/config` directory for git config and SSH keys
   - Configured SSH to use mounted keys from `/config/ssh`
   - Maintains all original functionality

2. **Updated compose configuration** (`compose/vibe-kanban-compose.yml`):
   - Changed `dockerfile: Dockerfile` to `dockerfile: Dockerfile.ushadow`
   - Mounted host repos: `/Users/stu/repos:/repos`
   - Mounted git config to `/config/gitconfig` (not home directory)
   - Mounted SSH keys to `/config/ssh` (not home directory)
   - Set `GIT_CONFIG_GLOBAL=/config/gitconfig` to point git to config
   - Added persistent volume for Vibe Kanban data directory

3. **Increased backend timeout** (`ushadow/backend/src/services/docker_manager.py`):
   - Changed from 60s to 600s to handle Rust build times

### Why Mount to `/config` Instead of Home Directory?

Mounting `.gitconfig` directly to `/home/appuser/.gitconfig` caused Docker to create it as a directory due to permission conflicts, resulting in:
```
warning: unable to access '/home/appuser/.gitconfig': Is a directory
fatal: unknown error occurred while reading the configuration files
```

The solution mounts config files to `/config` and uses environment variables to point git to the correct location.

## Verification

```bash
# Check git is installed
docker exec ushadow-gold-vibe-kanban git --version
# Output: git version 2.52.0

# Verify git config is accessible
docker exec ushadow-gold-vibe-kanban git config --list | head -10
# Output: Shows user.name, user.email, etc.

# Verify SSH keys are mounted
docker exec ushadow-gold-vibe-kanban sh -c 'cat /home/appuser/.ssh/config'
# Output: Shows Include /config/ssh/config and IdentityFile entries

# Verify git can access repos
docker exec ushadow-gold-vibe-kanban sh -c 'cd /repos/Ushadow && git status'
# Output: Shows current branch and status

# Check service health
curl http://localhost:3001/api/health
# Output: {"success":true,"data":"OK"}
```

## Maintenance

When updating Vibe Kanban:

1. Pull latest from upstream:
   ```bash
   cd vibe-kanban
   git pull origin main
   ```

2. Check if the original Dockerfile changed:
   ```bash
   git diff HEAD~1 Dockerfile
   ```

3. If Dockerfile changed, update `Dockerfile.ushadow` to match, ensuring git stays in runtime dependencies:
   ```dockerfile
   RUN apk add --no-cache \
       ca-certificates \
       tini \
       libgcc \
       wget \
       git \
       openssh-client
   ```

4. Rebuild and restart:
   ```bash
   docker compose -f compose/vibe-kanban-compose.yml build vibe-kanban
   docker compose -f compose/vibe-kanban-compose.yml up -d vibe-kanban
   ```

## Repository Access

Vibe Kanban can now access:
- Main repo: `/repos/Ushadow`
- All worktrees: `/repos/worktrees/ushadow/*`
- Any other repos: `/repos/*`

When creating a project in Vibe Kanban UI:
- Use paths like `/repos/worktrees/ushadow/gold`
- Or `/repos/Ushadow` for the main repo
- Worktrees will be created in the same directory structure
