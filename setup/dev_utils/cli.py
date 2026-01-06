#!/usr/bin/env python3
"""
CLI for ushadow development environment management.

Usage:
    ushadow-dev list                    # List all environments
    ushadow-dev create <name>           # Create new environment
    ushadow-dev start <name>            # Start environment
    ushadow-dev stop <name>             # Stop environment
    ushadow-dev open <name>             # Open in VS Code
    ushadow-dev remove <name>           # Remove environment
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from setup.dev_utils.environment import EnvironmentManager, EnvironmentStatus


# ANSI color codes
class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GRAY = "\033[90m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def status_color(status: EnvironmentStatus) -> str:
    """Get color for a status."""
    return {
        EnvironmentStatus.RUNNING: Colors.GREEN,
        EnvironmentStatus.PARTIAL: Colors.YELLOW,
        EnvironmentStatus.STOPPED: Colors.GRAY,
        EnvironmentStatus.AVAILABLE: Colors.BLUE,
        EnvironmentStatus.ERROR: Colors.RED,
    }.get(status, Colors.RESET)


def cmd_list(args, manager: EnvironmentManager) -> int:
    """List all environments."""
    environments = manager.list_environments()

    if not environments:
        print("No environments found.")
        print(f"\nCreate one with: ushadow-dev create <name>")
        return 0

    print(f"\n{Colors.BOLD}=== ushadow Environments ==={Colors.RESET}\n")

    for env in environments:
        color = status_color(env.status)
        status_str = f"[{env.status.value}]"

        # Build info line
        info_parts = []
        if env.frontend_url and env.status == EnvironmentStatus.RUNNING:
            info_parts.append(env.frontend_url)
        if env.branch:
            info_parts.append(f"branch: {env.branch}")

        info_str = f"  {Colors.GRAY}{' | '.join(info_parts)}{Colors.RESET}" if info_parts else ""

        print(f"  {Colors.BOLD}{env.name:15}{Colors.RESET} {color}{status_str:12}{Colors.RESET}{info_str}")

    print()
    return 0


def cmd_create(args, manager: EnvironmentManager) -> int:
    """Create a new environment."""
    name = args.name
    base_branch = args.branch or "main"

    print(f"Creating environment '{name}' from branch '{base_branch}'...")

    try:
        env = manager.create_environment(
            name=name,
            base_branch=base_branch,
            setup_vscode=not args.no_colors,
            open_vscode=args.open,
            start=args.start,
        )
        print(f"{Colors.GREEN}Created environment '{name}'{Colors.RESET}")
        print(f"  Path: {env.path}")
        print(f"  Branch: {env.branch}")

        if args.start:
            print(f"  Frontend: {env.frontend_url}")

        return 0
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.RESET}")
        return 1


def cmd_start(args, manager: EnvironmentManager) -> int:
    """Start an environment."""
    name = args.name

    env = manager.get_environment(name)
    if not env:
        print(f"{Colors.RED}Environment '{name}' not found{Colors.RESET}")
        return 1

    print(f"Starting environment '{name}'...")

    try:
        manager.start_environment(name, build=args.build)
        print(f"{Colors.GREEN}Started '{name}'{Colors.RESET}")

        # Refresh to get updated URLs
        env = manager.get_environment(name)
        if env and env.frontend_url:
            print(f"  Frontend: {env.frontend_url}")
            print(f"  Backend:  {env.backend_url}")

        return 0
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.RESET}")
        return 1


def cmd_stop(args, manager: EnvironmentManager) -> int:
    """Stop an environment."""
    name = args.name

    env = manager.get_environment(name)
    if not env:
        print(f"{Colors.RED}Environment '{name}' not found{Colors.RESET}")
        return 1

    print(f"Stopping environment '{name}'...")

    try:
        manager.stop_environment(name)
        print(f"{Colors.GREEN}Stopped '{name}'{Colors.RESET}")
        return 0
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.RESET}")
        return 1


def cmd_open(args, manager: EnvironmentManager) -> int:
    """Open an environment in VS Code."""
    name = args.name

    env = manager.get_environment(name)
    if not env:
        print(f"{Colors.RED}Environment '{name}' not found{Colors.RESET}")
        return 1

    print(f"Opening '{name}' in VS Code...")

    try:
        manager.open_in_vscode(name)
        return 0
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.RESET}")
        return 1


def cmd_remove(args, manager: EnvironmentManager) -> int:
    """Remove an environment."""
    name = args.name

    env = manager.get_environment(name)
    if not env:
        print(f"{Colors.RED}Environment '{name}' not found{Colors.RESET}")
        return 1

    if not args.force:
        response = input(f"Remove environment '{name}'? This will delete the worktree. [y/N] ")
        if response.lower() != "y":
            print("Cancelled.")
            return 0

    print(f"Removing environment '{name}'...")

    try:
        manager.remove_environment(name, force=args.force)
        print(f"{Colors.GREEN}Removed '{name}'{Colors.RESET}")
        return 0
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.RESET}")
        return 1


def main():
    parser = argparse.ArgumentParser(
        description="ushadow development environment manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s list                     List all environments
  %(prog)s create purple            Create 'purple' environment
  %(prog)s create gold --start      Create and start environment
  %(prog)s start gold               Start existing environment
  %(prog)s stop gold                Stop environment
  %(prog)s open gold                Open in VS Code
  %(prog)s remove gold              Remove environment
        """,
    )

    parser.add_argument(
        "--repo",
        type=Path,
        help="Path to main git repository",
    )
    parser.add_argument(
        "--worktrees",
        type=Path,
        help="Path to worktrees directory",
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # list
    list_parser = subparsers.add_parser("list", aliases=["ls"], help="List environments")
    list_parser.set_defaults(func=cmd_list)

    # create
    create_parser = subparsers.add_parser("create", aliases=["new"], help="Create environment")
    create_parser.add_argument("name", help="Environment name")
    create_parser.add_argument("-b", "--branch", help="Base branch (default: main)")
    create_parser.add_argument("--start", action="store_true", help="Start after creation")
    create_parser.add_argument("--open", action="store_true", help="Open VS Code after creation")
    create_parser.add_argument("--no-colors", action="store_true", help="Skip VS Code color setup")
    create_parser.set_defaults(func=cmd_create)

    # start
    start_parser = subparsers.add_parser("start", aliases=["up"], help="Start environment")
    start_parser.add_argument("name", help="Environment name")
    start_parser.add_argument("--build", action="store_true", help="Rebuild containers")
    start_parser.set_defaults(func=cmd_start)

    # stop
    stop_parser = subparsers.add_parser("stop", aliases=["down"], help="Stop environment")
    stop_parser.add_argument("name", help="Environment name")
    stop_parser.set_defaults(func=cmd_stop)

    # open
    open_parser = subparsers.add_parser("open", aliases=["code"], help="Open in VS Code")
    open_parser.add_argument("name", help="Environment name")
    open_parser.set_defaults(func=cmd_open)

    # remove
    remove_parser = subparsers.add_parser("remove", aliases=["rm"], help="Remove environment")
    remove_parser.add_argument("name", help="Environment name")
    remove_parser.add_argument("-f", "--force", action="store_true", help="Force removal")
    remove_parser.set_defaults(func=cmd_remove)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    # Initialize manager
    manager = EnvironmentManager(
        main_repo=args.repo,
        worktrees_dir=args.worktrees,
    )

    return args.func(args, manager)


if __name__ == "__main__":
    sys.exit(main())
