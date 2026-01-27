# Vibe Kanban Integration

Vibe Kanban is an open-source task management system for AI coding agents (Claude Code, Gemini CLI, Codex, etc.). This integration adds it to the Ushadow stack for orchestrating multiple AI agents in parallel.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               Ushadow Stack (Docker)                    │
│                                                         │
│  ├─ Vibe Kanban (port 3001)                            │
│  │  • Task management UI                               │
│  │  • REST API for integration                         │
│  │  • Workspace/worktree creation                      │
│  │                                                     │
│  ├─ Ushadow Backend (port 8000)                        │
│  ├─ Ushadow Frontend (port 3000)                       │
│  └─ Infrastructure (mongo, redis, postgres)            │
└─────────────────────────────────────────────────────────┘
         ▼                                  ▼
┌──────────────────────┐         ┌──────────────────────┐
│  Ushadow Launcher    │◄────────│  Tmux + Worktrees    │
│  (Tauri Desktop)     │         │  (Local)             │
│  • Polls VK API      │         │  • Persistent        │
│  • Creates tmux      │         │  • Multiple agents   │
│  • Monitors agents   │         │  • Visual feedback   │
└──────────────────────┘         └──────────────────────┘
```

## Setup

### 1. Clone Vibe Kanban

From the project root:

```bash
cd /Users/stu/repos/worktrees/ushadow/gold
git clone https://github.com/BloopAI/vibe-kanban.git
```

This creates `vibe-kanban/` alongside your existing directories.

### 2. Start the Service

**Option A: With your full stack**
```bash
docker compose --profile vibe-kanban up -d
```

**Option B: Just Vibe Kanban**
```bash
# Start infrastructure first (if not already running)
docker compose -f compose/docker-compose.infra.yml --profile infra up -d

# Start vibe-kanban (note: uses profile)
docker compose --profile vibe-kanban up vibe-kanban
```

### 3. Access the UI

Open in your browser: http://localhost:3001

The UI will guide you through:
- Creating a project
- Adding tasks
- Configuring which agent to use (Claude Code, Gemini CLI, etc.)

## API Integration (Future)

The Ushadow Launcher will integrate with Vibe Kanban via its REST API:

**Health Check:**
```bash
curl http://localhost:3001/api/health
```

**Get Tasks:**
```bash
curl "http://localhost:3001/api/tasks?project_id=YOUR_PROJECT_ID"
```

**Get Workspaces:**
```bash
curl "http://localhost:3001/api/workspaces?project_id=YOUR_PROJECT_ID"
```

### Planned Launcher Integration

1. **Task Discovery**
   - Launcher polls Vibe Kanban API every 5 seconds
   - Detects new workspaces/tasks

2. **Tmux Window Creation**
   - For each active workspace, create tmux window
   - Name: `ushadow-{task-id-slug}`
   - Working directory: workspace path

3. **Agent Execution**
   - Launch Claude Code in tmux window
   - Monitor execution status
   - Show progress in launcher UI

4. **Team Routing**
   - Route tasks to team-specific windows based on labels
   - Frontend team → `ushadow-frontend-team`
   - Backend team → `ushadow-backend-team`
   - Testing team → `ushadow-testing-team`

## Configuration

### Environment Variables

Set in `.env` or pass to docker compose:

```bash
# Disable workspace cleanup for debugging
VIBE_KANBAN_DISABLE_CLEANUP=1

# Change port (default 3001 to avoid conflict with frontend)
# Edit compose/vibe-kanban.yml ports section
```

### Shared Volumes

The container shares:
- `~/.gitconfig` - Git configuration
- `~/.ssh` - SSH keys for git operations
- `vibe-kanban-data` volume - Persistent task/workspace data

### Custom Git Config

Vibe Kanban uses your local git config. If you need different credentials for the container:

1. Create a custom gitconfig:
```bash
cat > config/vibe-kanban-gitconfig <<EOF
[user]
    name = Vibe Kanban Bot
    email = bot@example.com
[credential]
    helper = store
EOF
```

2. Update volume mount in `compose/vibe-kanban.yml`:
```yaml
volumes:
  - ./config/vibe-kanban-gitconfig:/home/appuser/.gitconfig:ro
```

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker compose logs vibe-kanban
```

**Common issues:**
- Vibe Kanban directory doesn't exist → Clone the repo first
- Port 3001 in use → Change port in compose file
- Build fails → Check Rust/Node versions in Dockerfile

### Can't Access UI

**Check container is running:**
```bash
docker compose ps | grep vibe-kanban
```

**Check health:**
```bash
curl http://localhost:3001/api/health
```

**Expected response:**
```json
{"success":true,"data":"OK","error_data":null,"message":null}
```

### Git Operations Fail

**SSH key permissions:**
The container needs read access to `~/.ssh`. Check permissions:
```bash
ls -la ~/.ssh
```

**Known hosts:**
If you get "Host key verification failed", add the git host to known_hosts:
```bash
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

## Updating Vibe Kanban

To update to the latest version:

```bash
cd vibe-kanban
git pull origin main
cd ..
docker compose build vibe-kanban
docker compose up -d vibe-kanban
```

## Removing Vibe Kanban

**Stop and remove container:**
```bash
docker compose down vibe-kanban
```

**Remove data volume:**
```bash
docker volume rm ushadow_vibe-kanban-data
```

**Remove code:**
```bash
rm -rf vibe-kanban/
```

## Next Steps

### Phase 1: Manual Testing
1. Create tasks in Vibe Kanban UI
2. Let it create workspaces
3. Observe how it organizes worktrees in `/repos`
4. Test agent execution

### Phase 2: Launcher Integration
1. Add Vibe Kanban API client to launcher
2. Poll for tasks/workspaces
3. Auto-create tmux windows
4. Launch Claude Code in windows
5. Display status in launcher UI

### Phase 3: Team Routing
1. Add task labeling support
2. Route by label to team windows
3. Parallel agent execution
4. Queue management per team

## References

- [Vibe Kanban GitHub](https://github.com/BloopAI/vibe-kanban)
- [Vibe Kanban Docs](https://vibekanban.com/docs)
- [Ushadow Launcher Roadmap](./ushadow/launcher/ROADMAP.md)
