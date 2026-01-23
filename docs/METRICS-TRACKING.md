# Backend Excellence Metrics Tracking

## Overview

This document explains how to collect, track, and analyze backend excellence metrics over time.

---

## Quick Start

### Run Metrics Report

```bash
# Full human-readable report
python3 scripts/measure_backend_excellence.py

# JSON output (for automation)
python3 scripts/measure_backend_excellence.py --json

# Save to file for tracking
python3 scripts/measure_backend_excellence.py --json --output metrics/$(date +%Y-%m-%d).json
```

---

## Metrics Collected

### 1. File Size Violations

**What it measures**: Files exceeding size limits

**Limits**:
- Routers: 500 lines
- Services: 800 lines
- Utils: 300 lines
- Models: 400 lines

**Current baseline** (2025-01-23):
- 14 violations out of 49 files (28.6%)
- Largest file: unode_manager.py (1670 lines)

**Target**: <5% violation rate

### 2. Method Duplication

**What it measures**: Common method names appearing in multiple files

**Tracked methods**:
- `get_status`, `deploy`, `get_logs`
- `list_*`, `create_*`, `update_*`, `delete_*`
- `start_*`, `stop_*`

**Current baseline**:
- 30 duplicated method names
- Most common: `list_services` (4 files), `start_service` (4 files)

**Target**: <10 duplicated method names (indicates good abstraction)

### 3. Layer Boundary Violations

**What it measures**:
- Router endpoints >30 lines
- Services raising `HTTPException`

**Current baseline**:
- 62 router violations (long endpoint functions)
- 0 service violations ✅

**Target**: <10 total violations

### 4. Code Reuse Rate

**What it measures**: Ratio of modified vs newly created methods in recent commits

**How it works**:
```python
reuse_rate = methods_modified / (methods_created + methods_modified)
```

**Current baseline**: Pending first measurements after implementation

**Target**: >80% reuse rate

### 5. Discovery Time

**What it measures**: Time to find existing methods

**Calculation**:
- Before: ~120s (read 1500-line file)
- After: `backend_index.py` size / 10 KB/s

**Current baseline**: 1.9s (63.7x improvement)

**Target**: <5s

---

## Health Score

**Formula**:
```python
health_score = 100
health_score -= violation_rate * 30      # File size violations
health_score -= min(layer_violations * 5, 30)  # Layer violations
health_score -= min(duplication_rate * 40, 40) # Duplication
```

**Grades**:
- A (90-100): Excellent
- B (80-89): Good
- C (70-79): Fair
- D (60-69): Needs improvement
- F (<60): Needs urgent attention

**Current baseline**: 59.4/100 (F) - Expected before full adoption

**Target**: 80+/100 (B) after 1 month

---

## Tracking Over Time

### Manual Tracking

Create a `metrics/` directory and save snapshots:

```bash
# Create metrics directory
mkdir -p metrics

# Save weekly snapshots
python3 scripts/measure_backend_excellence.py \
  --json \
  --output "metrics/$(date +%Y-%m-%d).json"

# Compare to baseline
python3 scripts/compare_metrics.py \
  metrics/2025-01-23.json \
  metrics/$(date +%Y-%m-%d).json
```

### Automated Tracking (GitHub Actions)

Create `.github/workflows/backend-metrics.yml`:

```yaml
name: Backend Excellence Metrics

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    # Run weekly on Monday at 9am
    - cron: '0 9 * * 1'

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git analysis

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'

      - name: Collect metrics
        run: |
          python3 scripts/measure_backend_excellence.py --json --output metrics-report.json

      - name: Display report
        run: |
          python3 scripts/measure_backend_excellence.py

      - name: Upload metrics artifact
        uses: actions/upload-artifact@v3
        with:
          name: backend-metrics
          path: metrics-report.json

      - name: Comment on PR (if PR)
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const metrics = JSON.parse(fs.readFileSync('metrics-report.json'));

            const body = `## Backend Excellence Metrics

            **Health Score**: ${metrics.health_score}/100 (${metrics.grade})

            **File Size Violations**: ${metrics.metrics.file_sizes.violation_count}/${metrics.metrics.file_sizes.total_files}
            **Layer Violations**: ${metrics.metrics.layer_violations.total_violations}
            **Duplicated Methods**: ${metrics.metrics.method_duplication.duplicate_count}

            ${metrics.health_score < 70 ? '⚠️ **Consider addressing violations before merging**' : '✅ **Good backend quality**'}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

### Dashboard Visualization

For trend analysis, you can:

1. **Collect historical data**:
   ```bash
   for i in {1..30}; do
     git checkout HEAD~$i
     python3 scripts/measure_backend_excellence.py --json --output metrics/day-$i.json
     git checkout -
   done
   ```

2. **Analyze trends** (Python script you'll create):
   ```python
   import json
   import matplotlib.pyplot as plt

   scores = []
   dates = []

   for file in sorted(Path('metrics').glob('*.json')):
       with open(file) as f:
           data = json.load(f)
           scores.append(data['health_score'])
           dates.append(data['timestamp'][:10])

   plt.plot(dates, scores)
   plt.title('Backend Excellence Health Score Over Time')
   plt.ylabel('Score (0-100)')
   plt.xlabel('Date')
   plt.show()
   ```

---

## Interpreting Results

### Good Signs ✅

- Health score increasing over time
- Violation rate decreasing
- Reuse rate >75%
- New PRs add <2 violations

### Warning Signs ⚠️

- Health score decreasing
- New files consistently over size limits
- Same method names appearing in 3+ files
- Layer violations increasing

### Action Items by Score

**F (< 60)**:
- Run `./scripts/discover_methods.sh list` and ensure agents know about existing code
- Review largest files for splitting opportunities
- Check if agents are reading BACKEND_QUICK_REF.md

**D (60-69)**:
- Focus on one category (file size OR duplication OR violations)
- Update backend_index.py if out of date
- Add missing services to services/__init__.py

**C (70-79)**:
- Continue current practices
- Address remaining large files
- Monitor for regression

**B (80-89)**:
- Maintain momentum
- Document successful patterns
- Share learnings with team

**A (90-100)**:
- Backend excellence is working!
- Update patterns based on what's working
- Consider case study/blog post

---

## Weekly Review Process

### Monday Morning (5 minutes)

```bash
# 1. Run metrics
python3 scripts/measure_backend_excellence.py --output metrics/weekly.json

# 2. Check health score
cat metrics/weekly.json | jq '.health_score'

# 3. Identify top issues
cat metrics/weekly.json | jq '.metrics.file_sizes.violations[:3]'
```

### Monthly Review (30 minutes)

1. **Trend Analysis**:
   - Compare metrics from last 4 weeks
   - Identify improving/declining areas

2. **Root Cause**:
   - Why are violations happening?
   - Are agents reading the documentation?
   - Is backend_index.py up to date?

3. **Action Plan**:
   - Update documentation if patterns are unclear
   - Split files if agents consistently struggle
   - Add examples for problematic patterns

4. **Update Targets**:
   - Adjust targets based on progress
   - Celebrate wins (share metrics with team)

---

## Integration with Development Workflow

### Before Creating PR

```bash
# Check your changes don't worsen metrics
python3 scripts/measure_backend_excellence.py

# If score drops >5 points, review:
# - Did you create a new large file?
# - Did you duplicate an existing method?
# - Did you add logic to a router?
```

### During Code Review

Reviewers can run:
```bash
# Compare PR branch to main
git checkout pr-branch
python3 scripts/measure_backend_excellence.py --json --output pr-metrics.json

git checkout main
python3 scripts/measure_backend_excellence.py --json --output main-metrics.json

# Compare (manual for now)
diff <(jq '.health_score' pr-metrics.json) <(jq '.health_score' main-metrics.json)
```

---

## Metrics Storage

### Recommended Structure

```
metrics/
├── 2025-01-23.json          # Baseline (before backend excellence)
├── 2025-01-30.json          # Week 1
├── 2025-02-06.json          # Week 2
├── weekly/
│   ├── 2025-W04.json
│   ├── 2025-W05.json
│   └── ...
└── pr-snapshots/
    ├── pr-1234.json
    ├── pr-1235.json
    └── ...
```

### Git Tracking

**Option 1**: Track metrics in git (recommended for small teams)
```bash
git add metrics/*.json
git commit -m "docs: update backend excellence metrics"
```

**Option 2**: Store externally (recommended for large teams)
- Upload to S3/GCS
- Store in monitoring system (Datadog, Grafana)
- Add to internal dashboard

---

## Example: Measuring Impact of Backend Excellence

### Baseline (2025-01-23 - Before Implementation)
```json
{
  "health_score": 59.4,
  "metrics": {
    "file_sizes": {"violation_rate": 0.286},
    "method_duplication": {"duplicate_count": 30},
    "layer_violations": {"total_violations": 62},
    "discovery": {"estimated_discovery_seconds": 1.9}
  }
}
```

### Target (2025-02-23 - After 1 Month)
```json
{
  "health_score": 82.0,
  "metrics": {
    "file_sizes": {"violation_rate": 0.05},
    "method_duplication": {"duplicate_count": 8},
    "layer_violations": {"total_violations": 5},
    "discovery": {"estimated_discovery_seconds": 2.5}
  }
}
```

**Expected improvements**:
- Health score: +22.6 points
- File size violations: -82% (14 → 2-3 files)
- Duplication: -73% (30 → 8 methods)
- Layer violations: -92% (62 → 5)

---

## Troubleshooting

### "Git not available" error
- Ensure you're in a git repository
- Check git is installed: `which git`

### High duplication count but no issues
- Some duplication is expected (interface methods)
- Focus on reducing NEW duplications
- Check if duplicates are intentional (different layers)

### Metrics script crashes
```bash
# Check Python version
python3 --version  # Should be 3.12+

# Run with verbose errors
python3 -u scripts/measure_backend_excellence.py
```

---

## Future Enhancements

Potential additions to metrics system:

1. **Complexity Analysis**:
   - Run Ruff and count violations
   - Track cyclomatic complexity trends

2. **Import Graph**:
   - Visualize dependencies
   - Detect circular imports

3. **Test Coverage Correlation**:
   - Does better backend structure improve test coverage?

4. **Agent Performance**:
   - Track which agents follow patterns best
   - Correlate with agent model versions

5. **Time-to-Fix**:
   - How long does it take to find and fix bugs?
   - Does discoverability improve velocity?

---

## Summary

**Manual workflow**:
```bash
# Weekly
python3 scripts/measure_backend_excellence.py --output metrics/weekly.json

# Before PR
python3 scripts/measure_backend_excellence.py
```

**Automated workflow**:
- Set up GitHub Actions (copy workflow above)
- Review PR comments automatically
- Track trends in artifacts

**Success criteria**:
- Health score >80 within 1 month
- <5% file size violations
- <10 duplicated methods
- Agents using backend_index.py consistently

**Review schedule**:
- Daily: Check PR impact (automated)
- Weekly: Run manual report (5 min)
- Monthly: Trend analysis and retrospective (30 min)
