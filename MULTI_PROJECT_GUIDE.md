# Multi-Project Launcher Guide

## Overview

The launcher now supports managing multiple projects beyond ushadow. Each project can have its own configuration, prerequisites, and infrastructure.

## Quick Start

### 1. Enable Multi-Project Mode

1. Open launcher settings (⚙️ icon)
2. Toggle "Multi-Project Mode" to ON
3. Navigate to "Setup & Installation" tab
4. You'll see the ProjectManager UI

### 2. Add a Project

1. Click "+ Add Project" in the ProjectManager
2. Select your project folder (e.g., `/Users/stu/repos/chronicle`)
3. The launcher will:
   - Use the folder as the project root
   - Create worktrees in `../worktrees/projectname`
   - Look for `.launcher-config.yaml` in the project root

### 3. Create Project Configuration

Each project needs a `.launcher-config.yaml` in its root directory:

```yaml
project:
  name: chronicle
  display_name: Chronicle

prerequisites:
  required:
    - docker
    - git
  optional:
    - python

setup:
  command: ./setup.sh
  env_vars:
    - PROJECT_ROOT

infrastructure:
  compose_file: docker-compose.yml
  project_name: chronicle-infra

containers:
  naming_pattern: "{env_name}-{service}"
  primary_service: backend
  health_endpoint: /health

ports:
  allocation_strategy: offset
  base_port: 8000
  offset:
    min: 0
    max: 100
    step: 10

worktrees:
  default_parent: ../worktrees/chronicle
```

See `.launcher-config.template.yaml` for full documentation.

## Current Limitations (To Be Fixed)

1. **Prerequisites per project**: Currently uses global prerequisites. Need to load from project config.
2. **Infrastructure per project**: Infrastructure panel doesn't yet read from project config.
3. **Environment commands**: setup.command not yet integrated into environment creation flow.

## Workaround for Now

For projects like Chronicle:

1. **Add the project** to get it in the list
2. **Manually create worktrees** using git:
   ```bash
   cd /Users/stu/repos/chronicle
   git worktree add ../worktrees/chronicle/dev
   ```
3. **Use discovery** - The launcher will discover and manage existing worktrees

## Next Steps to Complete Integration

- [ ] Load prerequisites from active project's config
- [ ] Load infrastructure services from project config
- [ ] Run setup.command when creating new environments
- [ ] Show project-specific status in UI
- [ ] Add config editor UI for projects without `.launcher-config.yaml`
