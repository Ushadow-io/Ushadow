---
name: shared-ecosystem
description: Full reference for the ushadow-io shared component ecosystem — repo structure, conventions, versioning, and the extract-don't-duplicate rule.
user-invocable: false
---

# Ushadow Shared Components Methodology

This skill governs how reusable code, UI, scripts, and skills are identified,
extracted, published, and consumed across all `ushadow-io` projects.

---

## The Golden Rule

> **Never duplicate. Extract, publish, consume.**

If you find yourself writing something that could be useful in more than one
project — stop. Check whether it already exists in the shared ecosystem first.
If it doesn't, finish a rough in-situ implementation, then extract it properly.

---

## The Shared Ecosystem at a Glance

All shared assets live under the `ushadow-io` GitHub organisation.

| Type | Repo | Published As | Consumed Via |
|---|---|---|---|
| React / UI components | `ushadow-io/ui` | `@ushadow/ui` npm package | `pnpm add @ushadow/ui` |
| Python utilities | `ushadow-io/py-common` | pip package (GitHub Packages or git ref) | `pyproject.toml` git ref |
| Shell / utility scripts | `ushadow-io/scripts` | raw GitHub URL or git submodule | `curl` or `.tooling/` submodule |
| Claude Skills | `ushadow-io/skills` | `.skill` file or raw SKILL.md | copied into `.claude/skills/` |
| Project templates | `ushadow-io/project-template` | GitHub template repo | `gh repo create --template` |
| Config / standards | `ushadow-io/playbook` | raw GitHub URL or cloned | read directly / referenced |

---

## Step 1 — Identify What Type of Thing This Is

Ask yourself (or the user):

- **Is it UI / React?** → `ushadow-io/ui`
- **Is it Python logic / utilities?** → `ushadow-io/py-common`
- **Is it a shell script / dev tool / setup helper?** → `ushadow-io/scripts`
- **Is it a Claude agent instruction / workflow?** → `ushadow-io/skills`
- **Is it a config file or project scaffold?** → `ushadow-io/project-template` or `ushadow-io/playbook`

If it spans multiple types (e.g. a bug reporter needs a React component AND a
Python API endpoint), split the extraction across the relevant repos and document
the relationship in `ushadow-io/playbook`.

---

## Step 2 — Check If It Already Exists

Before writing anything new, check the **playbook index** — it is the authoritative catalogue of all shared assets:

```bash
gh api repos/Ushadow-io/ushadow-sdk/contents/playbook/INDEX.md --jq '.content' | base64 -d
```

Only do a raw tree walk if the INDEX doesn't cover what you're looking for.

---

## Step 3 — Extraction Workflow

### 3a. Finish the In-Situ Implementation First

Do **not** context-switch mid-feature to do the extraction. Finish the rough
working version inside the current project. Open a GitHub issue in the relevant
shared repo to track the extraction:

```
Title: Extract <feature name> from <project name>
Body:
  - Current location: src/components/BugReporter.tsx
  - Target repo: ushadow-io/ui
  - Dependencies: @ushadow/api-client, react-hook-form
  - Notes: needs projectId + userId props
```

### 3b. Extract Into the Shared Repo

Clone the target shared repo and create a feature branch:

```bash
git clone git@github.com:ushadow-io/ui.git
cd ui
git checkout -b feat/bug-reporter
```

Structure the component / module following the conventions below, then open a PR.

### 3c. Version and Release

All shared repos use **semantic versioning** with conventional commits.

```bash
# After PR merge, tag a release
git tag v1.2.0
git push origin v1.2.0
```

For `@ushadow/ui`, publish to GitHub Packages:

```bash
pnpm publish --access restricted
```

For `ushadow-io/py-common`, a git tag is sufficient — consuming projects pin to a tag.

### 3d. Update the Playbook Index

After publishing, update `ushadow-io/playbook/INDEX.md` with the new asset:

```markdown
| bug-reporter | React component | @ushadow/ui >= 1.2.0 | Floating button + modal, posts to /api/v1/bugs |
```

---

## Step 4 — Consuming Shared Assets

### Frontend (React) — `@ushadow/ui`

```bash
pnpm add @ushadow/ui
```

If not yet published (in active development), reference via git:

```bash
pnpm add github:ushadow-io/ui#v1.2.0
```

Usage:

```tsx
import { BugReporter } from '@ushadow/ui'

<BugReporter projectId="mycelia" userId={user.id} />
```

### Python — `ushadow-py-common`

In `pyproject.toml`:

```toml
[project]
dependencies = [
  "ushadow-common @ git+https://github.com/ushadow-io/py-common.git@v1.0.0"
]
```

Install:

```bash
uv pip install -e .   # or: pip install -e .
```

Usage:

```python
from ushadow_common.bug_reporting import submit_bug
from ushadow_common.auth import verify_token
```

### Scripts — `ushadow-io/scripts`

**One-shot execution:**

```bash
curl -fsSL https://raw.githubusercontent.com/ushadow-io/scripts/main/setup-project.sh | bash
```

**As a persistent submodule** (for scripts needed regularly):

```bash
git submodule add git@github.com:ushadow-io/scripts.git .tooling
```

Then in `.gitmodules` pin to a tag.

### Claude Skills — `ushadow-io/skills`

Copy the relevant skill into the project's `.claude/skills/` directory:

```bash
curl -fsSL https://raw.githubusercontent.com/ushadow-io/skills/main/INDEX.md
# Pick what's relevant, then:
curl -fsSL https://raw.githubusercontent.com/ushadow-io/skills/main/bug-reporter/SKILL.md \
  > .claude/skills/bug-reporter.md
```

Or, if the skills repo is cloned on this machine:

```bash
cp ~/repos/ushadow-io/skills/bug-reporter/SKILL.md .claude/skills/
```

---

## Repo Conventions

### `ushadow-io/ui` Structure

```
ui/
  src/
    components/
      BugReporter/
        index.tsx          ← component
        BugReporter.test.tsx
        README.md          ← props, usage example, peer deps
    hooks/
    utils/
  index.ts                 ← barrel export
  package.json             ← name: "@ushadow/ui"
```

Every exported component **must** have a `README.md` covering:
- Purpose
- Props / API
- Peer dependencies
- Minimal usage example

### `ushadow-io/py-common` Structure

```
py-common/
  ushadow_common/
    bug_reporting/
      __init__.py
      client.py
      models.py
    auth/
    telemetry/
  pyproject.toml
  README.md
```

### `ushadow-io/scripts` Structure

```
scripts/
  setup-project.sh
  sync-secrets.sh
  dev-tools/
    install-pnpm.sh
  README.md               ← catalogue of all scripts with one-liner descriptions
```

### `ushadow-io/skills` Structure

```
skills/
  shared-components/      ← this skill lives here
    SKILL.md
  bug-reporter/
    SKILL.md
  INDEX.md                ← catalogue of all skills with descriptions
```

---

## Setting Up a New Project

When bootstrapping a new `ushadow-io` project:

1. **Create from template:**
   ```bash
   gh repo create ushadow-io/my-new-project \
     --template ushadow-io/project-template \
     --private
   ```

2. **Install shared frontend deps (if JS/TS):**
   ```bash
   pnpm add @ushadow/ui
   ```

3. **Add shared Python deps (if Python):**
   ```toml
   "ushadow-common @ git+https://github.com/ushadow-io/py-common.git@v1.0.0"
   ```

4. **Copy relevant skills:**
   ```bash
   mkdir -p .claude/skills
   # Check INDEX.md, then pull what's relevant
   curl -fsSL https://raw.githubusercontent.com/ushadow-io/skills/main/INDEX.md
   ```

5. **Check the playbook** for standards that apply to this project type:
   ```
   https://github.com/ushadow-io/playbook
   ```

---

## The "Extract Don't Duplicate" Rule — For Agents

When working on any `ushadow-io` project and you encounter logic that is:

- A UI pattern used more than once across projects
- A utility function that looks like it was copied from elsewhere
- Any helper prefixed with "this is the same as in X"

**Stop. Do the following:**

1. Check `ushadow-io/playbook/INDEX.md` for an existing shared version
2. If it exists — consume it (see Step 4 above), do not reimplement
3. If it doesn't exist — implement in-situ, then open a GitHub issue in the correct
   shared repo to track the extraction. Include file path and a one-line description
4. Do **not** proceed by duplicating. Flag it to the user if unsure

---

## Playbook INDEX.md Format

`ushadow-io/playbook/INDEX.md` uses this structure — keep it up to date whenever
a new shared asset is published:

```markdown
## UI Components (@ushadow/ui)
| Name | Min Version | Description |
|---|---|---|
| BugReporter | 1.2.0 | Floating bug report button + modal |
| Toast | 1.0.0 | Notification toasts, wraps sonner |

## Python Utilities (ushadow-py-common)
| Name | Min Version | Description |
|---|---|---|
| bug_reporting.submit_bug | 1.0.0 | Submit bugs to Chronicle via Mycelia |
| auth.verify_token | 1.1.0 | JWT verification with OIDC support |

## Scripts
| Name | Description |
|---|---|
| setup-project.sh | Bootstrap a new ushadow project |
| sync-secrets.sh | Sync secrets from 1Password to local .env |

## Skills
| Name | Description |
|---|---|
| shared-components | This skill — shared component methodology |
| bug-reporter | End-to-end bug reporter wiring (UI + API) |
```

---

## Quick Reference

```
Found something reusable mid-project?
  → Check ushadow-io/playbook/INDEX.md
  → Already exists? Consume it (Step 4)
  → Doesn't exist? Finish in-situ + open GitHub extraction issue

Starting a new project?
  → gh repo create --template ushadow-io/project-template
  → pnpm add @ushadow/ui
  → Add py-common git ref to pyproject.toml
  → Pull relevant skills into .claude/skills/
  → Read ushadow-io/playbook for standards

Publishing a new shared asset?
  → Extract to correct repo (Step 3)
  → Follow that repo's structure conventions
  → Tag a semver release
  → Update ushadow-io/playbook/INDEX.md
```
