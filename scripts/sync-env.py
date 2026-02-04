#!/usr/bin/env python3
"""
Sync .env with .env.example

Finds missing variables in .env that exist in .env.example and optionally
appends them with their default values.

Usage:
    uv run scripts/sync-env.py          # Show diff only
    uv run scripts/sync-env.py --apply  # Apply missing variables
    uv run scripts/sync-env.py --dry-run # Show what would be added
"""

import argparse
import re
import sys
from pathlib import Path


def parse_env_file(path: Path) -> tuple[dict[str, str], dict[str, str], list[str]]:
    """
    Parse .env file and return:
    - active_vars: dict of VAR=value (uncommented)
    - commented_vars: dict of VAR=value (commented, for reference)
    - lines: original lines for context preservation
    """
    active_vars = {}
    commented_vars = {}
    lines = []

    if not path.exists():
        return active_vars, commented_vars, lines

    content = path.read_text()
    lines = content.splitlines()

    for line in lines:
        stripped = line.strip()

        # Skip empty lines and section headers
        if not stripped or stripped.startswith("# ="):
            continue

        # Commented variable (# VAR=value)
        match = re.match(r"^#\s*([A-Z][A-Z0-9_]*)=(.*)$", stripped)
        if match:
            var_name, value = match.groups()
            commented_vars[var_name] = value.split("#")[0].strip()  # Remove inline comments
            continue

        # Active variable (VAR=value)
        match = re.match(r"^([A-Z][A-Z0-9_]*)=(.*)$", stripped)
        if match:
            var_name, value = match.groups()
            active_vars[var_name] = value.split("#")[0].strip()
            continue

    return active_vars, commented_vars, lines


def get_section_for_var(example_lines: list[str], var_name: str) -> str | None:
    """Find the section header for a variable in .env.example."""
    current_section = None

    for line in example_lines:
        stripped = line.strip()
        if stripped.startswith("# =") and stripped.endswith("="):
            # This is a section separator, next non-empty comment is section name
            continue
        elif stripped.startswith("# ") and not stripped.startswith("# ="):
            # Potential section name or comment
            text = stripped[2:].strip()
            if text.isupper() or (text.endswith(":") and len(text) < 50):
                current_section = text
        elif re.match(rf"^#?\s*{re.escape(var_name)}=", stripped):
            return current_section

    return None


def extract_missing_blocks(
    example_lines: list[str],
    env_active: dict[str, str],
    env_commented: dict[str, str],
) -> list[tuple[str, list[str]]]:
    """
    Extract blocks of missing variables from .env.example, preserving context.
    Returns list of (section_name, lines) tuples.
    """
    all_env_vars = set(env_active.keys()) | set(env_commented.keys())
    missing_blocks = []
    current_section = None
    current_block_lines = []
    in_missing_block = False

    for i, line in enumerate(example_lines):
        stripped = line.strip()

        # Section header detection
        if stripped.startswith("# ="):
            # Save previous block if we were in one
            if in_missing_block and current_block_lines:
                missing_blocks.append((current_section, current_block_lines.copy()))
                current_block_lines = []
                in_missing_block = False
            continue

        # Section name (line after ===)
        if stripped.startswith("# ") and not "=" in stripped:
            text = stripped[2:].strip()
            if text.isupper() or text.endswith(":"):
                if in_missing_block and current_block_lines:
                    missing_blocks.append((current_section, current_block_lines.copy()))
                    current_block_lines = []
                    in_missing_block = False
                current_section = text
                continue

        # Check if this line has a variable
        var_match = re.match(r"^#?\s*([A-Z][A-Z0-9_]*)=", stripped)
        if var_match:
            var_name = var_match.group(1)
            if var_name not in all_env_vars:
                # This variable is missing
                if not in_missing_block:
                    in_missing_block = True
                    # Add section header if starting new block
                    if current_section and not any(
                        current_section == s for s, _ in missing_blocks
                    ):
                        current_block_lines.append(f"\n# {'=' * 42}")
                        current_block_lines.append(f"# {current_section}")
                        current_block_lines.append(f"# {'=' * 42}")
                current_block_lines.append(line)
            else:
                # Variable exists, end block if we were in one
                if in_missing_block and current_block_lines:
                    missing_blocks.append((current_section, current_block_lines.copy()))
                    current_block_lines = []
                    in_missing_block = False
        elif in_missing_block and stripped.startswith("#"):
            # Comment line within a missing block - include it
            current_block_lines.append(line)

    # Don't forget the last block
    if in_missing_block and current_block_lines:
        missing_blocks.append((current_section, current_block_lines.copy()))

    return missing_blocks


def main():
    parser = argparse.ArgumentParser(
        description="Sync .env with .env.example",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  uv run scripts/sync-env.py              # Show missing variables
  uv run scripts/sync-env.py --apply      # Add missing variables to .env
  uv run scripts/sync-env.py --dry-run    # Show what would be added
        """,
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply missing variables to .env",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be added (without modifying .env)",
    )
    parser.add_argument(
        "--example",
        type=Path,
        default=Path(".env.example"),
        help="Path to .env.example (default: .env.example)",
    )
    parser.add_argument(
        "--env",
        type=Path,
        default=Path(".env"),
        help="Path to .env (default: .env)",
    )
    args = parser.parse_args()

    # Find project root (where .env.example is)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    example_path = project_root / args.example if not args.example.is_absolute() else args.example
    env_path = project_root / args.env if not args.env.is_absolute() else args.env

    if not example_path.exists():
        print(f"❌ {example_path} not found")
        sys.exit(1)

    if not env_path.exists():
        print(f"❌ {env_path} not found")
        print(f"   Run: cp {example_path} {env_path}")
        sys.exit(1)

    # Parse both files
    example_active, example_commented, example_lines = parse_env_file(example_path)
    env_active, env_commented, env_lines = parse_env_file(env_path)

    all_example_vars = set(example_active.keys()) | set(example_commented.keys())
    all_env_vars = set(env_active.keys()) | set(env_commented.keys())

    missing_vars = all_example_vars - all_env_vars
    extra_vars = all_env_vars - all_example_vars

    # Summary
    print(f"📋 Environment Sync Check")
    print(f"   Example: {example_path}")
    print(f"   Env:     {env_path}")
    print()

    if not missing_vars:
        print("✅ .env is in sync with .env.example")
        if extra_vars:
            print(f"\n📝 Extra variables in .env (not in .env.example):")
            for var in sorted(extra_vars):
                print(f"   - {var}")
        return

    print(f"⚠️  Missing {len(missing_vars)} variable(s) in .env:")
    for var in sorted(missing_vars):
        if var in example_active:
            print(f"   + {var}={example_active[var]}")
        else:
            print(f"   + # {var}={example_commented[var]} (commented)")

    if extra_vars:
        print(f"\n📝 Extra variables in .env (not in .env.example):")
        for var in sorted(extra_vars):
            print(f"   - {var}")

    # Extract missing blocks with context
    missing_blocks = extract_missing_blocks(example_lines, env_active, env_commented)

    if args.dry_run or args.apply:
        print("\n" + "=" * 50)
        print("Lines to be added to .env:")
        print("=" * 50)

        lines_to_add = []
        for section, lines in missing_blocks:
            for line in lines:
                lines_to_add.append(line)
                print(line)

        if args.apply:
            # Append to .env
            with open(env_path, "a") as f:
                f.write("\n")  # Ensure newline before new content
                for line in lines_to_add:
                    f.write(line + "\n")
            print("\n✅ Added missing variables to .env")
        else:
            print(f"\n💡 Run with --apply to add these to {env_path}")
    else:
        print(f"\n💡 Run with --dry-run to see what would be added")
        print(f"   Run with --apply to add missing variables to .env")


if __name__ == "__main__":
    main()
