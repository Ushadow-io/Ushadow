#!/usr/bin/env python3
"""
Combined Excellence Dashboard

Generates a unified view of frontend and backend excellence metrics.

Usage:
    python scripts/combined_excellence_dashboard.py          # Display dashboard
    python scripts/combined_excellence_dashboard.py --json   # JSON output
    python scripts/combined_excellence_dashboard.py --html   # HTML dashboard
"""

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict

REPO_ROOT = Path(__file__).parent.parent

def run_backend_metrics() -> Dict:
    """Run backend metrics collector."""
    result = subprocess.run(
        [sys.executable, "scripts/measure_backend_excellence.py", "--json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)

def run_frontend_metrics() -> Dict:
    """Run frontend metrics collector."""
    result = subprocess.run(
        [sys.executable, "scripts/measure_frontend_excellence.py", "--json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)

def generate_combined_dashboard() -> Dict:
    """Generate combined dashboard data."""

    print("Collecting backend metrics...", file=sys.stderr)
    backend = run_backend_metrics()

    print("Collecting frontend metrics...", file=sys.stderr)
    frontend = run_frontend_metrics()

    # Calculate overall health (weighted average)
    overall_health = (backend["health_score"] * 0.5 + frontend["health_score"] * 0.5)

    dashboard = {
        "timestamp": datetime.now().isoformat(),
        "overall_health": round(overall_health, 1),
        "overall_grade": get_grade(overall_health),
        "frontend": {
            "health_score": frontend["health_score"],
            "grade": frontend["grade"],
            "metrics": {
                "testid_coverage": frontend["metrics"]["testid_coverage"]["coverage_rate"],
                "file_violations": frontend["metrics"]["file_sizes"]["violation_count"],
                "total_files": frontend["metrics"]["file_sizes"]["total_files"],
                "forbidden_patterns": frontend["metrics"]["component_reuse"]["forbidden_pattern_count"],
                "shared_component_usage": frontend["metrics"]["component_reuse"]["total_shared_component_usage"],
            }
        },
        "backend": {
            "health_score": backend["health_score"],
            "grade": backend["grade"],
            "metrics": {
                "method_duplication": backend["metrics"]["method_duplication"]["duplicate_count"],
                "file_violations": backend["metrics"]["file_sizes"]["violation_count"],
                "total_files": backend["metrics"]["file_sizes"]["total_files"],
                "layer_violations": backend["metrics"]["layer_violations"]["total_violations"],
                "discovery_time": backend["metrics"]["discovery"]["estimated_discovery_seconds"],
            }
        },
        "comparison": {
            "total_files": frontend["metrics"]["file_sizes"]["total_files"] + backend["metrics"]["file_sizes"]["total_files"],
            "total_violations": frontend["metrics"]["file_sizes"]["violation_count"] + backend["metrics"]["file_sizes"]["violation_count"],
            "overall_violation_rate": (
                frontend["metrics"]["file_sizes"]["violation_count"] + backend["metrics"]["file_sizes"]["violation_count"]
            ) / (
                frontend["metrics"]["file_sizes"]["total_files"] + backend["metrics"]["file_sizes"]["total_files"]
            ) if (frontend["metrics"]["file_sizes"]["total_files"] + backend["metrics"]["file_sizes"]["total_files"]) > 0 else 0,
        }
    }

    return dashboard

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

def print_dashboard(dashboard: Dict):
    """Print human-readable dashboard."""

    print("=" * 80)
    print("COMBINED EXCELLENCE DASHBOARD")
    print("=" * 80)
    print(f"Generated: {dashboard['timestamp'][:19]}")
    print()

    # Overall health
    print("🎯 OVERALL HEALTH")
    print("-" * 80)
    print(f"Combined Score: {dashboard['overall_health']}/100 (Grade: {dashboard['overall_grade']})")
    print(f"Frontend:       {dashboard['frontend']['health_score']}/100 (Grade: {dashboard['frontend']['grade']})")
    print(f"Backend:        {dashboard['backend']['health_score']}/100 (Grade: {dashboard['backend']['grade']})")
    print()

    # Frontend summary
    print("🎨 FRONTEND METRICS")
    print("-" * 80)
    fe = dashboard['frontend']['metrics']
    print(f"data-testid Coverage:   {fe['testid_coverage']:.1%}")
    print(f"File Violations:        {fe['file_violations']}/{fe['total_files']} ({fe['file_violations']/fe['total_files']:.1%})")
    print(f"Forbidden Patterns:     {fe['forbidden_patterns']}")
    print(f"Shared Component Usage: {fe['shared_component_usage']} times")
    print()

    # Backend summary
    print("⚙️  BACKEND METRICS")
    print("-" * 80)
    be = dashboard['backend']['metrics']
    print(f"Method Duplication:     {be['method_duplication']} methods")
    print(f"File Violations:        {be['file_violations']}/{be['total_files']} ({be['file_violations']/be['total_files']:.1%})")
    print(f"Layer Violations:       {be['layer_violations']}")
    print(f"Discovery Time:         ~{be['discovery_time']}s (via backend_index.py)")
    print()

    # Comparison
    print("📊 STACK-WIDE COMPARISON")
    print("-" * 80)
    comp = dashboard['comparison']
    print(f"Total Files Analyzed:   {comp['total_files']}")
    print(f"Total File Violations:  {comp['total_violations']} ({comp['overall_violation_rate']:.1%})")
    print()

    # Key insights
    print("💡 KEY INSIGHTS")
    print("-" * 80)

    if dashboard['overall_health'] >= 80:
        print("✅ Excellent codebase health across frontend and backend!")
    elif dashboard['overall_health'] >= 60:
        print("⚠️  Moderate health - focus improvements on lower-scoring area:")
        if dashboard['frontend']['health_score'] < dashboard['backend']['health_score']:
            print("   → Frontend needs attention (focus on testid coverage)")
        else:
            print("   → Backend needs attention (focus on file sizes/duplication)")
    else:
        print("❌ Critical health issues - review excellence documentation:")
        print(f"   → Frontend: {dashboard['frontend']['health_score']:.1f}/100")
        print(f"   → Backend: {dashboard['backend']['health_score']:.1f}/100")

    print()

    # Recommendations
    print("🎯 TOP PRIORITIES")
    print("-" * 80)

    priorities = []

    # Frontend priorities
    if fe['testid_coverage'] < 0.8:
        priorities.append(("HIGH", f"Improve frontend testid coverage to >80% (currently {fe['testid_coverage']:.1%})"))

    if fe['forbidden_patterns'] > 5:
        priorities.append(("MED", f"Remove {fe['forbidden_patterns']} forbidden patterns (use shared components)"))

    # Backend priorities
    if be['method_duplication'] > 15:
        priorities.append(("HIGH", f"Reduce backend method duplication to <10 (currently {be['method_duplication']})"))

    if be['layer_violations'] > 10:
        priorities.append(("HIGH", f"Fix {be['layer_violations']} layer boundary violations"))

    # Overall priorities
    if comp['overall_violation_rate'] > 0.2:
        priorities.append(("MED", f"Reduce file size violations to <10% (currently {comp['overall_violation_rate']:.1%})"))

    # Print priorities
    if not priorities:
        print("✅ No critical issues - maintain current practices!")
    else:
        for priority, action in sorted(priorities, key=lambda x: 0 if x[0] == "HIGH" else 1):
            print(f"[{priority}] {action}")

    print("=" * 80)

def generate_html_dashboard(dashboard: Dict) -> str:
    """Generate HTML dashboard."""

    html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Excellence Dashboard - {dashboard['timestamp'][:10]}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 40px;
            background: #f5f5f5;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        h1 {{
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }}
        .metrics-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
        }}
        .metric-card {{
            border: 1px solid #ddd;
            padding: 20px;
            border-radius: 6px;
            background: #fafafa;
        }}
        .metric-card h2 {{
            margin-top: 0;
            color: #555;
        }}
        .score {{
            font-size: 48px;
            font-weight: bold;
            margin: 10px 0;
        }}
        .grade-A {{ color: #4CAF50; }}
        .grade-B {{ color: #8BC34A; }}
        .grade-C {{ color: #FFC107; }}
        .grade-D {{ color: #FF9800; }}
        .grade-F {{ color: #F44336; }}
        .stat {{
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }}
        .stat:last-child {{
            border-bottom: none;
        }}
        .priority {{
            padding: 10px;
            margin: 10px 0;
            border-left: 4px solid #FFC107;
            background: #FFFDE7;
        }}
        .priority-HIGH {{
            border-left-color: #F44336;
            background: #FFEBEE;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Excellence Dashboard</h1>
        <p>Generated: {dashboard['timestamp'][:19]}</p>

        <div class="metric-card">
            <h2>Overall Health</h2>
            <div class="score grade-{dashboard['overall_grade']}">
                {dashboard['overall_health']}/100
            </div>
            <div>Grade: {dashboard['overall_grade']}</div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <h2>🎨 Frontend</h2>
                <div class="score grade-{dashboard['frontend']['grade']}">
                    {dashboard['frontend']['health_score']}/100
                </div>
                <div class="stat">
                    <span>testid Coverage</span>
                    <strong>{dashboard['frontend']['metrics']['testid_coverage']:.1%}</strong>
                </div>
                <div class="stat">
                    <span>File Violations</span>
                    <strong>{dashboard['frontend']['metrics']['file_violations']}/{dashboard['frontend']['metrics']['total_files']}</strong>
                </div>
                <div class="stat">
                    <span>Forbidden Patterns</span>
                    <strong>{dashboard['frontend']['metrics']['forbidden_patterns']}</strong>
                </div>
            </div>

            <div class="metric-card">
                <h2>⚙️ Backend</h2>
                <div class="score grade-{dashboard['backend']['grade']}">
                    {dashboard['backend']['health_score']}/100
                </div>
                <div class="stat">
                    <span>Method Duplication</span>
                    <strong>{dashboard['backend']['metrics']['method_duplication']}</strong>
                </div>
                <div class="stat">
                    <span>File Violations</span>
                    <strong>{dashboard['backend']['metrics']['file_violations']}/{dashboard['backend']['metrics']['total_files']}</strong>
                </div>
                <div class="stat">
                    <span>Layer Violations</span>
                    <strong>{dashboard['backend']['metrics']['layer_violations']}</strong>
                </div>
            </div>
        </div>

        <div class="metric-card">
            <h2>📊 Stack-Wide Metrics</h2>
            <div class="stat">
                <span>Total Files Analyzed</span>
                <strong>{dashboard['comparison']['total_files']}</strong>
            </div>
            <div class="stat">
                <span>Overall Violation Rate</span>
                <strong>{dashboard['comparison']['overall_violation_rate']:.1%}</strong>
            </div>
        </div>
    </div>
</body>
</html>
"""
    return html

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Combined excellence dashboard")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--html", action="store_true", help="Generate HTML dashboard")
    parser.add_argument("--output", help="Save to file")

    args = parser.parse_args()

    dashboard = generate_combined_dashboard()

    if args.json:
        output = json.dumps(dashboard, indent=2)
        print(output)
    elif args.html:
        output = generate_html_dashboard(dashboard)
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            print(f"HTML dashboard saved to: {args.output}", file=sys.stderr)
        else:
            print(output)
    else:
        print_dashboard(dashboard)

    if args.output and not args.html:
        with open(args.output, 'w') as f:
            json.dump(dashboard, f, indent=2)
        print(f"\nDashboard saved to: {args.output}", file=sys.stderr)

if __name__ == "__main__":
    main()
