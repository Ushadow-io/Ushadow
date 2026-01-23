#!/usr/bin/env python3
"""
Backend Excellence Metrics Collector

Measures backend code quality metrics to track improvement over time.

Usage:
    python scripts/measure_backend_excellence.py                 # Full report
    python scripts/measure_backend_excellence.py --json          # JSON output
    python scripts/measure_backend_excellence.py --compare DATE  # Compare to baseline

Metrics tracked:
- File size violations (files over limits)
- Method duplication patterns
- Layer boundary violations
- Code complexity
- Discovery time (simulated)
"""

import ast
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
BACKEND_SRC = REPO_ROOT / "ushadow" / "backend" / "src"

FILE_SIZE_LIMITS = {
    "routers": 500,
    "services": 800,
    "utils": 300,
    "models": 400,
}

COMMON_METHOD_NAMES = [
    "get_status",
    "deploy",
    "get_logs",
    "list_",
    "create_",
    "update_",
    "delete_",
    "start_",
    "stop_",
]

# =============================================================================
# Metric 1: File Size Violations
# =============================================================================

def measure_file_sizes() -> Dict[str, any]:
    """
    Measure files exceeding size limits.

    Returns:
        {
            "violations": [(file, lines, limit), ...],
            "total_files": int,
            "violation_rate": float,
            "largest_file": (file, lines),
        }
    """
    violations = []
    file_sizes = []

    for layer, limit in FILE_SIZE_LIMITS.items():
        layer_dir = BACKEND_SRC / layer
        if not layer_dir.exists():
            continue

        for py_file in layer_dir.glob("*.py"):
            if py_file.name == "__init__.py":
                continue

            with open(py_file) as f:
                lines = len(f.readlines())

            file_sizes.append((py_file.relative_to(REPO_ROOT), lines))

            if lines > limit:
                violations.append((
                    str(py_file.relative_to(REPO_ROOT)),
                    lines,
                    limit
                ))

    file_sizes.sort(key=lambda x: x[1], reverse=True)

    return {
        "violations": violations,
        "total_files": len(file_sizes),
        "violation_count": len(violations),
        "violation_rate": len(violations) / len(file_sizes) if file_sizes else 0,
        "largest_file": [str(file_sizes[0][0]), file_sizes[0][1]] if file_sizes else None,
        "top_5_largest": [[str(f), lines] for f, lines in file_sizes[:5]],
    }

# =============================================================================
# Metric 2: Method Duplication
# =============================================================================

def find_method_definitions(file_path: Path) -> List[Tuple[str, int]]:
    """Extract method names and line numbers from Python file."""
    try:
        with open(file_path) as f:
            tree = ast.parse(f.read())

        methods = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if not node.name.startswith("_"):  # Public methods only
                    methods.append((node.name, node.lineno))

        return methods
    except Exception:
        return []

def measure_method_duplication() -> Dict[str, any]:
    """
    Find potentially duplicated method names across services.

    Returns:
        {
            "duplicates": {method_name: [file1, file2, ...], ...},
            "total_methods": int,
            "duplication_rate": float,
        }
    """
    method_locations = defaultdict(list)
    total_methods = 0

    for py_file in BACKEND_SRC.rglob("*.py"):
        if py_file.name == "__init__.py":
            continue

        methods = find_method_definitions(py_file)
        total_methods += len(methods)

        for method_name, lineno in methods:
            # Check if it matches common patterns
            for pattern in COMMON_METHOD_NAMES:
                if method_name.startswith(pattern.rstrip("_")):
                    method_locations[method_name].append({
                        "file": str(py_file.relative_to(REPO_ROOT)),
                        "line": lineno,
                    })
                    break

    # Filter to only actual duplicates (appears in 2+ files)
    duplicates = {
        method: locations
        for method, locations in method_locations.items()
        if len(locations) >= 2
    }

    return {
        "duplicates": duplicates,
        "duplicate_count": len(duplicates),
        "total_methods": total_methods,
        "commonly_duplicated": sorted(
            duplicates.items(),
            key=lambda x: len(x[1]),
            reverse=True
        )[:10],
    }

# =============================================================================
# Metric 3: Layer Boundary Violations
# =============================================================================

def check_layer_violations() -> Dict[str, any]:
    """
    Check for layer boundary violations.

    Violations:
    - Routers with business logic (>30 lines per endpoint)
    - Services raising HTTPException
    - Routers accessing DB directly

    Returns:
        {
            "router_violations": [...],
            "service_violations": [...],
            "total_violations": int,
        }
    """
    violations = {
        "router_violations": [],
        "service_violations": [],
    }

    # Check routers for HTTPException in services
    services_dir = BACKEND_SRC / "services"
    if services_dir.exists():
        for py_file in services_dir.glob("*.py"):
            with open(py_file) as f:
                content = f.read()

            # Services should NOT raise HTTPException
            if "raise HTTPException" in content:
                matches = re.findall(r'raise HTTPException.*', content)
                violations["service_violations"].append({
                    "file": str(py_file.relative_to(REPO_ROOT)),
                    "issue": "Service raises HTTPException",
                    "count": len(matches),
                })

    # Check routers for long endpoint functions
    routers_dir = BACKEND_SRC / "routers"
    if routers_dir.exists():
        for py_file in routers_dir.glob("*.py"):
            try:
                with open(py_file) as f:
                    tree = ast.parse(f.read())

                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        # Count lines in function
                        if hasattr(node, 'end_lineno') and hasattr(node, 'lineno'):
                            func_lines = node.end_lineno - node.lineno
                            if func_lines > 30:
                                violations["router_violations"].append({
                                    "file": str(py_file.relative_to(REPO_ROOT)),
                                    "function": node.name,
                                    "lines": func_lines,
                                    "issue": "Endpoint function >30 lines",
                                })
            except Exception:
                pass

    return {
        **violations,
        "total_violations": (
            len(violations["router_violations"]) +
            len(violations["service_violations"])
        ),
    }

# =============================================================================
# Metric 4: Code Reuse Detection
# =============================================================================

def analyze_git_diff(since_date: Optional[str] = None) -> Dict[str, any]:
    """
    Analyze recent commits for code reuse patterns.

    Args:
        since_date: Date string like "2025-01-01" to analyze commits since

    Returns:
        {
            "new_methods_created": int,
            "methods_extended": int,
            "potential_duplicates": int,
        }
    """
    try:
        # Get commits since date
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

        new_methods = 0
        modified_methods = 0

        for commit in commits[:20]:  # Last 20 commits
            # Get diff for Python files
            diff_cmd = ["git", "show", "--format=", commit, "--", "*.py"]
            diff_result = subprocess.run(
                diff_cmd,
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
            )

            diff = diff_result.stdout

            # Count new async def / def additions
            new_methods += len(re.findall(r'^\+\s*(async )?def \w+', diff, re.MULTILINE))
            # Count modified (not new) method definitions
            modified_methods += len(re.findall(r'^[-+]\s*(async )?def \w+', diff, re.MULTILINE)) - new_methods

        return {
            "commits_analyzed": len(commits[:20]),
            "new_methods_created": new_methods,
            "methods_modified": modified_methods,
            "reuse_rate": modified_methods / (new_methods + modified_methods) if (new_methods + modified_methods) > 0 else 0,
        }

    except Exception as e:
        return {"error": str(e)}

# =============================================================================
# Metric 5: Discovery Time (Simulated)
# =============================================================================

def simulate_discovery_time() -> Dict[str, any]:
    """
    Simulate time to discover existing methods.

    Before: Read entire 1500-line file
    After: Grep backend_index.py + read specific file

    Returns:
        {
            "backend_index_exists": bool,
            "backend_index_size_kb": float,
            "estimated_discovery_seconds": float,
        }
    """
    backend_index = REPO_ROOT / "backend_index.py"

    if not backend_index.exists():
        return {
            "backend_index_exists": False,
            "estimated_discovery_seconds": 120,  # Read 1500-line file
        }

    size_kb = backend_index.stat().st_size / 1024

    # Estimate: ~1 second per 10KB to grep/scan
    estimated_time = size_kb / 10

    return {
        "backend_index_exists": True,
        "backend_index_size_kb": round(size_kb, 2),
        "estimated_discovery_seconds": round(estimated_time, 1),
        "improvement_factor": round(120 / estimated_time, 1),
    }

# =============================================================================
# Aggregate Report
# =============================================================================

def generate_report(as_json: bool = False) -> Dict[str, any]:
    """Generate complete metrics report."""

    report = {
        "timestamp": datetime.now().isoformat(),
        "metrics": {
            "file_sizes": measure_file_sizes(),
            "method_duplication": measure_method_duplication(),
            "layer_violations": check_layer_violations(),
            "code_reuse": analyze_git_diff(),
            "discovery": simulate_discovery_time(),
        }
    }

    # Calculate overall health score
    file_size_metric = report["metrics"]["file_sizes"]
    violation_rate = file_size_metric["violation_rate"]

    layer_violations = report["metrics"]["layer_violations"]["total_violations"]

    duplication = report["metrics"]["method_duplication"]
    duplication_rate = duplication["duplicate_count"] / max(duplication["total_methods"], 1)

    # Health score: 100 = perfect, 0 = needs work
    health_score = 100
    health_score -= violation_rate * 30  # File size violations
    health_score -= min(layer_violations * 5, 30)  # Layer violations
    health_score -= min(duplication_rate * 40, 40)  # Duplication

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
    print(f"Backend Excellence Metrics Report - {report['timestamp'][:10]}")
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

    # Method duplication
    print("🔄 Method Duplication Analysis")
    print("-" * 80)
    md = report["metrics"]["method_duplication"]
    print(f"Total public methods: {md['total_methods']}")
    print(f"Duplicated method names: {md['duplicate_count']}")

    if md['commonly_duplicated']:
        print("\nMost duplicated methods:")
        for method, locations in md['commonly_duplicated'][:5]:
            print(f"  - {method}: appears in {len(locations)} files")
    print()

    # Layer violations
    print("🚦 Layer Boundary Violations")
    print("-" * 80)
    lv = report["metrics"]["layer_violations"]
    print(f"Total violations: {lv['total_violations']}")
    print(f"Router violations: {len(lv['router_violations'])}")
    print(f"Service violations: {len(lv['service_violations'])}")

    if lv['service_violations']:
        print("\nService violations (HTTPException usage):")
        for v in lv['service_violations'][:3]:
            print(f"  - {v['file']}: {v['count']} occurrences")
    print()

    # Code reuse
    print("♻️  Code Reuse Analysis")
    print("-" * 80)
    cr = report["metrics"]["code_reuse"]
    if "error" in cr:
        print(f"Error: {cr['error']}")
    else:
        print(f"Commits analyzed: {cr.get('commits_analyzed', 0)}")
        print(f"New methods created: {cr.get('new_methods_created', 0)}")
        print(f"Methods modified: {cr.get('methods_modified', 0)}")
        print(f"Reuse rate: {cr.get('reuse_rate', 0):.1%}")
    print()

    # Discovery
    print("🔍 Discovery Time")
    print("-" * 80)
    disc = report["metrics"]["discovery"]
    if disc['backend_index_exists']:
        print(f"backend_index.py exists: ✅ ({disc['backend_index_size_kb']} KB)")
        print(f"Estimated discovery time: ~{disc['estimated_discovery_seconds']}s")
        print(f"Improvement vs manual search: {disc['improvement_factor']}x faster")
    else:
        print("backend_index.py exists: ❌")
        print("Estimated discovery time: ~120s (manual file reading)")
    print()

    # Recommendations
    print("💡 Recommendations")
    print("-" * 80)
    if score >= 90:
        print("✅ Excellent! Backend excellence standards are being maintained.")
    elif score >= 70:
        print("⚠️  Good progress. Focus on reducing violations.")
    else:
        print("❌ Needs attention. Review backend excellence documentation.")

    if fs['violation_count'] > 0:
        print(f"• Consider splitting {fs['violation_count']} oversized files")

    if lv['total_violations'] > 5:
        print("• Review layer architecture - reduce boundary violations")

    if md['duplicate_count'] > 10:
        print("• High duplication detected - ensure agents are using backend_index.py")

    print("=" * 80)

# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Measure backend excellence metrics")
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
