# PR Flow Diagram: Small PRs with Dev Testing

## The Updated Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub (Remote)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        origin/main (production)                 │
│                               ▲                                 │
│                               │                                 │
│              ┌────────────────┼────────────────┐                │
│              │                │                │                │
│         PR #101 (ready)  PR #102 (draft)  PR #103 (ready)      │
│         vk/123-auth      vk/456-profile   vk/789-api-keys      │
│              ▲                ▲                ▲                │
│              │                │                │                │
│              │                │                │                │
│         origin/dev ◄──────────┴────────────────┘                │
│         (integration testing only)                              │
│              ▲                                                  │
└──────────────┼─────────────────────────────────────────────────┘
               │
        integrate-to-dev
               │
┌──────────────┼─────────────────────────────────────────────────┐
│              │            Your Machine (Local)                 │
├──────────────┼─────────────────────────────────────────────────┤
│              │                                                 │
│    ┌─────────┴───────────┐      ┌─────────────────────┐       │
│    │ Worktree A          │      │ Worktree B          │       │
│    │ vk/123-auth         │      │ vk/456-profile      │       │
│    │                     │      │                     │       │
│    │ 1. create-draft-pr  │      │ 1. create-draft-pr  │       │
│    │ 2. work work work   │      │ 2. work work work   │       │
│    │ 3. integrate-to-dev │      │ 3. sync-from-dev ◄──┼───┐   │
│    │ 4. mark-pr-ready    │      │    (gets worktree A)│   │   │
│    │                     │      │ 4. integrate-to-dev ├───┘   │
│    │ PR #101 → main ✓    │      │ 5. mark-pr-ready    │       │
│    └─────────────────────┘      └─────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Each worktree creates its own **small PR** to `main`
- `dev` is used **only for integration testing**
- PRs can be merged **independently**
- No huge `dev → main` PR needed

---

## Timeline View: One Feature

```
Day 1: Start Feature
├─ new-worktree vk/123-auth /tmp/auth
├─ create-draft-pr "Add authentication"
│    └─► GitHub: PR #101 created (DRAFT)
└─ Work on feature...

Day 2: Development
├─ Commit and push regularly
├─ integrate-to-dev
│    └─► origin/dev now has auth feature
└─ Continue working...

Day 3: Integration Testing
├─ Other worktrees pull from dev
│    └─► sync-from-dev (in other worktrees)
├─ Test auth WITH other features
└─ Find bug, fix it, re-integrate

Day 4: Ready for Review
├─ mark-pr-ready
│    └─► GitHub: PR #101 marked ready
├─ Update PR description with test results
└─ Request review

Day 5: Code Review
├─ Reviewer comments
├─ Address feedback
│    └─► Push changes, auto-updates PR
└─ Reviewer approves ✓

Day 6: Merge
├─ gh pr merge vk/123-auth
│    └─► PR #101 merged to main
├─ sync-dev-with-main
│    └─► Dev now has merged version
└─ cleanup-merged
```

---

## Multiple Features in Parallel

```
Timeline →

Week 1:
  Mon    Tue    Wed    Thu    Fri
  │      │      │      │      │
  ├─ Feature A: Draft PR #101
  │      │      │      │      │
  │      ├─ Feature B: Draft PR #102
  │      │      │      │      │
  │      │      ├─ Feature C: Draft PR #103
  │      │      │      │      │
  │      │      │      ├─ A ready, review starts
  │      │      │      │      │
  │      │      │      │      ├─ A merges! ✓
  │                           └─ sync-dev-with-main

Week 2:
  Mon    Tue    Wed    Thu    Fri
  │      │      │      │      │
  ├─ B ready, review starts
  │      │      │      │      │
  │      │      ├─ C ready, review starts
  │      │      │      │      │
  │      │      │      ├─ B merges! ✓
  │                    └─ sync-dev-with-main
  │                           │
  │                           ├─ C merges! ✓
  │                           └─ sync-dev-with-main

Result:
- 3 features developed in parallel
- 3 small, focused PRs
- Each reviewed independently
- All tested together in dev
```

---

## Dev vs Main State Diagram

```
State at Different Points in Time:

T1: Start
┌────────────┐
│ main: A    │
│ dev:  A    │  (dev synced with main)
└────────────┘

T2: Feature B drafted
┌────────────┐
│ main: A    │
│ dev:  A─B  │  (B integrated to dev for testing)
│            │
│ PR #101: B │  (draft, points to main)
└────────────┘

T3: Feature C drafted
┌────────────┐
│ main: A    │
│ dev:  A─B─C│  (C integrated, tested with B)
│            │
│ PR #101: B │  (draft)
│ PR #102: C │  (draft)
└────────────┘

T4: B reviewed and merged
┌────────────┐
│ main: A─B  │  (PR #101 merged)
│ dev:  A─B─C│  (dev synced with main)
│            │
│ PR #102: C │  (still draft, now based on main with B)
└────────────┘

T5: C ready and merged
┌────────────┐
│ main: A─B─C│  (PR #102 merged)
│ dev:  A─B─C│  (dev synced with main)
└────────────┘

Result: main has clean history with 3 commits (A, B, C)
```

---

## PR States Explained

```
┌─────────────────────────────────────────────────┐
│              PR Lifecycle                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. DRAFT                                       │
│     ├─ Visible to team                          │
│     ├─ CI runs (optional)                       │
│     ├─ Can push updates                         │
│     └─ Not requesting review yet                │
│                                                 │
│  2. READY FOR REVIEW                            │
│     ├─ Reviews requested                        │
│     ├─ CI must pass                             │
│     ├─ Can still push updates                   │
│     └─ Reviewers notified                       │
│                                                 │
│  3. CHANGES REQUESTED                           │
│     ├─ Reviewer asked for changes               │
│     ├─ Push updates to address                  │
│     └─ Re-request review when done              │
│                                                 │
│  4. APPROVED                                    │
│     ├─ Review complete ✓                        │
│     ├─ CI passing ✓                             │
│     ├─ Ready to merge                           │
│     └─ Can merge via GitHub or CLI              │
│                                                 │
│  5. MERGED                                      │
│     ├─ Code now in main                         │
│     ├─ PR closed automatically                  │
│     ├─ Branch can be deleted                    │
│     └─ Run sync-dev-with-main                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Integration Testing Flow

```
Scenario: Feature B needs Feature A's code

Step 1: Feature A integrates to dev
┌──────────────────────────────────┐
│ Worktree A (vk/123-feature-a)    │
│ └─► integrate-to-dev              │
└──────────────────────────────────┘
                │
                ▼
        origin/dev ← Feature A code

Step 2: Feature B syncs from dev
┌──────────────────────────────────┐
│ Worktree B (vk/456-feature-b)    │
│ └─► sync-from-dev                 │
│     ├─ Merges origin/dev          │
│     └─ Now has Feature A code!    │
└──────────────────────────────────┘

Step 3: Test together in Worktree B
┌──────────────────────────────────┐
│ Worktree B                        │
│ ├─ Feature A code (from dev)     │
│ ├─ Feature B code (local)        │
│ └─ Test integration works!       │
└──────────────────────────────────┘

Step 4: Both create separate PRs
┌──────────────────────────────────┐
│ PR #101: vk/123-feature-a → main │
│ PR #102: vk/456-feature-b → main │
│                                  │
│ Both are small, reviewable PRs!  │
└──────────────────────────────────┘

Step 5: Merge independently
┌──────────────────────────────────┐
│ Day 1: PR #101 merges first      │
│ ├─► sync-dev-with-main           │
│ └─► Worktree B syncs from dev    │
│                                  │
│ Day 2: PR #102 merges            │
│ └─► sync-dev-with-main           │
└──────────────────────────────────┘

Result:
✅ Integration tested in dev
✅ Two small PRs (not one huge PR)
✅ Each feature reviewed separately
✅ Clean merge to main
```

---

## Conflict Resolution Flow

```
Problem: Feature A merges to main, but conflicts with Feature B in dev

Step 1: Feature A merges to main
┌────────────────────────────┐
│ PR #101 merged             │
│ main: A ─ B ─ C ─ A        │
│ dev:  A ─ B ─ C ─ D ─ E    │
│                 ↑   ↑      │
│             (testing)      │
└────────────────────────────┘

Step 2: Sync dev with main (conflict!)
┌────────────────────────────┐
│ git checkout dev           │
│ git pull origin main       │
│ >>> CONFLICT in file.txt   │
└────────────────────────────┘

Step 3: Resolve conflict in dev
┌────────────────────────────┐
│ vim file.txt               │
│ git add file.txt           │
│ git commit                 │
│ git push origin dev        │
└────────────────────────────┘

Step 4: Feature D worktree pulls resolution
┌────────────────────────────┐
│ cd /tmp/worktree-d         │
│ sync-from-dev              │
│ └─► Gets conflict resolution│
└────────────────────────────┘

Step 5: Feature D creates PR (no conflict!)
┌────────────────────────────┐
│ PR #104: vk/789-feature-d  │
│ └─► No conflicts!          │
│     (Already resolved in dev)│
└────────────────────────────┘

Result:
✅ Conflicts resolved once in dev
✅ Feature PRs don't have conflicts
✅ Clean merge to main
```

---

## Visual Summary

```
The Old Way (What We Avoid):
┌─────────────────────────────────┐
│ Features A, B, C, D, E          │
│         ↓                       │
│     origin/dev                  │
│         ↓                       │
│    ONE HUGE PR                  │
│         ↓                       │
│     origin/main                 │
│                                 │
│ ❌ 2000+ line PR                │
│ ❌ Impossible to review         │
│ ❌ All-or-nothing merge         │
└─────────────────────────────────┘

The New Way (What We Do):
┌─────────────────────────────────┐
│ Feature A ──► PR #101 ──┐       │
│ Feature B ──► PR #102 ──┤       │
│ Feature C ──► PR #103 ──┼──► main│
│ Feature D ──► PR #104 ──┤       │
│ Feature E ──► PR #105 ──┘       │
│      │                          │
│      └──► origin/dev             │
│           (testing only)        │
│                                 │
│ ✅ 5 small PRs (~300 lines each)│
│ ✅ Each feature reviewed        │
│ ✅ Tested together in dev       │
│ ✅ Independent merges           │
└─────────────────────────────────┘
```

---

## Commands Quick Reference

| Action | Command |
|--------|---------|
| Start feature + draft PR | `create-draft-pr "Feature title"` |
| Test with other features | `integrate-to-dev` |
| Get other features | `sync-from-dev` |
| Mark ready for review | `mark-pr-ready` |
| Merge PR | `gh pr merge vk/123-feature` |
| Sync dev after merge | `sync-dev-with-main` |
| Clean up | `cleanup-merged` |

---

## The Golden Rule

**Dev is for integration testing, not for bundling PRs.**

```
❌ Wrong:  features → dev → one big PR → main
✅ Right:  features → small PRs → main
           └─► dev (for testing only)
```

Each feature gets its own **small, focused, reviewable PR** directly to `main`.
