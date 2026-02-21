# Pixi + UV Shared Environment Setup

This repository uses **pixi** for shared infrastructure (Python, Node, Rust) and **uv** for fast Python package management across all worktrees.

## Architecture

```
~/.pixi/envs/ushadow/          # Shared pixi environment (ONE for all worktrees)
├── bin/
│   ├── python3.12             # Shared Python
│   ├── uv                     # Shared UV
│   ├── pytest                 # Installed via uv
│   └── robot                  # Installed via uv
└── lib/python3.12/site-packages/  # All packages here (shared)

Worktrees:
├── green/                     # Uses shared env above
├── purple/                    # Uses shared env above
└── blue/                      # Uses shared env above
```

## Initial Setup (One Time)

```bash
# 1. Enter pixi shell (activates shared environment)
pixi shell

# 2. Install all dependencies using pixi tasks
pixi run install

# You're ready! pytest, robot, and all deps are now available
```

## Daily Workflow

```bash
# Enter any worktree
cd /path/to/ushadow/green  # or purple, or any worktree

# Activate pixi environment
pixi shell

# Now all tools work:
pytest ushadow/backend/tests/integration/test_routers/test_auth_comprehensive.py -v
make test
make test-robot-quick

# Or use pixi tasks directly:
pixi run test
```

## Key Points

✅ **ONE environment shared across ALL worktrees** - saves GBs of disk space
✅ **uv manages packages** - fast installs into pixi's Python
✅ **pixi shell activates** - sets $CONDA_PREFIX and PATH
✅ **Makefile now assumes pixi** - run `pixi shell` first, then `make` commands work

## Pixi Tasks

```bash
pixi run install-ushadow   # Install backend with dev deps (pytest, etc.)
pixi run install-robot     # Install robot framework deps
pixi run install           # Install everything (both above)
pixi run test              # Run pytest
pixi run ush               # Run ush CLI tool
```

## Troubleshooting

**Problem:** "command not found: pytest"
**Solution:** You're not in pixi shell. Run `pixi shell` first.

**Problem:** "make install" fails
**Solution:** Don't use `make install`. Use `pixi run install` instead.

**Problem:** Dependencies missing after switching worktrees
**Solution:** Run `pixi run install` in the new worktree (updates shared env if needed).

## Why This Setup?

- **pixi** provides system packages (Python, Node, Rust) in ONE place
- **uv** installs Python packages FAST into pixi's Python
- **No .venv/** duplication across worktrees
- All worktrees share the same environment (green, purple, etc.)
