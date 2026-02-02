# Frontend Excellence Metrics Tracking

## Overview

This document explains how to collect, track, and analyze frontend excellence metrics over time, mirroring the backend metrics system.

---

## Quick Start

### Run Metrics Report

```bash
# Full human-readable report
python3 scripts/measure_frontend_excellence.py

# JSON output (for automation)
python3 scripts/measure_frontend_excellence.py --json

# Save to file for tracking
python3 scripts/measure_frontend_excellence.py --json --output metrics/frontend-$(date +%Y-%m-%d).json
```

---

## Metrics Collected

### 1. File Size Violations

**What it measures**: TypeScript/TSX files exceeding size limits

**Limits**:
- Pages: 600 lines
- Components: 300 lines
- Hooks: 100 lines

**Current baseline** (2025-01-23):
- 23 violations out of 72 files (31.9%)
- Largest file: ServiceConfigsPage.tsx (1868 lines)

**Target**: <10% violation rate

### 2. data-testid Coverage

**What it measures**: Percentage of interactive elements with data-testid attributes

**Interactive elements tracked**:
- `<button>`, `<input>`, `<select>`, `<a>`, `<textarea>`
- Elements with `onClick` handlers

**Current baseline**:
- 345 testids out of 953 interactive elements (36.2%)
- 10 files with zero testid coverage

**Target**: >80% coverage

**Why this matters**: Without testids, E2E tests break when UI text changes, creating fragile test suites.

### 3. Component Reuse

**What it measures**: Usage of shared components vs forbidden patterns

**Tracked components**:
- `Modal` - Should be used instead of custom `fixed inset-0` divs
- `SecretInput` - For API keys/passwords
- `SettingField` - Generic form fields
- `ConfirmDialog` - Confirmation prompts

**Forbidden patterns detected**:
- Custom modals (`className="fixed inset-0"`)
- Custom secret inputs (password fields with eye icons)
- Inline state management (excessive `useState` in components)

**Current baseline**:
- 30 total shared component uses
- 49 forbidden pattern violations

**Target**: >100 shared component uses, <5 forbidden patterns

### 4. Hook Extraction

**What it measures**: Ratio of imported hooks vs local hooks

**Calculation**:
```python
extraction_rate = imported_hooks / (local_hooks + imported_hooks)
```

**Current baseline**:
- 2 local hooks, 7 imported hooks
- 77.8% extraction rate ✅

**Target**: >60% extraction rate

**Why this matters**: Hooks should be extracted to shared `hooks/` directory for reuse, not defined locally in components.

### 5. Import Quality

**What it measures**:
- Use of relative imports vs path aliases (`@/`)
- Import organization (React first, then third-party, then local)

**Current baseline**:
- 61/88 files use relative imports (69.3%)
- 78/88 files have unorganized imports

**Target**: <10% relative imports, <20% unorganized

### 6. Code Reuse Rate

**What it measures**: New component creation vs component modification in recent commits

**Current baseline**: Pending first measurements

**Target**: >70% modification rate (prefer extending over creating)

---

## Health Score

**Formula**:
```python
health_score = 100
health_score -= min(file_violations * 30, 30)     # File size
health_score -= (1 - testid_coverage) * 40        # testid coverage
health_score -= min(forbidden_patterns * 2, 20)   # Forbidden patterns
health_score -= (1 - hook_extraction) * 10        # Hook extraction
```

**Grades**:
- A (90-100): Excellent
- B (80-89): Good
- C (70-79): Fair
- D (60-69): Needs improvement
- F (<60): Needs urgent attention

**Current baseline**: 42.7/100 (F) - Expected before full adoption

**Target**: 85+/100 (B) after 1 month

---

## Key Differences from Backend Metrics

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Primary focus** | Method duplication | Component reuse + testid coverage |
| **File size limits** | 500-800 lines | 300-600 lines |
| **Pattern detection** | Layer violations | Forbidden patterns (custom modals) |
| **Unique metric** | Layer boundaries | data-testid coverage |
| **Health weight** | Duplication heavy | testid coverage heavy (40%) |

---

## Tracking Over Time

### Weekly Tracking

```bash
# Create frontend metrics directory
mkdir -p metrics/frontend

# Weekly snapshot
python3 scripts/measure_frontend_excellence.py \
  --json \
  --output "metrics/frontend/$(date +%Y-%m-%d).json"
```

### Automated Tracking (GitHub Actions)

Add to `.github/workflows/frontend-metrics.yml`:

```yaml
name: Frontend Excellence Metrics

on:
  push:
    branches: [main, develop]
    paths:
      - 'ushadow/frontend/**/*.tsx'
      - 'ushadow/frontend/**/*.ts'
  pull_request:
    branches: [main]
    paths:
      - 'ushadow/frontend/**/*.tsx'
      - 'ushadow/frontend/**/*.ts'

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'

      - name: Collect frontend metrics
        run: |
          python3 scripts/measure_frontend_excellence.py --json --output frontend-metrics.json

      - name: Display report
        run: |
          python3 scripts/measure_frontend_excellence.py

      - name: Check testid coverage
        run: |
          coverage=$(cat frontend-metrics.json | jq '.metrics.testid_coverage.coverage_rate')
          if (( $(echo "$coverage < 0.8" | bc -l) )); then
            echo "::warning::data-testid coverage is below 80%: $coverage"
          fi

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const metrics = JSON.parse(fs.readFileSync('frontend-metrics.json'));
            const tc = metrics.metrics.testid_coverage;

            const body = `## Frontend Excellence Metrics

            **Health Score**: ${metrics.health_score}/100 (${metrics.grade})

            **File Size Violations**: ${metrics.metrics.file_sizes.violation_count}/${metrics.metrics.file_sizes.total_files}
            **data-testid Coverage**: ${(tc.coverage_rate * 100).toFixed(1)}% (${tc.elements_with_testid}/${tc.total_interactive_elements})
            **Forbidden Patterns**: ${metrics.metrics.component_reuse.forbidden_pattern_count}
            **Component Reuse**: ${metrics.metrics.component_reuse.total_shared_component_usage} uses

            ${tc.coverage_rate < 0.8 ? '⚠️ **Add data-testid to interactive elements (target: >80%)**' : ''}
            ${metrics.health_score < 70 ? '⚠️ **Consider addressing violations before merging**' : '✅ **Good frontend quality**'}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

---

## Interpreting Results

### Critical Metrics

**1. data-testid Coverage** (Most Important)
- **<40%**: Critical - tests will be fragile
- **40-60%**: Poor - add testids to new components
- **60-80%**: Good - close to target
- **>80%**: Excellent - maintain this level

**2. Forbidden Patterns**
- **0-5**: Acceptable - occasional edge cases
- **5-20**: Needs attention - review with team
- **>20**: Critical - agents not using shared components

**3. File Size Violations**
- **<10%**: Good - normal variance
- **10-30%**: Fair - plan refactoring sprints
- **>30%**: Poor - large files make discovery hard

### Good Signs ✅

- testid coverage >75%
- Health score trending upward
- Forbidden pattern count decreasing
- Shared component usage increasing
- New PRs add <3 violations

### Warning Signs ⚠️

- testid coverage stagnant or decreasing
- Same files repeatedly in "largest" list
- New components created instead of reusing
- Forbidden patterns increasing

---

## Action Items by Score

**F (<60)**:
- **Immediate**: Run testid audit on all pages
  ```bash
  # Find pages without testids
  grep -L "data-testid" ushadow/frontend/src/pages/*.tsx
  ```
- Review AGENT_QUICK_REF.md - ensure agents know about shared components
- Check if forbidden patterns are from old code (acceptable) or new code (not acceptable)

**D (60-69)**:
- Focus on testid coverage first (biggest health impact)
- Document why specific forbidden patterns exist (tech debt vs valid use)
- Extract hooks from large components

**C (70-79)**:
- Address largest files (>1000 lines)
- Ensure new code doesn't regress metrics
- Celebrate progress!

**B (80-89)**:
- Maintain current practices
- Share learnings with team
- Consider case studies

**A (90-100)**:
- Frontend excellence is working!
- Update patterns based on successes
- Consider blog post/conference talk

---

## Specific Remediation Strategies

### Improving testid Coverage

**Quick wins**:
```bash
# Find interactive elements without testids
grep -rn '<button' ushadow/frontend/src/pages/ | grep -v 'data-testid'

# Add testids to a page
# Before:
<button onClick={handleSave}>Save</button>

# After:
<button data-testid="save-button" onClick={handleSave}>Save</button>
```

**Systematic approach**:
1. Start with high-traffic pages (Settings, Services)
2. Use naming convention: `{context}-{element}` (e.g., `settings-save-button`)
3. Update POM files in `frontend/e2e/pom/` to use new testids

### Removing Forbidden Patterns

**Custom modals** → Use `Modal` component:
```tsx
// ❌ Before (forbidden pattern)
<div className="fixed inset-0 bg-black/50">
  <div className="bg-white p-4">...</div>
</div>

// ✅ After (shared component)
import Modal from '@/components/Modal'

<Modal isOpen={isOpen} onClose={onClose} title="My Modal">
  ...
</Modal>
```

**Custom secret inputs** → Use `SecretInput`:
```tsx
// ❌ Before
<div>
  <input type={showPassword ? "text" : "password"} />
  <button onClick={() => setShowPassword(!showPassword)}>👁️</button>
</div>

// ✅ After
import { SecretInput } from '@/components/settings/SecretInput'

<SecretInput id="api-key" value={value} onChange={setValue} />
```

### Reducing File Sizes

**Large pages** (>600 lines):
1. Extract UI sections to components
2. Extract business logic to hooks
3. Extract form handling to custom hooks

```tsx
// Before: 1500-line page
function ServiceConfigsPage() {
  // 200 lines of state
  // 500 lines of form logic
  // 800 lines of JSX
}

// After: 200-line page + extracted pieces
function ServiceConfigsPage() {
  const { formData, handleSubmit } = useServiceConfigForm()  // Extracted hook
  const { services } = useServices()  // Extracted hook

  return (
    <>
      <ServiceConfigHeader />  // Extracted component
      <ServiceConfigForm data={formData} onSubmit={handleSubmit} />  // Extracted component
      <ServiceConfigList services={services} />  // Extracted component
    </>
  )
}
```

---

## Weekly Review Process

### Monday Morning (5 minutes)

```bash
# 1. Run frontend metrics
python3 scripts/measure_frontend_excellence.py --output metrics/frontend/weekly.json

# 2. Check key metrics
cat metrics/frontend/weekly.json | jq '{
  health: .health_score,
  testid_coverage: .metrics.testid_coverage.coverage_rate,
  forbidden: .metrics.component_reuse.forbidden_pattern_count
}'

# 3. Identify action items
cat metrics/frontend/weekly.json | jq '.metrics.testid_coverage.files_without_testids[:5]'
```

### Monthly Review (30 minutes)

1. **Trend Analysis**:
   - Compare 4 weeks of data
   - Plot health score over time
   - Identify improving/declining metrics

2. **Root Cause Analysis**:
   - Why is testid coverage not improving?
   - Are agents reading AGENT_QUICK_REF.md?
   - Are forbidden patterns from old code or new code?

3. **Action Plan**:
   - Update ui-contract.ts with new patterns
   - Add missing components to COMPONENT_REGISTRY.md
   - Schedule refactoring sprint if needed

4. **Celebrate Wins**:
   - Share improvements with team
   - Document what worked
   - Update patterns based on successes

---

## Integration with Development Workflow

### Before Creating PR

```bash
# Check frontend changes don't worsen metrics
python3 scripts/measure_frontend_excellence.py

# If testid coverage drops >5%, audit your changes:
git diff --name-only | grep '\.tsx$' | while read file; do
  echo "=== $file ==="
  grep -c "data-testid" "$file" || echo "No testids!"
done
```

### During Code Review

**Automated check** (GitHub Actions):
- PR comment shows metrics
- Reviewers see testid coverage %
- Forbidden patterns flagged automatically

**Manual check**:
```bash
# Compare PR branch to main
git checkout pr-branch
python3 scripts/measure_frontend_excellence.py --json --output pr.json

git checkout main
python3 scripts/measure_frontend_excellence.py --json --output main.json

# Compare testid coverage
diff <(jq '.metrics.testid_coverage.coverage_rate' pr.json) \
     <(jq '.metrics.testid_coverage.coverage_rate' main.json)
```

---

## Metrics Storage

### Recommended Structure

```
metrics/
├── frontend/
│   ├── baseline-2025-01-23.json
│   ├── 2025-01-30.json
│   ├── 2025-02-06.json
│   └── weekly/
│       ├── 2025-W04.json
│       └── 2025-W05.json
├── backend/
│   └── ... (backend metrics)
└── combined/
    └── dashboard.json  (combined frontend + backend)
```

---

## Combined Frontend + Backend Dashboard

Create `scripts/generate_combined_dashboard.py`:

```python
#!/usr/bin/env python3
import json
from pathlib import Path

def generate_combined_dashboard():
    """Combine frontend and backend metrics into single dashboard."""

    # Load latest metrics
    frontend = json.loads(Path("metrics/frontend/latest.json").read_text())
    backend = json.loads(Path("metrics/backend/latest.json").read_text())

    dashboard = {
        "timestamp": frontend["timestamp"],
        "overall_health": (frontend["health_score"] + backend["health_score"]) / 2,
        "frontend": {
            "health": frontend["health_score"],
            "testid_coverage": frontend["metrics"]["testid_coverage"]["coverage_rate"],
            "file_violations": frontend["metrics"]["file_sizes"]["violation_count"],
        },
        "backend": {
            "health": backend["health_score"],
            "duplication": backend["metrics"]["method_duplication"]["duplicate_count"],
            "file_violations": backend["metrics"]["file_sizes"]["violation_count"],
        }
    }

    return dashboard
```

---

## Example: Measuring Impact Over Time

### Baseline (2025-01-23 - Before Implementation)
```json
{
  "health_score": 42.7,
  "metrics": {
    "testid_coverage": {"coverage_rate": 0.362},
    "file_sizes": {"violation_rate": 0.319},
    "component_reuse": {"forbidden_pattern_count": 49},
    "hook_extraction": {"extraction_rate": 0.778}
  }
}
```

### Target (2025-02-23 - After 1 Month)
```json
{
  "health_score": 86.0,
  "metrics": {
    "testid_coverage": {"coverage_rate": 0.85},
    "file_sizes": {"violation_rate": 0.08},
    "component_reuse": {"forbidden_pattern_count": 3},
    "hook_extraction": {"extraction_rate": 0.80}
  }
}
```

**Expected improvements**:
- Health score: +43.3 points (+101%)
- testid coverage: +48.8 percentage points
- File violations: -75% (31.9% → 8%)
- Forbidden patterns: -94% (49 → 3)

---

## Troubleshooting

### "Low testid coverage but I added testids"

Check naming:
```bash
# Look for incorrect testid patterns
grep -rn 'test-id=' ushadow/frontend/src/  # Wrong: test-id
grep -rn 'testid=' ushadow/frontend/src/   # Wrong: testid
grep -rn 'data-testid=' ushadow/frontend/src/  # Correct!
```

### "Forbidden patterns detected in shared components"

This is expected! The `Modal` component itself might use `fixed inset-0`, but that's okay - it's the shared implementation. The metric flags custom/inline usage.

### "Hook extraction rate low but I'm using hooks"

The metric tracks hooks imported from `hooks/` directory vs defined locally. Check:
```bash
# Count local hook definitions
grep -rn 'const use\w* =' ushadow/frontend/src/pages/

# These should be extracted to hooks/ directory
```

---

## Future Enhancements

Potential additions:

1. **Accessibility Metrics**:
   - ARIA label coverage
   - Keyboard navigation patterns
   - Color contrast violations

2. **Performance Metrics**:
   - Bundle size tracking
   - Component render counts
   - Import graph complexity

3. **Type Safety**:
   - TypeScript strict mode compliance
   - `any` type usage
   - Prop type coverage

4. **Test Coverage Correlation**:
   - Does testid coverage improve E2E test stability?
   - Track test flakiness vs testid presence

---

## Summary

**Manual workflow**:
```bash
# Weekly
python3 scripts/measure_frontend_excellence.py --output metrics/frontend/weekly.json

# Before PR
python3 scripts/measure_frontend_excellence.py
```

**Automated workflow**:
- GitHub Actions on PR
- Weekly cron job
- PR comments with metrics

**Success criteria**:
- Health score >85 within 1 month
- testid coverage >80%
- <5 forbidden patterns
- <10% file violations

**Review schedule**:
- Daily: Automated PR checks
- Weekly: Manual report (5 min)
- Monthly: Trend analysis (30 min)

**Priority fixes**:
1. **testid coverage** (40% weight in health score)
2. **Forbidden patterns** (indicates poor component reuse)
3. **File sizes** (makes code hard to navigate)
4. **Hook extraction** (improves reusability)
