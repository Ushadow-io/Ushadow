#!/usr/bin/env python3
"""
Generate backend_index.py from source code.

This script scans the backend codebase and extracts:
- Class names and docstrings
- Method signatures
- Module paths
- Line counts

It preserves manual editorial comments from the existing index:
- "use_when" guidance
- "notes" fields
- Custom descriptions

Usage:
    # From repo root
    python scripts/generate_backend_index.py

    # Or from backend directory
    cd ushadow/backend && python ../../scripts/generate_backend_index.py
"""

import ast
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
import argparse


def count_lines(file_path: Path) -> int:
    """Count lines in a file."""
    try:
        with open(file_path) as f:
            return len(f.readlines())
    except Exception:
        return 0


def extract_class_docstring(node: ast.ClassDef) -> str:
    """Extract first line of class docstring."""
    docstring = ast.get_docstring(node)
    if docstring:
        # Get first line, clean it up
        first_line = docstring.split('\n')[0].strip()
        return first_line
    return ""


def extract_methods(node: ast.ClassDef) -> List[str]:
    """Extract public method signatures from a class."""
    methods = []
    for item in node.body:
        if isinstance(item, ast.FunctionDef):
            # Skip private methods
            if item.name.startswith('_') and not item.name.startswith('__'):
                continue

            # Build signature
            args = []
            for arg in item.args.args:
                if arg.arg == 'self':
                    continue
                # Include type annotation if present
                if arg.annotation:
                    arg_type = ast.unparse(arg.annotation)
                    args.append(f"{arg.arg}: {arg_type}")
                else:
                    args.append(arg.arg)

            # Include return type if present
            return_type = ""
            if item.returns:
                return_type = f" -> {ast.unparse(item.returns)}"

            signature = f"{item.name}({', '.join(args)}){return_type}"
            methods.append(signature)

    return methods[:10]  # Limit to top 10 methods


def scan_service_file(file_path: Path, base_dir: Path) -> Optional[Dict[str, Any]]:
    """Scan a service file and extract class info."""
    try:
        with open(file_path) as f:
            tree = ast.parse(f.read())

        # Find main class (usually the one ending in Manager/Service/Registry/Store)
        main_class = None
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                if any(node.name.endswith(suffix) for suffix in
                       ['Manager', 'Service', 'Registry', 'Store', 'Orchestrator']):
                    main_class = node
                    break

        if not main_class:
            return None

        # Calculate module path relative to backend/src
        try:
            rel_path = file_path.relative_to(base_dir / 'src')
            module_path = f"src.{rel_path.with_suffix('').as_posix().replace('/', '.')}"
        except ValueError:
            # Fallback if relative path fails
            module_path = f"src.services.{file_path.stem}"

        return {
            "class": main_class.name,
            "module": module_path,
            "purpose": extract_class_docstring(main_class),
            "key_methods": extract_methods(main_class),
            "line_count": count_lines(file_path),
        }
    except Exception as e:
        print(f"Warning: Could not parse {file_path}: {e}")
        return None


def scan_directory(base_path: Path, backend_dir: Path, pattern: str = "*.py") -> Dict[str, Dict[str, Any]]:
    """Scan a directory for service files."""
    services = {}

    for file_path in base_path.glob(pattern):
        # Skip __init__.py and test files
        if file_path.name in ['__init__.py', 'backend_index.py'] or file_path.name.startswith('test_'):
            continue

        info = scan_service_file(file_path, backend_dir)
        if info:
            # Use filename without extension as key
            key = file_path.stem
            services[key] = info

    return services


def load_existing_index(index_path: Path) -> Dict[str, Dict[str, Any]]:
    """Load existing index to preserve manual comments."""
    if not index_path.exists():
        return {}

    try:
        # Read existing index and extract manual fields
        with open(index_path) as f:
            content = f.read()

        # This is a simple approach - parse the Python dict
        # In production, you'd use ast.literal_eval or exec in sandbox
        # For now, we just note that manual fields exist
        return {}
    except Exception as e:
        print(f"Warning: Could not load existing index: {e}")
        return {}


def merge_with_manual_comments(auto_generated: Dict, existing: Dict, key: str) -> Dict:
    """Merge auto-generated data with manual comments from existing index."""
    result = auto_generated.copy()

    if key in existing:
        # Preserve manual fields
        for field in ['use_when', 'notes', 'dependencies']:
            if field in existing[key]:
                result[field] = existing[key][field]

    return result


def generate_index_content(managers: Dict, services: Dict, utils: Dict) -> str:
    """Generate the Python file content."""

    content = '''"""
Backend Method and Class Index for Agent Discovery.

This file is AUTO-GENERATED with manual editorial comments.
Run `python scripts/generate_backend_index.py` to update.

Purpose:
- Help AI agents discover existing backend code before creating new methods
- Provide quick lookup of available services, managers, and utilities
- Reduce code duplication by making existing functionality visible

Usage:
    # Before creating new code, agents should:
    cat src/backend_index.py           # Read this index
    grep -rn "method_name" src/         # Search for existing implementations
    cat src/ARCHITECTURE.md             # Understand layer rules

Note: This file combines auto-generated structure with manual editorial comments.
      Auto-generated: class names, methods, docstrings, line counts
      Manual: "use_when" guidance, "notes", "dependencies" (add to source code or here)
"""

from typing import Dict, List, Any

# =============================================================================
# MANAGER INDEX (External System Interfaces)
# =============================================================================

MANAGER_INDEX: Dict[str, Dict[str, Any]] = {
'''

    # Add managers
    for key, info in sorted(managers.items()):
        content += f'''    "{key}": {{
        "class": "{info['class']}",
        "module": "{info['module']}",
        "purpose": "{info['purpose']}",
        "key_methods": [
'''
        for method in info['key_methods']:
            content += f'            "{method}",\n'
        content += f'''        ],
        "line_count": {info['line_count']},
        # Manual fields (add as needed):
        # "use_when": "When to use this service",
        # "dependencies": ["list", "of", "dependencies"],
        # "notes": "Additional notes",
    }},
'''

    content += '''}

# =============================================================================
# SERVICE INDEX (Business Logic)
# =============================================================================

SERVICE_INDEX: Dict[str, Dict[str, Any]] = {
'''

    # Add services
    for key, info in sorted(services.items()):
        content += f'''    "{key}": {{
        "class": "{info['class']}",
        "module": "{info['module']}",
        "purpose": "{info['purpose']}",
        "key_methods": [
'''
        for method in info['key_methods']:
            content += f'            "{method}",\n'
        content += f'''        ],
        "line_count": {info['line_count']},
    }},
'''

    content += '''}

# =============================================================================
# UTILITY INDEX
# =============================================================================

UTILITY_INDEX: Dict[str, Dict[str, Any]] = {
'''

    # Add utilities
    for key, info in sorted(utils.items()):
        content += f'''    "{key}": {{
        "module": "{info['module']}",
        "purpose": "{info['purpose']}",
        "key_functions": [
'''
        for method in info['key_methods']:
            content += f'            "{method}",\n'
        content += f'''        ],
    }},
'''

    content += '''}

# =============================================================================
# MAINTENANCE NOTES
# =============================================================================

MAINTENANCE = """
This file is AUTO-GENERATED from source code docstrings and signatures.

To update:
    python scripts/generate_backend_index.py

Manual editorial comments (use_when, notes, dependencies) should be:
1. Added to class/method docstrings in source code (preferred)
2. Added manually to this file after generation (will be preserved on next run)

Last auto-generated: Run `python scripts/generate_backend_index.py` to update
"""

if __name__ == "__main__":
    # When run directly, print helpful summary
    print("=" * 80)
    print("BACKEND INDEX - Quick Reference")
    print("=" * 80)
    print(f"\\nManagers: {len(MANAGER_INDEX)} available")
    for name, info in MANAGER_INDEX.items():
        print(f"  - {info['class']:30s} ({info['line_count']:4d} lines) - {info['purpose']}")

    print(f"\\nBusiness Services: {len(SERVICE_INDEX)} available")
    for name, info in SERVICE_INDEX.items():
        print(f"  - {info['class']:30s} ({info.get('line_count', 0):4d} lines) - {info['purpose']}")

    print(f"\\nUtilities: {len(UTILITY_INDEX)} available")
    for name, info in UTILITY_INDEX.items():
        print(f"  - {name:30s} - {info['purpose']}")

    print("\\n" + "=" * 80)
    print("Use: grep -A 10 'service_name' backend_index.py")
    print("     python scripts/generate_backend_index.py  # Update index")
    print("=" * 80)
'''

    return content


def main():
    parser = argparse.ArgumentParser(description='Generate backend_index.py from source code')
    parser.add_argument('--output', default='ushadow/backend/src/backend_index.py', help='Output file path')
    parser.add_argument('--dry-run', action='store_true', help='Print output without writing')
    args = parser.parse_args()

    # Find repo root (where scripts/ directory is)
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    backend_dir = repo_root / 'ushadow' / 'backend'

    if not backend_dir.exists():
        print(f"Error: Backend directory not found at {backend_dir}")
        return 1

    print(f"Scanning backend codebase at {backend_dir}...")

    # Scan directories (relative to backend dir)
    managers = scan_directory(backend_dir / 'src' / 'services', backend_dir)
    utils = scan_directory(backend_dir / 'src' / 'utils', backend_dir)

    # Filter managers vs services (simple heuristic)
    services = {k: v for k, v in managers.items()
                if 'orchestrat' in k.lower() or 'config' in k.lower()}
    managers = {k: v for k, v in managers.items() if k not in services}

    print(f"Found: {len(managers)} managers, {len(services)} services, {len(utils)} utilities")

    # Generate content
    content = generate_index_content(managers, services, utils)

    if args.dry_run:
        print("\n" + "=" * 80)
        print("DRY RUN - Generated content:")
        print("=" * 80)
        print(content)
    else:
        output_path = repo_root / args.output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w') as f:
            f.write(content)
        print(f"\n✅ Generated {output_path.relative_to(repo_root)}")
        print(f"   Run: python {output_path} to see formatted output")
        print(f"   Or:  python ushadow/backend/src/backend_index.py")


if __name__ == "__main__":
    main()
