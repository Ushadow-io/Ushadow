# Shared Database Implementation Plan

**Status:** Planning Phase
**Created:** 2026-01-18
**Objective:** Enable optional database sharing across multiple Ushadow environments

---

## Table of Contents

- [Overview](#overview)
- [Current Architecture](#current-architecture)
- [Design Goals](#design-goals)
- [Proposed Architecture](#proposed-architecture)
- [Implementation Plan](#implementation-plan)
- [Data Flow](#data-flow)
- [Migration Strategy](#migration-strategy)
- [Security Considerations](#security-considerations)
- [Open Questions](#open-questions)

---

## Overview

Currently, each Ushadow environment (e.g., `gold`, `blue`, `red`) gets its own isolated MongoDB database (`ushadow_gold`, `ushadow_blue`, `ushadow_red`). This provides complete data isolation but makes it challenging to share credentials and configuration across environments.

With the addition of credential management in the launcher, we want to enable **optional database sharing** where multiple environments can use the same MongoDB database for shared secrets, user accounts, and configuration.

---

## Current Architecture

### Database Isolation

Each environment has complete database isolation:

```
Environment: gold
├── MongoDB: ushadow_gold
└── Redis: Database 11

Environment: blue
├── MongoDB: ushadow_blue
└── Redis: Database 5

Environment: red
├── MongoDB: ushadow_red
└── Redis: Database 8
```

### Configuration Files

**Location:** `setup/run.py:170-176`

```python
# Current logic
if env_name == APP_NAME:
    mongodb_database = APP_NAME
else:
    mongodb_database = f"{APP_NAME}_{env_name}"
```

**Generated `.env` file:**

```bash
ENV_NAME=gold
MONGODB_DATABASE=ushadow_gold  # Isolated database
REDIS_DATABASE=11              # Isolated Redis DB
```

### Credential Management

**Current state:**
- Admin credentials stored in launcher settings (`LauncherSettings`)
- Written to each environment's `config/SECRETS/secrets.yaml` on creation
- Each environment bootstraps its own admin user
- No synchronization between environments

**Location:** `ushadow/launcher/src/hooks/useTauri.ts:64-68`

```typescript
export interface LauncherSettings {
  default_admin_email: string | null
  default_admin_password: string | null
  default_admin_name: string | null
}
```

---

## Design Goals

1. **Optional Sharing:** Support both shared and isolated database modes
2. **Default Shared:** New users get shared database by default (better DX)
3. **Credential Sync:** Shared mode automatically syncs credentials across environments
4. **Redis Isolation:** Keep Redis databases isolated to prevent session conflicts
5. **Backward Compatible:** Existing isolated setups continue to work
6. **Migration Safety:** Clear warnings when switching modes
7. **Minimal Changes:** Leverage existing infrastructure where possible

---

## Proposed Architecture

### Two Database Modes

#### Mode 1: Shared (Recommended Default)

Multiple environments share the same MongoDB database but use **separate Redis databases** for session isolation.

```
Environment: gold
├── MongoDB: ushadow (SHARED)
└── Redis: Database 11

Environment: blue
├── MongoDB: ushadow (SHARED)
└── Redis: Database 5

Environment: red
├── MongoDB: ushadow (SHARED)
└── Redis: Database 8
```

**Benefits:**
- ✅ Credentials automatically synchronized
- ✅ Shared user accounts and API keys
- ✅ Consistent data across environments
- ✅ Better developer experience

**Trade-offs:**
- ⚠️ Cannot test database migrations independently
- ⚠️ Schema changes affect all environments

**Use case:** Development team wants consistent data across dev/staging/prod while maintaining session isolation.

---

#### Mode 2: Isolated (Current Behavior)

Each environment has its own MongoDB database AND Redis database.

```
Environment: gold
├── MongoDB: ushadow_gold (ISOLATED)
└── Redis: Database 11

Environment: blue
├── MongoDB: ushadow_blue (ISOLATED)
└── Redis: Database 5
```

**Benefits:**
- ✅ Complete environment independence
- ✅ Safe for testing schema changes
- ✅ Database migrations can be tested

**Trade-offs:**
- ⚠️ Credentials must be managed separately
- ⚠️ Data inconsistencies between environments

**Use case:** Testing database migrations, schema changes, or complete environment independence.

---

## Proposed Architecture

### 1. Launcher Settings Enhancement

**File:** `ushadow/launcher/src/hooks/useTauri.ts`

```typescript
export interface LauncherSettings {
  default_admin_email: string | null
  default_admin_password: string | null
  default_admin_name: string | null

  // NEW: Database sharing options
  database_mode: 'shared' | 'isolated'  // Default: 'shared'
  shared_database_name?: string         // Default: 'ushadow'
}
```

### 2. Environment Configuration Logic

**File:** `setup/run.py:170-176`

**Current:**
```python
if env_name == APP_NAME:
    mongodb_database = APP_NAME
else:
    mongodb_database = f"{APP_NAME}_{env_name}"
```

**Proposed:**
```python
# Read database mode from launcher settings or environment variable
database_mode = os.environ.get('DATABASE_MODE', 'shared')
shared_db_name = os.environ.get('SHARED_DATABASE_NAME', 'ushadow')

if database_mode == 'shared':
    # All environments use the same MongoDB database
    mongodb_database = shared_db_name
else:
    # Each environment gets its own database (current behavior)
    if env_name == APP_NAME:
        mongodb_database = APP_NAME
    else:
        mongodb_database = f"{APP_NAME}_{env_name}"

# Redis always isolated by environment
redis_db = find_available_redis_db(preferred_redis_db, env_name)
```

### 3. Settings UI Enhancement

**File:** `ushadow/launcher/src/components/SettingsDialog.tsx`

Add database mode selection:

```tsx
{/* Database Configuration Section */}
<div className="mb-6 pb-6 border-b border-surface-700">
  <h3 className="text-sm font-semibold text-text-primary mb-4">
    Database Configuration
  </h3>

  {/* Database Mode */}
  <div className="mb-4">
    <label className="block text-sm text-text-secondary mb-2">
      Database Mode
    </label>
    <select
      value={settings.database_mode || 'shared'}
      onChange={(e) => setSettings({
        ...settings,
        database_mode: e.target.value as 'shared' | 'isolated'
      })}
      className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
      data-testid="settings-database-mode"
    >
      <option value="shared">Shared (Recommended)</option>
      <option value="isolated">Isolated (Per-environment)</option>
    </select>
    <p className="text-xs text-text-muted mt-1">
      {settings.database_mode === 'shared'
        ? '✅ All environments share the same MongoDB database. Credentials and data are synchronized.'
        : '⚠️ Each environment has its own MongoDB database. Data is completely isolated.'}
    </p>
  </div>

  {/* Shared Database Name (only show in shared mode) */}
  {settings.database_mode === 'shared' && (
    <div className="mb-4">
      <label className="block text-sm text-text-secondary mb-2">
        Shared Database Name
      </label>
      <input
        type="text"
        value={settings.shared_database_name || 'ushadow'}
        onChange={(e) => setSettings({
          ...settings,
          shared_database_name: e.target.value
        })}
        className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
        placeholder="ushadow"
        data-testid="settings-shared-db-name"
      />
      <p className="text-xs text-text-muted mt-1">
        The MongoDB database name all environments will share
      </p>
    </div>
  )}
</div>

{/* Default Admin Credentials Section */}
<div>
  <h3 className="text-sm font-semibold text-text-primary mb-4">
    Default Admin Credentials
  </h3>
  <p className="text-sm text-text-secondary mb-4">
    {settings.database_mode === 'shared'
      ? 'Used to create the shared admin user (created once, used by all environments)'
      : 'Used to create admin users for each new environment'}
  </p>

  {/* ... existing admin name/email/password fields ... */}
</div>
```

---

## Implementation Plan

### Phase 1: Launcher Settings (2-3 hours)

**Files to modify:**
- `ushadow/launcher/src/hooks/useTauri.ts:64-68`
- `ushadow/launcher/src-tauri/src/main.rs` (Rust settings model)
- `ushadow/launcher/src/components/SettingsDialog.tsx`

**Tasks:**
1. Update `LauncherSettings` interface with `database_mode` and `shared_database_name`
2. Update Rust `LauncherSettings` struct to match
3. Enhance `SettingsDialog` UI with database mode selection
4. Add conditional rendering for shared database name field
5. Update settings persistence (load/save methods)
6. Test settings UI changes

**Deliverables:**
- Users can select database mode in settings
- Settings persist correctly
- UI provides clear feedback about each mode

---

### Phase 2: Environment Creation (2-3 hours)

**Files to modify:**
- `setup/run.py:generate_env_file()`
- `ushadow/launcher/src-tauri/src/main.rs` (Tauri commands)

**Tasks:**
1. Add `DATABASE_MODE` and `SHARED_DATABASE_NAME` environment variable support
2. Modify `generate_env_file()` to respect database mode
3. Update `.env` file generation logic (lines 170-176, 199)
4. Update `create_environment` Tauri command to pass database settings
5. Ensure environment variables are exported before calling `setup/run.py`
6. Test both shared and isolated mode environment creation

**Environment Variable Flow:**
```rust
// In Tauri create_environment command
std::env::set_var("DATABASE_MODE", settings.database_mode);
std::env::set_var("SHARED_DATABASE_NAME", settings.shared_database_name);
```

**Deliverables:**
- Shared mode creates environments with `MONGODB_DATABASE=ushadow`
- Isolated mode creates environments with `MONGODB_DATABASE=ushadow_{name}`
- Redis databases remain isolated in both modes

---

### Phase 3: Worktree Integration (1-2 hours)

**Files to modify:**
- `ushadow/launcher/src-tauri/src/main.rs` (worktree commands)

**Tasks:**
1. Update `createWorktreeWithWorkmux` to read and pass database settings
2. Ensure credentials are written correctly via `writeCredentialsToWorktree`
3. Test worktree creation with both database modes
4. Verify shared DB mode preserves credentials across environments

**Deliverables:**
- Worktree-based environments respect database mode
- Credentials are handled correctly in both modes

---

### Phase 4: Migration & Documentation (1 hour)

**Files to modify/create:**
- `docs/SHARED_DATABASE.md` (this file)
- `ushadow/ADDING_SERVICES.md` (update with database mode info)
- `ushadow/launcher/src/components/SettingsDialog.tsx` (add migration warnings)

**Tasks:**
1. Add migration warnings when switching between modes
2. Document trade-offs in existing documentation
3. Create user migration guide
4. Add FAQ section for common scenarios

**Deliverables:**
- Clear documentation on when to use each mode
- Migration path for existing users
- Warning dialogs before destructive operations

---

## Data Flow

```
┌─────────────────────────────────────────────────┐
│  Launcher UI (SettingsDialog)                   │
│  ┌──────────────────────────────────────────┐   │
│  │ Database Mode: [Shared ▼]                │   │
│  │ Shared DB Name: [ushadow        ]        │   │
│  │ Admin Email: [admin@example.com ]        │   │
│  │ Admin Password: [••••••••••••   ]        │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  User clicks "Save Settings"                     │
└─────────────────────────────────────────────────┘
                      ↓
           saveLauncherSettings()
                      ↓
┌─────────────────────────────────────────────────┐
│  Tauri Backend (Rust)                           │
│  • Stores settings in launcher config file      │
│  • Persists database mode preference            │
│  • Available for all environment operations     │
└─────────────────────────────────────────────────┘
                      ↓
         User creates new environment
              (via NewEnvironmentDialog)
                      ↓
┌─────────────────────────────────────────────────┐
│  createWorktreeWithWorkmux()                    │
│  1. Load LauncherSettings from config           │
│  2. Set DATABASE_MODE env var                   │
│  3. Set SHARED_DATABASE_NAME env var            │
│  4. Create worktree and branch                  │
│  5. Run: uv run setup/run.py --dev --quick      │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  setup/run.py                                   │
│  • Reads DATABASE_MODE from environment         │
│  • Reads SHARED_DATABASE_NAME from environment  │
│  • Generates .env file:                         │
│    - Shared: MONGODB_DATABASE=ushadow           │
│    - Isolated: MONGODB_DATABASE=ushadow_gold    │
│    - Redis always: REDIS_DATABASE=11            │
│  • Writes credentials to secrets.yaml           │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Docker Compose + Backend                       │
│  • Reads .env file                              │
│  • Connects to appropriate MongoDB database     │
│  • Uses isolated Redis for sessions             │
│  • Backend creates/reuses admin user            │
└─────────────────────────────────────────────────┘
```

---

## Migration Strategy

### Scenario A: Switching Isolated → Shared

**User Journey:**
1. User has existing environments with isolated databases:
   - `ushadow_gold` (has admin user + API keys)
   - `ushadow_blue` (has different admin user)
   - `ushadow_red` (empty)

2. User changes database mode to "Shared" in settings
3. Next time user creates/starts an environment, show warning:

```
┌────────────────────────────────────────────────┐
│  ⚠️ Database Mode Changed                      │
├────────────────────────────────────────────────┤
│                                                │
│  You've switched to Shared Database mode.     │
│                                                │
│  All new environments will use:               │
│    Database: ushadow                          │
│                                                │
│  Your existing isolated databases will        │
│  remain but won't be used:                    │
│    • ushadow_gold                             │
│    • ushadow_blue                             │
│    • ushadow_red                              │
│                                                │
│  💡 Tip: You can manually copy data from      │
│  an existing database to the shared one       │
│  using MongoDB tools.                         │
│                                                │
│  [Learn More]              [Continue]         │
└────────────────────────────────────────────────┘
```

**Recommended Steps:**
1. Choose which database contains the "source of truth" data
2. Manually export/import data if needed:
   ```bash
   # Export from isolated database
   mongodump --db ushadow_gold --out /tmp/backup

   # Import to shared database
   mongorestore --db ushadow /tmp/backup/ushadow_gold
   ```
3. Old isolated databases can be deleted or kept as backups

---

### Scenario B: Switching Shared → Isolated

**User Journey:**
1. User has environments sharing database `ushadow`
2. User changes database mode to "Isolated" in settings
3. Show warning before creating next environment:

```
┌────────────────────────────────────────────────┐
│  ⚠️ Database Mode Changed                      │
├────────────────────────────────────────────────┤
│                                                │
│  You've switched to Isolated Database mode.   │
│                                                │
│  New environments will create their own       │
│  databases (e.g., ushadow_gold).              │
│                                                │
│  Existing shared database "ushadow" will      │
│  remain but won't be used by new environments.│
│                                                │
│  ⚠️ Data will NOT be automatically copied     │
│  to new isolated databases.                   │
│                                                │
│  [Learn More]              [Continue]         │
└────────────────────────────────────────────────┘
```

**Recommended Steps:**
1. New environments start with fresh, empty databases
2. Default admin credentials from launcher settings are used
3. Optionally copy data from shared database manually

---

### Scenario C: First-Time Setup (New Users)

**User Journey:**
1. User installs Ushadow launcher
2. Opens Settings dialog
3. Database mode defaults to "Shared" (recommended)
4. User enters admin credentials
5. Creates first environment
6. Shared database `ushadow` is created automatically
7. All subsequent environments use the same database

**Benefits:**
- Best developer experience out of the box
- Credentials work across all environments
- No manual synchronization needed

---

## Security Considerations

### Redis Isolation (Critical)

**Why Redis MUST remain isolated:**

```python
# CORRECT: Each environment has isolated Redis
ENV: gold   → REDIS_DATABASE=11
ENV: blue   → REDIS_DATABASE=5
ENV: red    → REDIS_DATABASE=8
```

**Reasons:**
1. **Session Conflicts:** Shared Redis would cause session collisions
   - User logs into `gold` environment
   - Session stored in Redis
   - User visits `blue` environment
   - Session conflict or unexpected behavior

2. **Cache Pollution:** Temporary data from one env affects others
   - Dev environment caches might leak into staging
   - Cache invalidation becomes environment-wide

3. **Performance Impact:** All environments competing for same Redis instance
   - Rate limiting affects all environments
   - Cache eviction policies impact all envs

**Implementation:**
- Redis database assignment remains port-based (current behavior)
- No sharing even in "shared database mode"
- Only MongoDB is shared, not Redis

---

### Credential Synchronization

**Shared Mode:**
```
MongoDB (ushadow)
├── users collection
│   └── admin@example.com (shared across all envs)
├── secrets collection (planned: secret_store.py)
│   ├── openai_api_key (shared)
│   └── anthropic_api_key (shared)
```

**Benefits:**
- ✅ Single source of truth for credentials
- ✅ Update API key once, available everywhere
- ✅ Consistent admin access across environments

**Security Notes:**
- Shared database means shared security posture
- One compromised environment = all environments compromised
- Consider this when deciding between modes
- Production environments may warrant isolated mode

---

### Secrets Storage Migration

**Current State:** `config/SECRETS/secrets.yaml` (plaintext on disk)

**Planned:** Encrypted MongoDB storage (see `ushadow/backend/src/config/secret_store.py`)

**Impact on Shared DB:**
- When `SecretStore` is implemented, secrets will be in MongoDB
- Shared mode = secrets automatically available to all environments
- Isolated mode = each environment has own encrypted secrets
- Migration from secrets.yaml → MongoDB happens once per database

---

## Open Questions

### 1. Should Shared Mode be the Default?

**Proposal:** Yes, default to `database_mode: 'shared'`

**Rationale:**
- Better developer experience
- Matches user mental model (one project = one database)
- Reduces credential management friction
- Power users can opt into isolated mode if needed

**Decision:** ✅ Recommend shared as default

---

### 2. Automatic Data Migration?

**Option A:** Manual migration only
- User exports/imports data using MongoDB tools
- Provides more control
- Prevents accidental data loss

**Option B:** Automated migration wizard
- Launcher detects mode change
- Offers to copy data from primary database
- More user-friendly but riskier

**Proposal:** Start with **Option A** (manual), add Option B in future if needed

**Decision:** ⏳ Pending user feedback

---

### 3. Per-Environment Override?

**Scenario:** User wants mostly shared mode, but one production environment isolated

**Proposal:** Add per-environment override in future iteration
```typescript
interface Environment {
  name: string
  database_mode_override?: 'shared' | 'isolated' | null
  // null = use global setting
}
```

**Decision:** ⏳ Not in initial implementation, revisit based on user feedback

---

### 4. Handling Schema Changes

**Challenge:** In shared mode, schema migration affects all environments

**Options:**
1. **Coordination Required:** Run migrations on one environment, others pick up changes
2. **Migration Versioning:** Track which env last ran migrations
3. **Blue-Green Pattern:** Temporarily switch to isolated for schema changes

**Recommendation:** Document as a limitation of shared mode

**Workaround:**
```markdown
## Testing Schema Changes

If you need to test a schema migration:
1. Create a temporary environment in isolated mode
2. Test the migration
3. Once validated, run migration on shared database
4. All environments pick up changes automatically
```

**Decision:** ⏳ Document pattern, implement tooling if needed

---

### 5. Environment Variable Precedence

**Question:** What if user manually edits `.env` file?

**Proposed Precedence:**
1. Manual `.env` edit (highest priority)
2. `DATABASE_MODE` env var from launcher
3. Launcher settings
4. Default (`shared`)

**Implementation:**
```python
# In setup/run.py
database_mode = (
    os.environ.get('DATABASE_MODE') or  # Explicit override
    launcher_settings.database_mode or  # Launcher UI
    'shared'  # Default
)
```

**Decision:** ✅ Support environment variable override for advanced users

---

## Implementation Checklist

### Phase 1: Settings UI ✅
- [ ] Update `LauncherSettings` TypeScript interface
- [ ] Update `LauncherSettings` Rust struct
- [ ] Add database mode selection UI
- [ ] Add shared database name input
- [ ] Update conditional rendering in settings dialog
- [ ] Test settings persistence
- [ ] Add `data-testid` attributes for testing

### Phase 2: Environment Creation ✅
- [ ] Modify `setup/run.py:generate_env_file()`
- [ ] Add `DATABASE_MODE` env var support
- [ ] Add `SHARED_DATABASE_NAME` env var support
- [ ] Update `.env` generation logic
- [ ] Update Tauri `create_environment` command
- [ ] Test shared mode environment creation
- [ ] Test isolated mode environment creation
- [ ] Verify Redis databases remain isolated

### Phase 3: Worktree Integration ✅
- [ ] Update `createWorktreeWithWorkmux` to pass settings
- [ ] Test worktree creation in shared mode
- [ ] Test worktree creation in isolated mode
- [ ] Verify credential handling

### Phase 4: Migration & Docs ✅
- [ ] Create migration warnings UI
- [ ] Write user documentation
- [ ] Update `ADDING_SERVICES.md`
- [ ] Add FAQ section
- [ ] Create troubleshooting guide

---

## File Locations Reference

### Frontend (Launcher)
```
ushadow/launcher/src/
├── hooks/useTauri.ts:64-68              # LauncherSettings interface
├── components/SettingsDialog.tsx        # Settings UI
├── components/NewEnvironmentDialog.tsx  # Environment creation UI
└── store/appStore.ts                    # App state (not used for DB settings)
```

### Backend (Rust - Tauri)
```
ushadow/launcher/src-tauri/src/
└── main.rs                              # Tauri commands, settings persistence
```

### Python Setup Scripts
```
setup/
├── run.py:170-176                       # Database name generation
├── run.py:199                           # .env file generation
└── setup_utils.py                       # Redis DB allocation
```

### Configuration
```
.env                                     # Generated environment config
config/SECRETS/secrets.yaml              # Current secrets storage (to be deprecated)
```

### Backend (Python)
```
ushadow/backend/src/config/
├── secret_store.py                      # Planned encrypted secrets (MongoDB)
└── secrets.py                           # Secret detection/masking utilities
```

---

## Next Steps

1. **Review & Approval:** Get stakeholder approval on design
2. **Prioritize Open Questions:** Make decisions on pending items
3. **Create Implementation Tasks:** Break into discrete tickets
4. **Implementation:** Follow 4-phase plan
5. **Testing:** Both manual and automated tests
6. **Documentation:** Update all relevant docs
7. **User Communication:** Announce feature, provide migration guide

---

## References

- [Setup Run Script](../setup/run.py)
- [Launcher Settings Dialog](../ushadow/launcher/src/components/SettingsDialog.tsx)
- [Secret Store Plan](../ushadow/backend/src/config/secret_store.py)
- [Environment Configuration](../.env)

---

**Document Version:** 1.0
**Last Updated:** 2026-01-18
**Author:** Development Team
**Status:** Planning Phase
