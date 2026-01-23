#!/usr/bin/env python3
"""
Frontend Excellence Metrics Collector

Measures frontend code quality metrics to track improvement over time.

Usage:
    python scripts/measure_frontend_excellence.py                 # Full report
    python scripts/measure_frontend_excellence.py --json          # JSON output
    python scripts/measure_frontend_excellence.py --compare DATE  # Compare to baseline

Metrics tracked:
- File size violations (pages/components over limits)
- data-testid coverage
- Component reuse vs duplication
- Hook extraction patterns
- Forbidden pattern usage (custom modals, etc.)
"""

import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# =============================================================================
# Configuration
# =============================================================================

REPO_ROOT = Path(__file__).parent.parent
FRONTEND_SRC = REPO_ROOT / "ushadow" / "frontend" / "src"

FILE_SIZE_LIMITS = {
    "pages": 600,
    "components": 300,
    "hooks": 100,
}

# Patterns that should use shared components instead
FORBIDDEN_PATTERNS = {
    "custom_modal": r'className=["\'].*fixed\s+inset-0.*["\']',
    "custom_secret_input": r'type=["\']password["\'].*eye.*icon',
    "inline_state_management": r'const\s+\[\w+,\s*set\w+\]\s*=\s*useState<\w+>',
}

REQUIRED_COMPONENTS = {
    "Modal": "components/Modal",
    "SecretInput": "components/settings/SecretInput",
    "SettingField": "components/settings/SettingField",
    "ConfirmDialog": "components/ConfirmDialog",
}

# =============================================================================
# Metric 1: File Size Violations
# =============================================================================

def measure_file_sizes() -> Dict[str, any]:
    """
    Measure TypeScript/TSX files exceeding size limits.

    Returns:
        {
            "violations": [(file, lines, limit), ...],
            "total_files": int,
            "violation_rate": float,
            "largest_file": [file, lines],
        }
    """
    violations = []
    file_sizes = []

    for layer, limit in FILE_SIZE_LIMITS.items():
        layer_dir = FRONTEND_SRC / layer
        if not layer_dir.exists():
            continue

        for ts_file in layer_dir.rglob("*.tsx"):
            with open(ts_file) as f:
                lines = len(f.readlines())

            file_sizes.append([str(ts_file.relative_to(REPO_ROOT)), lines])

            if lines > limit:
                violations.append([
                    str(ts_file.relative_to(REPO_ROOT)),
                    lines,
                    limit
                ])

    file_sizes.sort(key=lambda x: x[1], reverse=True)

    return {
        "violations": violations,
        "total_files": len(file_sizes),
        "violation_count": len(violations),
        "violation_rate": len(violations) / len(file_sizes) if file_sizes else 0,
        "largest_file": file_sizes[0] if file_sizes else None,
        "top_5_largest": file_sizes[:5],
    }

# =============================================================================
# Metric 2: data-testid Coverage
# =============================================================================

def count_interactive_elements(content: str) -> int:
    """Count interactive elements in TSX content."""
    patterns = [
        r'<button[^>]*>',
        r'<input[^>]*>',
        r'<select[^>]*>',
        r'<a[^>]*>',
        r'<textarea[^>]*>',
        r'onClick=\{',
    ]

    count = 0
    for pattern in patterns:
        count += len(re.findall(pattern, content))

    return count

def count_testids(content: str) -> int:
    """Count data-testid attributes in TSX content."""
    return len(re.findall(r'data-testid=["\']', content))

def measure_testid_coverage() -> Dict[str, any]:
    """
    Measure data-testid coverage across components and pages.

    Returns:
        {
            "total_interactive_elements": int,
            "elements_with_testid": int,
            "coverage_rate": float,
            "files_without_testids": [file, ...],
        }
    """
    total_interactive = 0
    total_testids = 0
    files_without_testids = []
    file_coverage = []

    for tsx_file in FRONTEND_SRC.rglob("*.tsx"):
        # Skip non-component files
        if "node_modules" in str(tsx_file):
            continue

        with open(tsx_file) as f:
            content = f.read()

        interactive = count_interactive_elements(content)
        testids = count_testids(content)

        total_interactive += interactive
        total_testids += testids

        if interactive > 0:
            coverage = testids / interactive
            file_coverage.append([
                str(tsx_file.relative_to(REPO_ROOT)),
                testids,
                interactive,
                coverage
            ])

            if testids == 0:
                files_without_testids.append(str(tsx_file.relative_to(REPO_ROOT)))

    # Sort by coverage (worst first)
    file_coverage.sort(key=lambda x: x[3])

    return {
        "total_interactive_elements": total_interactive,
        "elements_with_testid": total_testids,
        "coverage_rate": total_testids / total_interactive if total_interactive > 0 else 0,
        "files_without_testids": files_without_testids[:10],
        "worst_coverage_files": file_coverage[:10],
    }

# =============================================================================
# Metric 3: Component Reuse
# =============================================================================

def measure_component_reuse() -> Dict[str, any]:
    """
    Measure usage of required shared components.

    Returns:
        {
            "component_usage": {component: count, ...},
            "forbidden_pattern_violations": [...],
        }
    """
    component_usage = {comp: 0 for comp in REQUIRED_COMPONENTS.keys()}
    forbidden_violations = defaultdict(list)

    for tsx_file in FRONTEND_SRC.rglob("*.tsx"):
        with open(tsx_file) as f:
            content = f.read()

        # Check for required component usage
        for component in REQUIRED_COMPONENTS.keys():
            pattern = f'<{component}[\\s>]'
            matches = re.findall(pattern, content)
            component_usage[component] += len(matches)

        # Check for forbidden patterns
        for pattern_name, pattern_regex in FORBIDDEN_PATTERNS.items():
            matches = re.findall(pattern_regex, content)
            if matches:
                forbidden_violations[pattern_name].append({
                    "file": str(tsx_file.relative_to(REPO_ROOT)),
                    "count": len(matches),
                })

    return {
        "component_usage": component_usage,
        "total_shared_component_usage": sum(component_usage.values()),
        "forbidden_pattern_violations": dict(forbidden_violations),
        "forbidden_pattern_count": sum(
            sum(v["count"] for v in violations)
            for violations in forbidden_violations.values()
        ),
    }

# =============================================================================
# Metric 4: Hook Extraction Patterns
# =============================================================================

def find_component_hooks(content: str) -> Tuple[int, int]:
    """
    Find hooks in component.

    Returns:
        (local_hooks_count, imported_hooks_count)
    """
    # Local hooks (defined in the file)
    local_hooks = len(re.findall(r'const\s+use\w+\s*=', content))

    # Imported hooks (from hooks directory)
    imported_hooks = len(re.findall(r'import\s+\{[^}]*use\w+[^}]*\}\s+from\s+["\'].*hooks', content))

    return (local_hooks, imported_hooks)

def measure_hook_extraction() -> Dict[str, any]:
    """
    Measure hook extraction patterns.

    Returns:
        {
            "total_components": int,
            "components_with_hooks": int,
            "local_hooks": int,
            "imported_hooks": int,
            "extraction_rate": float,
        }
    """
    total_components = 0
    components_with_hooks = 0
    total_local_hooks = 0
    total_imported_hooks = 0
    large_components = []

    pages_dir = FRONTEND_SRC / "pages"
    components_dir = FRONTEND_SRC / "components"

    for tsx_file in list(pages_dir.rglob("*.tsx")) + list(components_dir.rglob("*.tsx")):
        with open(tsx_file) as f:
            content = f.read()
            lines = len(f.readlines())

        total_components += 1

        local, imported = find_component_hooks(content)

        if local > 0 or imported > 0:
            components_with_hooks += 1
            total_local_hooks += local
            total_imported_hooks += imported

        # Flag components with many local hooks (should extract)
        if local > 3:
            large_components.append([
                str(tsx_file.relative_to(REPO_ROOT)),
                local,
                lines
            ])

    return {
        "total_components": total_components,
        "components_with_hooks": components_with_hooks,
        "local_hooks": total_local_hooks,
        "imported_hooks": total_imported_hooks,
        "extraction_rate": total_imported_hooks / (total_local_hooks + total_imported_hooks)
            if (total_local_hooks + total_imported_hooks) > 0 else 0,
        "components_needing_extraction": large_components,
    }

# =============================================================================
# Metric 5: Import Organization
# =============================================================================

def check_import_patterns(content: str) -> Dict[str, int]:
    """Check import organization patterns."""
    issues = {
        "relative_imports": 0,
        "missing_path_aliases": 0,
        "unorganized_imports": 0,
    }

    # Relative imports (should use @/ aliases)
    relative = re.findall(r'import.*from\s+["\']\.\./', content)
    issues["relative_imports"] = len(relative)

    # Check if imports are organized (React first, then third-party, then local)
    import_block = re.search(r'^import.*?(?=\n\n|\nexport|\nconst|\nfunction)', content, re.MULTILINE | re.DOTALL)
    if import_block:
        imports = import_block.group(0)
        # Simple heuristic: react import should be first
        if imports and not imports.strip().startswith("import") or "import React" not in imports.split('\n')[0]:
            issues["unorganized_imports"] = 1

    return issues

def measure_import_quality() -> Dict[str, any]:
    """
    Measure import statement quality.

    Returns:
        {
            "total_files": int,
            "files_with_relative_imports": int,
            "files_with_unorganized_imports": int,
        }
    """
    total_files = 0
    files_with_issues = defaultdict(int)

    for tsx_file in FRONTEND_SRC.rglob("*.tsx"):
        with open(tsx_file) as f:
            content = f.read()

        total_files += 1
        issues = check_import_patterns(content)

        if issues["relative_imports"] > 0:
            files_with_issues["relative_imports"] += 1
        if issues["unorganized_imports"] > 0:
            files_with_issues["unorganized_imports"] += 1

    return {
        "total_files": total_files,
        "files_with_relative_imports": files_with_issues["relative_imports"],
        "files_with_unorganized_imports": files_with_issues["unorganized_imports"],
        "relative_import_rate": files_with_issues["relative_imports"] / total_files if total_files > 0 else 0,
    }

# =============================================================================
# Metric 6: Code Reuse Detection (Git Analysis)
# =============================================================================

def analyze_git_diff(since_date: Optional[str] = None) -> Dict[str, any]:
    """
    Analyze recent commits for component creation vs reuse.

    Returns:
        {
            "new_components_created": int,
            "components_modified": int,
            "reuse_rate": float,
        }
    """
    try:
        cmd = ["git", "log", "--pretty=format:%H", "--since", since_date or "1.week.ago"]
        result = subprocess.run(
            cmd,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return {"error": "Git not available"}

        commits = result.stdout.strip().split("\n")

        new_components = 0
        modified_components = 0

        for commit in commits[:20]:
            diff_cmd = ["git", "show", "--format=", commit, "--", "*.tsx", "*.ts"]
            diff_result = subprocess.run(
                diff_cmd,
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
            )

            diff = diff_result.stdout

            # Count new component definitions
            new_components += len(re.findall(r'^\+.*export\s+(default\s+)?function\s+\w+', diff, re.MULTILINE))
            new_components += len(re.findall(r'^\+.*export\s+(default\s+)?const\s+\w+.*=.*\(', diff, re.MULTILINE))

            # Count modified components
            modified_components += len(re.findall(r'^[-+].*export\s+(default\s+)?function\s+\w+', diff, re.MULTILINE)) - new_components

        return {
            "commits_analyzed": len(commits[:20]),
            "new_components_created": new_components,
            "components_modified": modified_components,
            "reuse_rate": modified_components / (new_components + modified_components)
                if (new_components + modified_components) > 0 else 0,
        }

    except Exception as e:
        return {"error": str(e)}

# =============================================================================
# Aggregate Report
# =============================================================================

def generate_report(as_json: bool = False) -> Dict[str, any]:
    """Generate complete metrics report."""

    report = {
        "timestamp": datetime.now().isoformat(),
        "metrics": {
            "file_sizes": measure_file_sizes(),
            "testid_coverage": measure_testid_coverage(),
            "component_reuse": measure_component_reuse(),
            "hook_extraction": measure_hook_extraction(),
            "import_quality": measure_import_quality(),
            "code_reuse": analyze_git_diff(),
        }
    }

    # Calculate overall health score
    fs = report["metrics"]["file_sizes"]
    testid = report["metrics"]["testid_coverage"]
    reuse = report["metrics"]["component_reuse"]
    hooks = report["metrics"]["hook_extraction"]

    health_score = 100

    # File size violations (-30 max)
    health_score -= min(fs["violation_rate"] * 30, 30)

    # testid coverage (+40 for good coverage)
    health_score -= (1 - testid["coverage_rate"]) * 40

    # Forbidden patterns (-20)
    forbidden_count = reuse["forbidden_pattern_count"]
    health_score -= min(forbidden_count * 2, 20)

    # Hook extraction (+10 for good extraction)
    health_score -= (1 - hooks["extraction_rate"]) * 10

    report["health_score"] = max(0, round(health_score, 1))
    report["grade"] = get_grade(report["health_score"])

    return report

def get_grade(score: float) -> str:
    """Convert score to letter grade."""
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    else:
        return "F"

# =============================================================================
# Output Formatting
# =============================================================================

def print_report(report: Dict[str, any]):
    """Print human-readable report."""

    print("=" * 80)
    print(f"Frontend Excellence Metrics Report - {report['timestamp'][:10]}")
    print("=" * 80)
    print()

    # Overall health
    score = report["health_score"]
    grade = report["grade"]
    print(f"🎯 Overall Health Score: {score}/100 (Grade: {grade})")
    print()

    # File sizes
    print("📏 File Size Analysis")
    print("-" * 80)
    fs = report["metrics"]["file_sizes"]
    print(f"Total files analyzed: {fs['total_files']}")
    print(f"Files over limit: {fs['violation_count']} ({fs['violation_rate']:.1%})")

    if fs['largest_file']:
        file, lines = fs['largest_file']
        print(f"Largest file: {file} ({lines} lines)")

    if fs['violations']:
        print("\nViolations:")
        for file, lines, limit in fs['violations'][:5]:
            print(f"  - {file}: {lines} lines (limit: {limit})")
    print()

    # testid coverage
    print("🧪 data-testid Coverage")
    print("-" * 80)
    tc = report["metrics"]["testid_coverage"]
    print(f"Interactive elements: {tc['total_interactive_elements']}")
    print(f"Elements with testid: {tc['elements_with_testid']}")
    print(f"Coverage rate: {tc['coverage_rate']:.1%}")

    if tc['files_without_testids']:
        print(f"\nFiles without any testids: {len(tc['files_without_testids'])}")
        for file in tc['files_without_testids'][:5]:
            print(f"  - {file}")
    print()

    # Component reuse
    print("♻️  Component Reuse")
    print("-" * 80)
    cr = report["metrics"]["component_reuse"]
    print(f"Shared components used: {cr['total_shared_component_usage']} times")
    print("\nComponent usage breakdown:")
    for comp, count in cr['component_usage'].items():
        print(f"  - {comp}: {count} uses")

    if cr['forbidden_pattern_violations']:
        print(f"\n⚠️  Forbidden patterns found: {cr['forbidden_pattern_count']}")
        for pattern, violations in cr['forbidden_pattern_violations'].items():
            print(f"  - {pattern}: {len(violations)} files")
    print()

    # Hook extraction
    print("🪝 Hook Extraction")
    print("-" * 80)
    he = report["metrics"]["hook_extraction"]
    print(f"Components analyzed: {he['total_components']}")
    print(f"Local hooks: {he['local_hooks']}")
    print(f"Imported hooks: {he['imported_hooks']}")
    print(f"Extraction rate: {he['extraction_rate']:.1%}")

    if he['components_needing_extraction']:
        print(f"\nComponents with >3 local hooks (should extract):")
        for file, hooks, lines in he['components_needing_extraction'][:5]:
            print(f"  - {file}: {hooks} hooks, {lines} lines")
    print()

    # Import quality
    print("📦 Import Quality")
    print("-" * 80)
    iq = report["metrics"]["import_quality"]
    print(f"Files with relative imports: {iq['files_with_relative_imports']}/{iq['total_files']} ({iq['relative_import_rate']:.1%})")
    print(f"Files with unorganized imports: {iq['files_with_unorganized_imports']}/{iq['total_files']}")
    print()

    # Code reuse
    print("🔄 Code Reuse (Git Analysis)")
    print("-" * 80)
    gr = report["metrics"]["code_reuse"]
    if "error" in gr:
        print(f"Error: {gr['error']}")
    else:
        print(f"Commits analyzed: {gr.get('commits_analyzed', 0)}")
        print(f"New components created: {gr.get('new_components_created', 0)}")
        print(f"Components modified: {gr.get('components_modified', 0)}")
        print(f"Reuse rate: {gr.get('reuse_rate', 0):.1%}")
    print()

    # Recommendations
    print("💡 Recommendations")
    print("-" * 80)
    if score >= 90:
        print("✅ Excellent! Frontend excellence standards are being maintained.")
    elif score >= 70:
        print("⚠️  Good progress. Focus on improving testid coverage.")
    else:
        print("❌ Needs attention. Review frontend excellence documentation.")

    if tc['coverage_rate'] < 0.8:
        print("• Improve data-testid coverage (target: >80%)")

    if cr['forbidden_pattern_count'] > 0:
        print("• Remove forbidden patterns - use shared components instead")

    if he['extraction_rate'] < 0.5:
        print("• Extract more hooks to shared hooks directory")

    print("=" * 80)

# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Measure frontend excellence metrics")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--output", help="Save report to file")
    parser.add_argument("--since", help="Analyze commits since date (YYYY-MM-DD)")

    args = parser.parse_args()

    report = generate_report(as_json=args.json)

    if args.json:
        output = json.dumps(report, indent=2)
        print(output)
    else:
        print_report(report)

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\n📝 Report saved to: {args.output}")

if __name__ == "__main__":
    main()
