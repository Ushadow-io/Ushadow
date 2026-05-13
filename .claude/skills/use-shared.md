---
name: use-shared
description: Use a shared ushadow-io component, utility, or script. Use when asked "is there a shared X", "how do I use @ushadow/ui", "add the shared auth helper", or when wiring shared deps into a project.
---

## 1 — Check what exists

Read the catalogue first:

```bash
gh api repos/Ushadow-io/ushadow-sdk/contents/playbook/INDEX.md --jq '.content' | base64 -d
```

Or open: https://github.com/Ushadow-io/ushadow-sdk/blob/main/playbook/INDEX.md

## 2 — Wire it in

### React / UI (`@ushadow/ui`)

```bash
pnpm add github:Ushadow-io/ui#<tag>
```

```tsx
import { ComponentName } from '@ushadow/ui'
```

### Python (`ushadow-common`)

In `pyproject.toml`:

```toml
dependencies = [
  "ushadow-common @ git+https://github.com/Ushadow-io/py-common.git@<tag>"
]
```

```bash
uv pip install -e .
```

```python
from ushadow_common.<module> import <thing>
```

### Scripts

```bash
gh api repos/Ushadow-io/ushadow-sdk/contents/scripts/<script>.sh --jq '.content' | base64 -d | bash
```

### Claude Skills

```bash
gh api repos/Ushadow-io/ushadow-sdk/contents/skills/<skill>/SKILL.md --jq '.content' \
  | base64 -d > .claude/skills/<skill>.md
```

## 3 — If it doesn't exist yet

Use the `extract-component` skill to pull it out of wherever it currently lives.
