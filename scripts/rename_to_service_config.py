#!/usr/bin/env python3
"""
Rename Instance → ServiceConfig across the entire codebase.

This script performs a systematic renaming:
- Instance → ServiceConfig
- InstanceManager → ServiceConfigManager
- instances.yaml → service_configs.yaml
- /api/instances → /api/svc-configs
- All related variable names and field names

Usage:
    python scripts/rename_to_service_config.py [--dry-run] [--backup]

Options:
    --dry-run    Show what would be changed without making changes
    --backup     Create .bak files before modifying
"""

import os
import re
import argparse
import shutil
from pathlib import Path
from typing import List, Tuple, Dict

# Root directory
ROOT = Path(__file__).parent.parent

# Renaming rules (order matters - more specific first!)
RENAMES = [
    # Models and classes
    ("InstanceManager", "ServiceConfigManager"),
    ("InstanceStatus", "ServiceConfigStatus"),
    ("InstanceConfig", "ConfigValues"),
    ("InstanceOutputs", "ServiceOutputs"),
    ("InstanceCreate", "ServiceConfigCreate"),
    ("InstanceUpdate", "ServiceConfigUpdate"),
    ("InstanceSummary", "ServiceConfigSummary"),
    ("Instance", "ServiceConfig"),  # Must be last (most generic)

    # Wiring field names
    ("source_instance_id", "source_config_id"),
    ("target_instance_id", "target_config_id"),

    # Variables and parameters
    ("instance_id", "config_id"),
    ("instances_api", "svc_configs_api"),
    ("instancesApi", "svcConfigsApi"),
    ("consumer_instance_id", "consumer_config_id"),
    ("provider_instance", "provider_config"),
    ("instance_configs", "service_configs"),
    ("_instances", "_service_configs"),

    # Files and paths
    ("instances.yaml", "service_configs.yaml"),
    ("instance.py", "service_config.py"),
    ("instance_manager.py", "service_config_manager.py"),

    # API paths (be careful with these)
    ("/api/instances", "/api/svc-configs"),
    ("InstancesPage", "ServiceConfigsPage"),

    # Comments and docstrings
    ("instance of a template", "service configuration of a template"),
    ("An instance", "A service config"),
    ("the instance", "the service config"),
]

# Files to exclude from renaming
EXCLUDE_PATTERNS = [
    "*.pyc",
    "__pycache__",
    "node_modules",
    ".git",
    "*.bak",
    ".env",
    ".venv",
    "venv",
    "REFACTORING_PLAN.md",
    "UNIFIED_CONFIG_ARCHITECTURE.md",
    "ARCHITECTURE_OVERVIEW.md",
    "rename_to_service_config.py",  # This script itself!
]

# File extensions to process
INCLUDE_EXTENSIONS = [
    ".py",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
    ".md",
    ".json",
]


def should_process_file(file_path: Path) -> bool:
    """Check if file should be processed."""
    # Check extension
    if file_path.suffix not in INCLUDE_EXTENSIONS:
        return False

    # Check exclude patterns
    for pattern in EXCLUDE_PATTERNS:
        if pattern in str(file_path):
            return False

    return True


def find_files_to_process() -> List[Path]:
    """Find all files that should be processed."""
    files = []

    # Backend Python files
    backend_dir = ROOT / "ushadow" / "backend" / "src"
    if backend_dir.exists():
        for file_path in backend_dir.rglob("*"):
            if file_path.is_file() and should_process_file(file_path):
                files.append(file_path)

    # Frontend TypeScript files
    frontend_dir = ROOT / "ushadow" / "frontend" / "src"
    if frontend_dir.exists():
        for file_path in frontend_dir.rglob("*"):
            if file_path.is_file() and should_process_file(file_path):
                files.append(file_path)

    # Config files
    config_dir = ROOT / "config"
    if config_dir.exists():
        for file_path in config_dir.rglob("*.yaml"):
            if file_path.is_file() and should_process_file(file_path):
                files.append(file_path)
        for file_path in config_dir.rglob("*.yml"):
            if file_path.is_file() and should_process_file(file_path):
                files.append(file_path)

    return files


def apply_renames_to_content(content: str) -> Tuple[str, int]:
    """Apply all rename rules to content. Returns (new_content, num_changes)."""
    new_content = content
    total_changes = 0

    for old, new in RENAMES:
        # Count occurrences
        count = new_content.count(old)
        if count > 0:
            new_content = new_content.replace(old, new)
            total_changes += count

    return new_content, total_changes


def process_file(file_path: Path, dry_run: bool = False, backup: bool = False) -> Dict:
    """Process a single file. Returns dict with stats."""
    result = {
        "path": str(file_path),
        "changes": 0,
        "error": None,
    }

    try:
        # Read file
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        # Apply renames
        new_content, num_changes = apply_renames_to_content(original_content)

        result["changes"] = num_changes

        # If no changes, skip
        if num_changes == 0:
            return result

        # If dry run, just report
        if dry_run:
            return result

        # Create backup if requested
        if backup:
            backup_path = file_path.with_suffix(file_path.suffix + '.bak')
            shutil.copy2(file_path, backup_path)

        # Write changes
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

    except Exception as e:
        result["error"] = str(e)

    return result


def rename_files(dry_run: bool = False) -> List[Tuple[Path, Path]]:
    """Rename files themselves. Returns list of (old_path, new_path) tuples."""
    renames = []

    # Find files to rename
    for old_pattern, new_pattern in RENAMES:
        if not old_pattern.endswith('.py') and not old_pattern.endswith('.yaml'):
            continue

        # Find all files matching old pattern
        for root, dirs, files in os.walk(ROOT):
            # Skip excluded directories
            if any(excl in root for excl in EXCLUDE_PATTERNS):
                continue

            for filename in files:
                if old_pattern in filename:
                    old_path = Path(root) / filename
                    new_filename = filename.replace(old_pattern, new_pattern)
                    new_path = Path(root) / new_filename

                    if old_path.exists():
                        renames.append((old_path, new_path))

    # Perform renames
    if not dry_run:
        for old_path, new_path in renames:
            print(f"  Renaming: {old_path.name} → {new_path.name}")
            old_path.rename(new_path)

    return renames


def main():
    parser = argparse.ArgumentParser(description="Rename Instance → ServiceConfig")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without applying")
    parser.add_argument("--backup", action="store_true", help="Create .bak files")
    args = parser.parse_args()

    print("=" * 80)
    print("Instance → ServiceConfig Renaming Script")
    print("=" * 80)

    if args.dry_run:
        print("\n[DRY RUN MODE - No changes will be made]\n")

    # Find files to process
    print("\n1. Finding files to process...")
    files = find_files_to_process()
    print(f"   Found {len(files)} files to process")

    # Process content
    print("\n2. Processing file contents...")
    results = []
    total_changes = 0

    for file_path in files:
        result = process_file(file_path, dry_run=args.dry_run, backup=args.backup)
        if result["changes"] > 0 or result["error"]:
            results.append(result)
            total_changes += result["changes"]

    # Report changes
    print(f"\n   Files with changes: {len([r for r in results if r['changes'] > 0])}")
    print(f"   Total changes: {total_changes}")

    # Show files with most changes
    if results:
        print("\n   Top files by number of changes:")
        sorted_results = sorted(results, key=lambda r: r["changes"], reverse=True)
        for result in sorted_results[:10]:
            if result["changes"] > 0:
                path = Path(result["path"]).relative_to(ROOT)
                print(f"     {result['changes']:4d} changes - {path}")

    # Report errors
    errors = [r for r in results if r["error"]]
    if errors:
        print(f"\n   ⚠️  Errors: {len(errors)}")
        for result in errors:
            path = Path(result["path"]).relative_to(ROOT)
            print(f"     {path}: {result['error']}")

    # Rename files themselves
    print("\n3. Renaming files...")
    file_renames = rename_files(dry_run=args.dry_run)
    print(f"   Files renamed: {len(file_renames)}")

    if file_renames:
        print("\n   Renamed files:")
        for old_path, new_path in file_renames:
            old_rel = old_path.relative_to(ROOT)
            new_rel = new_path.relative_to(ROOT)
            print(f"     {old_rel}")
            print(f"  → {new_rel}")

    # Summary
    print("\n" + "=" * 80)
    print("Summary")
    print("=" * 80)
    print(f"Files processed: {len(files)}")
    print(f"Files changed: {len([r for r in results if r['changes'] > 0])}")
    print(f"Total changes: {total_changes}")
    print(f"Files renamed: {len(file_renames)}")
    print(f"Errors: {len(errors)}")

    if args.dry_run:
        print("\n[DRY RUN - No actual changes made]")
        print("Run without --dry-run to apply changes")
    else:
        print("\n✅ Renaming complete!")
        if args.backup:
            print("   Backup files (.bak) created")
        print("\nNext steps:")
        print("1. Test the backend: docker restart ushadow-purple-backend")
        print("2. Test the frontend: npm run dev")
        print("3. Check for any import errors")
        print("4. Run tests")

    print("=" * 80)


if __name__ == "__main__":
    main()
