# Git Hooks

This directory contains git hooks that are **committed to the repository**.

## Setup (One-Time)

After cloning, configure git to use these hooks:

```bash
git config core.hooksPath .githooks
```

## Automatic Setup

Add this to your `~/.gitconfig` to automatically use `.githooks` in all repos:

```ini
[init]
    templateDir = ~/.git-templates
```

Then create `~/.git-templates/hooks/post-clone`:
```bash
#!/bin/bash
if [ -d .githooks ]; then
    git config core.hooksPath .githooks
fi
```

## Available Hooks

### post-checkout
Automatically configures sparse checkout for chronicle and mycelia submodules to prevent circular dependencies.

**What it does:**
- Chronicle: Excludes `extras/mycelia/`
- Mycelia: Excludes `friend/`

**When it runs:**
- After `git checkout`
- After `git submodule update`
- After initial clone (with setup)

## Testing

Test the hook manually:
```bash
./.githooks/post-checkout
```
