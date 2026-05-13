---
name: extract-component
description: Extract code into the ushadow-io shared ecosystem. Use when asked to extract, share, or reuse a component, hook, utility, or feature (e.g. "extract feature flags", "make this shared", "move to shared", "pull this into a package").
---

Extract the identified code into the correct ushadow-io shared repo. Follow these steps:

## 1 — Identify the target repo

- React / UI → `ushadow-io/ui` (published as `@ushadow/ui`)
- Python logic / utilities → `ushadow-io/py-common` (published as `ushadow-common`)
- Shell scripts / dev tooling → `ushadow-sdk/scripts/`
- Claude Skills → `ushadow-sdk/skills/`

If it spans multiple types, split across repos and note the relationship in `playbook/INDEX.md`.

## 2 — Finish the in-situ implementation first

Do not context-switch mid-feature. Complete a working version in the current project, then extract. Open a GitHub issue in the target repo to track it:

```
Title: Extract <name> from <project>
Body:
  - Current location: src/components/Foo.tsx
  - Target repo: ushadow-io/ui
  - Dependencies: react-hook-form
  - Notes: needs projectId prop
```

## 3 — Extract into the shared repo

Check for a local checkout first before cloning:

```bash
# Prefer local checkout
REPO_DIR=~/repos/<repo>
if [ ! -d "$REPO_DIR" ]; then
  git clone https://github.com/Ushadow-io/<repo>.git "$REPO_DIR"
fi
cd "$REPO_DIR"
git checkout main && git pull
git checkout -b feat/<component-name>
```

Follow the repo conventions from `shared-ecosystem` skill. Open a PR — do not push directly to main.

## 4 — Build, verify, then tag

After the PR is merged, pull main and verify the package builds before tagging:

```bash
git checkout main && git pull

# For @ushadow/ui — build must pass before tagging
pnpm install && pnpm build   # produces dist/

# For py-common — confirm imports work
uv pip install -e . && python -c "from ushadow_common.<module> import <thing>"
```

Then tag to trigger the publish workflow:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

For `@ushadow/ui` the tag triggers the GitHub Actions publish workflow automatically.
For `py-common` a git tag is sufficient — consumers pin to the tag.

## 5 — Update the playbook INDEX

Edit `ushadow-sdk/playbook/INDEX.md` and add a row to the relevant table.

## Agent runbook

When making changes to ushadow-sdk itself:
- **Docs only** (INDEX.md, SKILL.md): push direct to main
- **Code changes** (ui, py-common): open a PR, tag a release after merge
- Always update `playbook/INDEX.md` as the final step
