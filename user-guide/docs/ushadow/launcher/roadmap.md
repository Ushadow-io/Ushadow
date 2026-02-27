---
title: Roadmap
sidebar_position: 101
---


## Vision

The Ushadow Launcher aims to be a comprehensive development environment orchestration tool that bridges project management (Vibe Kanban), local development (worktrees + tmux), and remote development (Tailscale-connected instances). It enables developers to seamlessly work on multiple tasks in parallel, switch between local and remote environments, and maintain persistent development sessions.

## Current State (Phase 1: Local Tmux Integration) ✅

**Platform Support**: macOS only for terminal opening. Linux/Windows have placeholder code that won't work reliably. See [CROSS_PLATFORM_TERMINAL.md](./CROSS_PLATFORM_TERMINAL.md) for cross-platform strategy.

### What We've Built

**Fast Environment Detection**
- 10-second tailscale status caching
- Reduced environment ready time from 12+ seconds to ~2 seconds
- Smart polling that doesn't spam slow external checks

**Persistent Tmux Sessions**
- Auto-start tmux server on launcher startup
- Single `workmux` session for all worktrees
- Per-environment tmux windows: `ushadow-{env-name}`
- Terminal.app integration (macOS) - click button to open and attach

**Visual Feedback**
- Global "Tmux" button showing all sessions/windows
- Per-environment tmux button (purple terminal icon)
- Real-time activity badges (🤖 Working, 💬 Waiting, ✅ Done, ❌ Error)
- Activity log with success/error messages

**Worktree Management**
- Create worktrees via launcher UI
- Merge & Cleanup with rebase
- Delete environments (containers + worktree + tmux)
- VS Code integration with environment colors

### Architecture Foundation

```
┌─────────────────────────────────────────────┐
│         Ushadow Launcher (Tauri)            │
│  ┌──────────────┐      ┌─────────────────┐ │
│  │   Frontend   │ ◄──► │   Rust Backend  │ │
│  │  (React/TS)  │      │   (Commands)    │ │
│  └──────────────┘      └─────────────────┘ │
└─────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
    ┌────────┐    ┌─────────┐    ┌─────────┐
    │ Docker │    │  Tmux   │    │   Git   │
    │Compose │    │ Server  │    │Worktree │
    └────────┘    └─────────┘    └─────────┘
```

## Phase 2: Vibe Kanban Integration (In Progress)

### Vision

Vibe Kanban is a task management system that automatically provisions development environments for each task. When you pick up a task, you get a fresh worktree, tmux session, and containerized environment - all preconfigured and ready to code.

### Observed Pattern

Current Vibe Kanban worktrees follow this structure:
```
/tmp/vibe-kanban/worktrees/
├── 5349-install-and-inte/
│   └── Ushadow/  (branch: vk/5349-install-and-inte)
├── 8e65-install-and-inte/
│   └── Ushadow/  (branch: vk/8e65-install-and-inte)
└── a56a-create-an-overvi/
    └── Ushadow/  (branch: vk/a56a-create-an-overvi)
```

### Planned Integration

**Task-Driven Worktree Creation**
- Detect Vibe Kanban tasks from API or webhook
- Auto-create worktree: `{task-id}-{task-description}`
- Auto-create branch: `vk/{task-id}-{task-description}`
- Auto-start containers with task-specific config
- Auto-create tmux window in workmux session

**Kanban Board View in Launcher**
- Show tasks from Vibe Kanban API
- Display task status: Todo, In Progress, Review, Done
- Click task to create/switch to its environment
- Visual indication of which tasks have active environments
- Drag-and-drop to change task status (updates Kanban + git)

**Task Context Awareness**
- Store task metadata in `.env.{task-id}` file
- Display task description in environment card
- Link to Kanban board from launcher
- Show task assignee, labels, due date
- Integration with PR creation (auto-link task ID)

**Lifecycle Management**
- Auto-archive worktrees when task marked as Done
- Prompt to merge when moving to Review column
- Cleanup stale task environments (configurable timeout)
- Preserve tmux logs for completed tasks

### Implementation Checklist

**Backend (Rust)**
- [ ] Add Vibe Kanban API client
- [ ] Implement task polling/webhook receiver
- [ ] Create `create_task_environment(task_id, description)` command
- [ ] Add task metadata storage/retrieval
- [ ] Implement task status sync
- [ ] Add cleanup job for stale tasks

**Frontend (TypeScript)**
- [ ] Create Kanban board component
- [ ] Add task cards with environment status
- [ ] Implement drag-and-drop status changes
- [ ] Add "Create from Task" dialog
- [ ] Show task metadata on environment cards
- [ ] Add task filtering/search

**Integration**
- [ ] Define Vibe Kanban API contract
- [ ] Set up authentication/authorization
- [ ] Implement webhook receiver for task updates
- [ ] Add configuration UI for Kanban connection
- [ ] Create task template system

### Configuration

```yaml
# ~/.ushadow/vibe-kanban.yml
vibe_kanban:
  enabled: true
  api_url: "https://kanban.example.com/api"
  api_token: "${VIBE_KANBAN_TOKEN}"
  worktree_dir: "/tmp/vibe-kanban/worktrees"
  auto_create_environments: true
  auto_cleanup_days: 7
  branch_prefix: "vk"
  task_id_format: "{id}-{slug}"
```

## Phase 3: Remote Development Management (Planned)

### Vision

Enable seamless development on remote machines (cloud VMs, development servers) with the same UX as local development. The launcher becomes a unified control panel for both local and remote environments.

### Use Cases

**Remote Development Server**
- Company provides beefy dev servers (GPU, RAM, CPU)
- Developers connect via Tailscale
- Launcher manages remote worktrees, tmux, containers
- Terminal sessions tunnel through to remote tmux
- VS Code Remote-SSH integration

**Cloud Staging Environments**
- Each task gets a cloud instance for testing
- Auto-provision on task start
- Auto-destroy on task completion
- Share preview URL with team via Tailscale
- Cost tracking per task/developer

**Multi-Region Development**
- Work on low-latency servers near customers
- Test region-specific features
- Replicate production topology
- Debug region-specific issues

### Architecture

```
┌──────────────────────────────────────────────────────┐
│              Ushadow Launcher (Local)                │
│  Shows both local and remote environments            │
└──────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌──────────────────────┐
│ Local Machine   │          │  Remote Server(s)    │
│                 │          │  (via Tailscale)     │
│ • Tmux          │          │  • Tmux              │
│ • Docker        │          │  • Docker            │
│ • Worktrees     │          │  • Worktrees         │
└─────────────────┘          │  • Ushadow Agent     │
                             └──────────────────────┘
```

### Components

**Ushadow Agent (Remote)**
- Lightweight daemon running on remote servers
- Exposes Tauri-like command API over HTTP/gRPC
- Manages worktrees, tmux, containers remotely
- Reports status back to launcher
- Handles authentication via Tailscale identity

**Launcher Remote Manager**
- Discover remote agents via Tailscale
- Display remote environments alongside local ones
- Tunnel terminal connections (SSH + tmux)
- Sync git credentials securely
- Monitor remote resource usage

**Terminal Tunneling**
- Click remote env's tmux button → SSH tunnel opens
- Local Terminal.app connects to remote tmux
- Seamless experience (user doesn't see SSH)
- Clipboard sync over SSH
- Port forwarding for web UIs

### Implementation Checklist

**Phase 3.1: Remote Agent**
- [ ] Design Ushadow Agent API (gRPC/HTTP)
- [ ] Implement agent in Rust (reuse launcher commands)
- [ ] Add Tailscale identity authentication
- [ ] Package agent as systemd service
- [ ] Create agent installation script
- [ ] Build agent configuration UI

**Phase 3.2: Remote Discovery**
- [ ] Implement Tailscale device discovery
- [ ] Detect Ushadow Agents on Tailscale network
- [ ] Show remote servers in launcher UI
- [ ] Display remote environment status
- [ ] Health checking for remote agents

**Phase 3.3: Remote Control**
- [ ] Implement SSH tunnel management
- [ ] Remote tmux attach via SSH
- [ ] Remote command execution via agent
- [ ] VS Code Remote-SSH integration
- [ ] Port forwarding for web UIs

**Phase 3.4: Provisioning**
- [ ] Terraform/cloud provider integration
- [ ] Auto-provision VMs for tasks
- [ ] Auto-destroy on task completion
- [ ] Cost estimation/tracking
- [ ] Multi-cloud support (AWS, GCP, Azure)

### Security Considerations

**Authentication**
- Tailscale identity as primary auth
- Agent API keys for additional security
- SSH key management (agent forwarding)
- No passwords, all key-based

**Authorization**
- Per-agent ACLs (who can control what)
- Workspace isolation (multi-tenant support)
- Audit logging for remote commands
- Rate limiting on agent API

**Data Protection**
- Git credential forwarding over SSH
- Encrypted environment variables
- Secrets management integration (Vault, 1Password)
- No secrets stored in launcher config

## Phase 4: Advanced Features (Future)

### Team Collaboration

**Shared Environments**
- Multiple developers in same tmux session (tmate/teleconsole)
- Real-time code pairing
- Environment sharing via Tailscale URL
- Session recording/replay

**Environment Templates**
- Pre-configured stacks (Next.js, Django, Go microservices)
- One-click environment setup from template
- Template marketplace/sharing
- Version-controlled templates

### CI/CD Integration

**PR Previews**
- Auto-create environment for each PR
- Run tests in isolated environment
- Deploy preview to Tailscale URL
- Auto-cleanup on PR merge/close

**Pipeline Debugging**
- Reproduce CI environment locally
- Attach to failed pipeline containers
- Interactive debugging of CI failures
- Log aggregation across environments

### Observability

**Metrics & Monitoring**
- CPU/RAM/Disk usage per environment
- Container health metrics
- Tmux session activity tracking
- Cost attribution per task/developer

**Distributed Tracing**
- Trace requests across environments
- Service mesh visualization
- Performance profiling
- Error tracking integration (Sentry)

### AI/LLM Integration

**Intelligent Environment Management**
- AI suggests which environments to cleanup
- Auto-detects stuck/idle containers
- Recommends resource allocation
- Task estimation based on environment usage

**Code Context Awareness**
- Claude/GPT integration with environment context
- "Fix this error in my tmux session"
- "Deploy this branch to remote staging"
- Natural language environment control

## Integration Points

### External Tools

| Tool | Integration | Status |
|------|-------------|--------|
| Git | Worktree creation, branch management | ✅ Complete |
| Tmux | Session management, terminal access | ✅ Complete |
| Docker | Container orchestration | ✅ Complete |
| VS Code | Editor integration, color coding | ✅ Complete |
| Tailscale | Networking, remote access | ✅ Partial |
| Vibe Kanban | Task management | 🚧 Planned |
| GitHub/GitLab | PR creation, CI status | 🚧 Planned |
| Slack/Discord | Notifications | 🚧 Planned |
| Terraform | Cloud provisioning | 🚧 Planned |
| Kubernetes | Container orchestration | 🚧 Planned |

### API Design

**Launcher → Agent Communication**
```rust
// Unified command interface for local and remote
trait EnvironmentManager {
    async fn create_worktree(name: String, base_branch: String) -> Result<WorktreeInfo>;
    async fn start_containers(env_name: String) -> Result<()>;
    async fn attach_tmux(env_name: String) -> Result<()>;
    async fn get_status() -> Result<EnvironmentStatus>;
}

// Local implementation (current)
struct LocalManager { /* ... */ }

// Remote implementation (future)
struct RemoteManager {
    agent_url: String,
    ssh_tunnel: SshTunnel,
}
```

**Vibe Kanban Integration**
```typescript
interface VibeKanbanTask {
  id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  assignee: string
  labels: string[]
  due_date: string | null
  environment?: {
    created: boolean
    running: boolean
    worktree_path: string
    tmux_window: string
  }
}

interface VibeKanbanAPI {
  getTasks(): Promise<VibeKanbanTask[]>
  updateTaskStatus(taskId: string, status: string): Promise<void>
  createEnvironment(taskId: string): Promise<void>
  destroyEnvironment(taskId: string): Promise<void>
}
```

## Migration Path

### From Current State → Vibe Kanban Integration

1. **Manual Testing** (Current)
   - User manually creates worktrees in `/tmp/vibe-kanban/worktrees/`
   - Tests naming conventions and workflows
   - Validates integration points

2. **API Stub** (Next)
   - Create mock Vibe Kanban API
   - Implement basic task CRUD
   - Test launcher integration

3. **Backend Integration** (Then)
   - Connect to real Vibe Kanban API
   - Implement webhook receiver
   - Add task lifecycle management

4. **UI Polish** (Finally)
   - Build Kanban board view
   - Add drag-and-drop
   - Polish UX based on feedback

### From Vibe Kanban → Remote Management

1. **Agent Development**
   - Extract launcher commands into shared library
   - Build standalone agent
   - Test local agent on same machine

2. **Remote Discovery**
   - Integrate Tailscale device API
   - Detect agents on network
   - Display in launcher UI

3. **Remote Control**
   - Implement SSH tunneling
   - Test remote tmux attach
   - Validate remote command execution

4. **Provisioning**
   - Start with manual VM setup
   - Add Terraform templates
   - Automate end-to-end

## Success Metrics

### Phase 2 (Vibe Kanban)
- [ ] 90% of tasks have auto-created environments
- [ ] Less than 10 seconds from task assignment to ready environment
- [ ] 0 manual worktree creation commands
- [ ] Less than 1 minute to switch between task environments

### Phase 3 (Remote Management)
- [ ] Remote environments feel as fast as local
- [ ] Less than 5 second latency for terminal access
- [ ] 100% of remote commands succeed (reliability)
- [ ] Less than 2 minutes to provision new cloud instance

### Overall
- [ ] Developers work on 3+ parallel tasks seamlessly
- [ ] 50% reduction in environment setup time
- [ ] 80% reduction in "works on my machine" issues
- [ ] Net Promoter Score >50

## Questions to Answer

### Vibe Kanban
- [ ] What is the Vibe Kanban API endpoint/protocol?
- [ ] How do we authenticate (API token, OAuth, Tailscale identity)?
- [ ] What triggers environment creation (task status change, webhook)?
- [ ] How do we handle task reassignment (transfer environment ownership)?
- [ ] What happens to environments when tasks are archived?

### Remote Management
- [ ] Which cloud providers to support first (AWS, GCP, Azure)?
- [ ] What VM specs to use (CPU, RAM, disk)?
- [ ] How to handle cost allocation (per user, per task, per team)?
- [ ] Should we support on-prem servers (not just cloud)?
- [ ] How to handle agent updates (auto-update, manual)?

### General
- [ ] Multi-tenancy: support multiple organizations/teams?
- [ ] Pricing model: free tier, per-user, per-environment?
- [ ] Windows/Linux support priority (currently macOS-focused)?
- [ ] Open source vs proprietary (current code, agent, Kanban)?

## Next Steps

### Immediate (This Week)
1. Document Vibe Kanban integration requirements
2. Design task → environment mapping
3. Create mock Kanban API for testing
4. Build basic Kanban board UI component

### Short-term (This Month)
1. Implement Vibe Kanban API client
2. Add webhook receiver for task updates
3. Build task-driven worktree creation
4. Test end-to-end workflow with real tasks

### Medium-term (This Quarter)
1. Design Ushadow Agent API
2. Build agent prototype
3. Test agent on remote server via Tailscale
4. Implement SSH tunneling for remote tmux

### Long-term (This Year)
1. Production-ready agent deployment
2. Cloud provisioning automation
3. Multi-cloud support
4. Team collaboration features

---

**This roadmap is a living document. Update it as we build, learn, and pivot.**
