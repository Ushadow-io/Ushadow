#!/usr/bin/env python3
"""
Validate and clean a kubeconfig file before uploading to ushadow.

Usage:
    python3 scripts/validate-kubeconfig.py kubeconfig.yaml
    python3 scripts/validate-kubeconfig.py kubeconfig.yaml --clean -o kubeconfig-clean.yaml
"""

import argparse
import sys
import yaml
from pathlib import Path


def check_tabs(content: str) -> bool:
    """Check if file contains tab characters."""
    if '\t' in content:
        lines_with_tabs = []
        for i, line in enumerate(content.split('\n'), 1):
            if '\t' in line:
                lines_with_tabs.append(i)
        print(f"❌ Found tab characters on lines: {', '.join(map(str, lines_with_tabs))}")
        print("   YAML requires spaces, not tabs for indentation")
        return False
    return True


def check_line_endings(content: str) -> bool:
    """Check for Windows line endings."""
    if '\r\n' in content:
        print("⚠️  Found Windows line endings (CRLF)")
        print("   Consider converting to Unix line endings (LF)")
        return False
    return True


def validate_yaml_syntax(content: str) -> bool:
    """Validate YAML syntax."""
    try:
        yaml.safe_load(content)
        print("✅ Valid YAML syntax")
        return True
    except yaml.YAMLError as e:
        print(f"❌ Invalid YAML syntax:")
        print(f"   {e}")
        if hasattr(e, 'problem_mark'):
            mark = e.problem_mark
            print(f"   Error at line {mark.line + 1}, column {mark.column + 1}")
        return False


def validate_kubeconfig_structure(content: str) -> bool:
    """Validate kubeconfig has required fields."""
    try:
        config = yaml.safe_load(content)

        if not isinstance(config, dict):
            print("❌ Kubeconfig must be a YAML dictionary")
            return False

        required_fields = ['clusters', 'contexts', 'users']
        missing = [f for f in required_fields if f not in config]

        if missing:
            print(f"❌ Missing required fields: {', '.join(missing)}")
            return False

        if not config.get('clusters'):
            print("❌ No clusters defined")
            return False

        if not config.get('contexts'):
            print("❌ No contexts defined")
            return False

        print(f"✅ Valid kubeconfig structure")
        print(f"   Clusters: {len(config['clusters'])}")
        print(f"   Contexts: {len(config['contexts'])}")
        print(f"   Users: {len(config['users'])}")

        if 'current-context' in config:
            print(f"   Current context: {config['current-context']}")

        return True

    except yaml.YAMLError:
        # Already reported by validate_yaml_syntax
        return False


def clean_kubeconfig(content: str) -> str:
    """Clean kubeconfig by fixing common issues."""
    # Replace tabs with 2 spaces
    content = content.replace('\t', '  ')

    # Convert Windows line endings to Unix
    content = content.replace('\r\n', '\n')

    # Remove trailing whitespace
    lines = content.split('\n')
    lines = [line.rstrip() for line in lines]
    content = '\n'.join(lines)

    return content


def main():
    parser = argparse.ArgumentParser(
        description='Validate and clean kubeconfig files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Validate a kubeconfig
  python3 scripts/validate-kubeconfig.py ~/.kube/config

  # Clean and save to new file
  python3 scripts/validate-kubeconfig.py kubeconfig.yaml --clean -o kubeconfig-clean.yaml

  # Clean in-place
  python3 scripts/validate-kubeconfig.py kubeconfig.yaml --clean --in-place
        """
    )
    parser.add_argument('kubeconfig', help='Path to kubeconfig file')
    parser.add_argument('--clean', action='store_true', help='Clean common issues (tabs, line endings)')
    parser.add_argument('-o', '--output', help='Output file for cleaned kubeconfig')
    parser.add_argument('--in-place', action='store_true', help='Modify file in-place')

    args = parser.parse_args()

    # Check file exists
    kubeconfig_path = Path(args.kubeconfig)
    if not kubeconfig_path.exists():
        print(f"❌ File not found: {args.kubeconfig}")
        sys.exit(1)

    # Read file
    try:
        content = kubeconfig_path.read_text()
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        sys.exit(1)

    print(f"📄 Validating: {args.kubeconfig}")
    print("=" * 60)

    # Run validations
    checks = {
        'tabs': check_tabs(content),
        'line_endings': check_line_endings(content),
        'yaml_syntax': validate_yaml_syntax(content),
        'kubeconfig_structure': False  # Will be set below
    }

    # Only check structure if YAML is valid
    if checks['yaml_syntax']:
        checks['kubeconfig_structure'] = validate_kubeconfig_structure(content)

    print("=" * 60)

    # Summary
    passed = sum(checks.values())
    total = len(checks)

    if passed == total:
        print(f"✅ All checks passed ({passed}/{total})")
        print("\n✅ Kubeconfig is ready to upload to ushadow")
        sys.exit(0)
    else:
        print(f"⚠️  {passed}/{total} checks passed")

        # Offer to clean if requested
        if args.clean:
            print("\n🧹 Cleaning kubeconfig...")
            cleaned_content = clean_kubeconfig(content)

            # Validate cleaned content
            print("\n📄 Validating cleaned kubeconfig...")
            print("=" * 60)
            checks_after = {
                'tabs': check_tabs(cleaned_content),
                'line_endings': check_line_endings(cleaned_content),
                'yaml_syntax': validate_yaml_syntax(cleaned_content),
                'kubeconfig_structure': False
            }

            if checks_after['yaml_syntax']:
                checks_after['kubeconfig_structure'] = validate_kubeconfig_structure(cleaned_content)

            print("=" * 60)

            passed_after = sum(checks_after.values())
            if passed_after == total:
                print(f"✅ All checks passed after cleaning ({passed_after}/{total})")

                # Save cleaned version
                if args.in_place:
                    kubeconfig_path.write_text(cleaned_content)
                    print(f"\n✅ Cleaned kubeconfig saved to: {args.kubeconfig}")
                elif args.output:
                    output_path = Path(args.output)
                    output_path.write_text(cleaned_content)
                    print(f"\n✅ Cleaned kubeconfig saved to: {args.output}")
                else:
                    print("\n✅ Cleaned kubeconfig (use -o to save):")
                    print(cleaned_content)

                sys.exit(0)
            else:
                print(f"⚠️  Still have issues after cleaning ({passed_after}/{total})")
                print("\nManual fixes may be required. Common issues:")
                print("  - Missing colons after keys")
                print("  - Incorrect indentation")
                print("  - Invalid certificate data")
                sys.exit(1)
        else:
            print("\n💡 Run with --clean to automatically fix common issues:")
            print(f"   python3 scripts/validate-kubeconfig.py {args.kubeconfig} --clean -o kubeconfig-clean.yaml")
            sys.exit(1)


if __name__ == '__main__':
    main()
