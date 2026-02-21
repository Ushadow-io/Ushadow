# Kanban + Tmux Integration

This document describes the integrated kanban ticket system that links with the launcher's tmux and worktree management.

## Overview

The kanban system provides:
- **Ticket Management**: Create, track, and organize development tasks
- **Epic Grouping**: Group related tickets with shared branches and color teams
- **Tmux Integration**: Each ticket automatically gets its own tmux window
- **Context Sharing**: Tickets with matching tags or in the same epic share context
- **Shared Branches**: Multiple tickets can collaborate on a single branch

## Architecture

### Backend (Python/FastAPI)

**Models** (`ushadow/backend/src/models/kanban.py`):
- `Epic`: Groups related tickets with shared branch and color
- `Ticket`: Individual work items with 1:1 tmux window mapping
- `TicketStatus`: Enum for workflow states (backlog, todo, in_progress, in_review, done, archived)
- `TicketPriority`: Enum for urgency levels (low, medium, high, urgent)

**API Router** (`ushadow/backend/src/routers/kanban.py`):
- `POST /api/kanban/epics` - Create epic
- `GET /api/kanban/epics` - List epics (with optional project filter)
- `GET /api/kanban/epics/{id}` - Get epic details
- `PATCH /api/kanban/epics/{id}` - Update epic
- `DELETE /api/kanban/epics/{id}` - Delete epic (unlinks tickets)
- `POST /api/kanban/tickets` - Create ticket
- `GET /api/kanban/tickets` - List tickets (filters: project, epic, status, tags, assigned_to)
- `GET /api/kanban/tickets/{id}` - Get ticket details
- `PATCH /api/kanban/tickets/{id}` - Update ticket
- `DELETE /api/kanban/tickets/{id}` - Delete ticket
- `GET /api/kanban/tickets/{id}/related` - Find related tickets (epic + tags)
- `GET /api/kanban/stats` - Board statistics

### Launcher Backend (Rust/Tauri)

**Tmux Integration** (`ushadow/launcher/src-tauri/src/commands/kanban.rs`):
- `create_ticket_worktree()` - Create worktree and tmux window for ticket
- `attach_ticket_to_worktree()` - Attach ticket to existing worktree (for shared branches)
- `get_tickets_for_tmux_window()` - Query tickets using a tmux window
- `get_ticket_tmux_info()` - Get tmux details for a ticket

**How It Works**:
1. When creating a ticket with epic → checks if epic has shared branch
2. If shared branch exists → attach to existing worktree
3. If no shared branch → create new worktree with `create_worktree_with_workmux`
4. Tmux window naming: `ushadow-{branch_name}` or `ushadow-ticket-{id}`
5. Session name: `workmux` (default)

### Frontend (React/TypeScript)

**Components** (`ushadow/launcher/src/components/`):
- `KanbanBoard.tsx` - Main board with column layout
- `TicketCard.tsx` - Individual ticket card with color team visualization
- `CreateTicketDialog.tsx` - Modal for creating new tickets
- `CreateEpicDialog.tsx` - Modal for creating new epics

**Navigation**:
- Added "Kanban" tab to launcher navigation (Install | Infra | Environments | **Kanban**)
- Full-screen kanban view when activated
- Automatically uses first running environment's backend URL

**Color Teams**:
Tickets inherit colors through three-level fallback:
1. Ticket's own color (if set)
2. Epic's color (if ticket belongs to epic)
3. Generated color (hash-based from ticket ID)

## Workflow Examples

### Creating an Epic with Shared Branch

```bash
# 1. Create epic via API or UI
POST /api/kanban/epics
{
  "title": "Authentication Overhaul",
  "color": "#8B5CF6",
  "base_branch": "main",
  "project_id": "/path/to/project"
}

# Epic gets created with no branch yet (branch_name: null)
# When first ticket is created, shared branch gets created
```

### Creating Tickets in an Epic

```bash
# 2. Create first ticket
POST /api/kanban/tickets
{
  "title": "Add JWT token validation",
  "epic_id": "epic-id-here",
  "priority": "high"
}

# Launcher creates worktree for this ticket:
# - Branch: "epic-auth-overhaul" (derived from epic title)
# - Tmux window: "ushadow-epic-auth-overhaul"

# 3. Create second ticket in same epic
POST /api/kanban/tickets
{
  "title": "Add refresh token rotation",
  "epic_id": "epic-id-here",
  "priority": "medium"
}

# Launcher attaches to existing worktree:
# - Same branch: "epic-auth-overhaul"
# - Same tmux window: "ushadow-epic-auth-overhaul"
# Both tickets share context!
```

### Tag-Based Context Sharing

```bash
# Tickets with matching tags can find each other even across epics
POST /api/kanban/tickets
{
  "title": "Update login API",
  "tags": ["api", "auth"],
  "epic_id": "epic-1"
}

POST /api/kanban/tickets
{
  "title": "Add API rate limiting",
  "tags": ["api", "security"],
  "epic_id": "epic-2"  # Different epic!
}

# Find related tickets
GET /api/kanban/tickets/ticket-1-id/related
# Returns both epic tickets AND tickets with shared tags
```

## Configuration

### Backend Setup

1. **Database**: MongoDB (Beanie ODM)
   - Collections: `tickets`, `epics`
   - Indexes: status, epic_id, project_id, tags, assigned_to

2. **Registration**: Already added to `main.py`
   ```python
   from src.models.kanban import Ticket, Epic
   from src.routers import kanban

   await init_beanie(database=db, document_models=[User, Ticket, Epic])
   app.include_router(kanban.router, tags=["kanban"])
   ```

### Frontend Setup

1. **App Store**: Added `'kanban'` to `AppMode` type in `store/appStore.ts`

2. **Navigation**: Added kanban tab to `App.tsx`
   ```tsx
   <button onClick={() => setAppMode('kanban')}>
     <Trello className="w-3 h-3 inline mr-1" />
     Kanban
   </button>
   ```

3. **Rendering**: Kanban board renders when `appMode === 'kanban'`

## Key Design Decisions

### 1. Simple 1:1 Ticket-Tmux Mapping
Each ticket = exactly one tmux window. This keeps the mental model simple.

**Alternative considered**: One ticket = multiple windows (frontend, backend, tests)
**Why rejected**: Added complexity without clear benefit for most workflows

### 2. Epic + Tag Based Context Sharing
Enables both structured (epic) and ad-hoc (tag) relationships.

**Structured (Epic)**: "All auth tickets share same branch"
**Ad-hoc (Tags)**: "All tickets tagged 'api' can see each other"

### 3. Shared Branches for Epic Tickets
Tickets in the same epic use one shared branch.

**Alternative considered**: One branch per ticket with merging
**Why rejected**: Sharing context across tickets is the explicit goal

### 4. Standalone Kanban (No External Dependency)
Built directly into launcher, no vibe-kanban required.

**Alternative considered**: Two-way sync with vibe-kanban
**Why rejected**: Simpler architecture, fewer moving parts

## Color Team System

Color inheritance creates visual organization:

```
Epic: "Authentication" (Purple #8B5CF6)
  ├─ Ticket 1: "JWT validation" (inherits purple)
  ├─ Ticket 2: "Refresh tokens" (inherits purple)
  └─ Ticket 3: "OAuth flow" (overrides with orange)

Epic: "Database" (Green #10B981)
  ├─ Ticket 4: "Add indexes" (inherits green)
  └─ Ticket 5: "Migration" (inherits green)
```

Visual indicators:
- **Ticket card border**: 4px left border in team color
- **Epic badge**: Badge with epic color at 20% opacity
- **Generated colors**: Hash-based HSL when no color set

## Next Steps / TODOs

### Immediate
- [ ] Add "Create Ticket from Environment" button to EnvironmentsPanel
  - **Decision needed**: Where to place button? (card action, context menu, or details panel)
  - See `KANBAN_INTEGRATION.md` for options

### Enhancements
- [ ] Drag-and-drop to change ticket status
- [ ] Ticket detail modal with full description + comments
- [ ] Assign tickets to users (already has `assigned_to` field)
- [ ] Epic progress visualization (% tickets complete)
- [ ] Timeline view (Gantt chart style)
- [ ] Sprint planning mode
- [ ] Ticket time tracking integration with tmux activity

### Integration Opportunities
- [ ] Auto-create ticket when running `/commit` in tmux
- [ ] Show active ticket in launcher status bar
- [ ] Link tickets to PRs via GitHub integration
- [ ] Chronicle integration (link tickets to memories)
- [ ] Notification when ticket's tmux window becomes inactive

## Testing

### Backend API Testing
```bash
# Start backend
cd ushadow/backend
uv run main.py

# Create epic
curl -X POST http://localhost:8000/api/kanban/epics \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Epic", "color": "#3B82F6", "base_branch": "main"}'

# Create ticket
curl -X POST http://localhost:8000/api/kanban/tickets \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Ticket", "priority": "medium", "tags": ["test"]}'

# List tickets
curl http://localhost:8000/api/kanban/tickets
```

### Frontend Testing
```bash
# Start launcher
cd ushadow/launcher
npm run dev

# Navigate to Kanban tab
# Should see empty kanban board
# Click "New Epic" or "New Ticket" to create items
```

### Tmux Integration Testing
```bash
# From launcher, create ticket via UI
# Check tmux window created
tmux list-windows -t workmux

# Should see: ushadow-{branch-name}
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Vibe Launcher (Tauri)                 │
├─────────────────────────────────────────────────────────┤
│  Navigation: [Install] [Infra] [Environments] [Kanban]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │          KanbanBoard Component                  │    │
│  │  ┌──────┬──────┬──────┬──────┬──────┐         │    │
│  │  │Back- │ To   │ In   │ In   │ Done │         │    │
│  │  │log   │ Do   │Prog  │Review│      │         │    │
│  │  ├──────┼──────┼──────┼──────┼──────┤         │    │
│  │  │[Card]│[Card]│[Card]│[Card]│[Card]│         │    │
│  │  │[Card]│[Card]│      │      │[Card]│         │    │
│  │  │      │[Card]│      │      │      │         │    │
│  │  └──────┴──────┴──────┴──────┴──────┘         │    │
│  │                                                 │    │
│  │  Epic Filter: [All Tickets ▼]                 │    │
│  │  Actions: [New Epic] [New Ticket]             │    │
│  └────────────────────────────────────────────────┘    │
│                         │                               │
│                         │ API Calls                     │
│                         ▼                               │
└─────────────────────────┬───────────────────────────────┘
                          │
                          │
┌─────────────────────────▼───────────────────────────────┐
│              Backend (FastAPI + MongoDB)                 │
├─────────────────────────────────────────────────────────┤
│  Routers:                                                │
│    /api/kanban/tickets                                   │
│    /api/kanban/epics                                     │
│    /api/kanban/stats                                     │
│                                                          │
│  Models:                                                 │
│    ┌──────────┐         ┌──────────┐                   │
│    │  Epic    │         │  Ticket  │                   │
│    │─────────│         │──────────│                   │
│    │ title    │1      ∞│ title    │                   │
│    │ color    │◀───────│ epic_id  │                   │
│    │ branch   │         │ tags[]   │                   │
│    │ base_br  │         │ status   │                   │
│    └──────────┘         │ tmux_win │                   │
│                         │ branch   │                   │
│                         └──────────┘                   │
│                              │                           │
│                              │ Worktree Creation         │
│                              ▼                           │
└─────────────────────────────┬───────────────────────────┘
                              │
                              │
┌─────────────────────────────▼───────────────────────────┐
│         Tauri Commands (Rust) + Tmux                     │
├─────────────────────────────────────────────────────────┤
│  create_ticket_worktree()                                │
│    ├─ git worktree add                                   │
│    ├─ tmux new-window -n ushadow-{branch}               │
│    └─ cd {worktree_path}                                 │
│                                                          │
│  attach_ticket_to_worktree()                             │
│    └─ verify tmux window exists                         │
│                                                          │
│  Tmux Session: "workmux"                                 │
│    ├─ Window: ushadow-epic-auth (3 tickets)            │
│    ├─ Window: ushadow-ticket-123 (1 ticket)            │
│    └─ Window: ushadow-database (2 tickets)             │
└─────────────────────────────────────────────────────────┘
```

## Files Modified/Created

### Backend
- ✅ `ushadow/backend/src/models/kanban.py` - Data models
- ✅ `ushadow/backend/src/routers/kanban.py` - API routes
- ✅ `ushadow/backend/main.py` - Router registration + Beanie init

### Launcher Backend
- ✅ `ushadow/launcher/src-tauri/src/commands/kanban.rs` - Tmux integration commands
- ✅ `ushadow/launcher/src-tauri/src/commands/mod.rs` - Module exports
- ✅ `ushadow/launcher/src-tauri/src/main.rs` - Command registration

### Frontend
- ✅ `ushadow/launcher/src/components/KanbanBoard.tsx` - Main board
- ✅ `ushadow/launcher/src/components/TicketCard.tsx` - Ticket cards
- ✅ `ushadow/launcher/src/components/CreateTicketDialog.tsx` - Ticket creation modal
- ✅ `ushadow/launcher/src/components/CreateEpicDialog.tsx` - Epic creation modal
- ✅ `ushadow/launcher/src/store/appStore.ts` - Added 'kanban' mode
- ✅ `ushadow/launcher/src/App.tsx` - Navigation + routing

### Documentation
- ✅ `KANBAN_INTEGRATION.md` - This file!
