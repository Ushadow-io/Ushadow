"""
Git worktree management for ushadow development environments.

Adapted from the shell-based w() function to provide Python API
for worktree operations that can be used by both CLI and GUI.
"""

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from setup.vscode_utils.colors import setup_colors_for_directory


@dataclass
class WorktreeInfo:
    """Information about a git worktree."""
    path: Path
    branch: str
    commit: str
    is_bare: bool = False
    is_detached: bool = False

    @property
    def name(self) -> str:
        """Get the worktree name (directory name)."""
        return self.path.name


class WorktreeManager:
    """
    Manages git worktrees for a project.

    Default directory structure:
        ~/repos/
        ├── ushadow/              (main git repo)
        └── worktrees/
            └── ushadow/
                ├── gold/         (worktree, branch: stu/gold)
                └── pink/         (worktree, branch: stu/pink)
    """

    def __init__(
        self,
        main_repo: Path | str | None = None,
        worktrees_dir: Path | str | None = None,
        project_name: str = "ushadow",
        branch_prefix: str | None = None,
    ):
        """
        Initialize the worktree manager.

        Args:
            main_repo: Path to the main git repository.
                       Defaults to ~/repos/{project_name}
            worktrees_dir: Directory where worktrees are created.
                          Defaults to ~/repos/worktrees/{project_name}
            project_name: Name of the project (used for defaults)
            branch_prefix: Prefix for new branches (defaults to $USER/)
        """
        home = Path.home()

        if main_repo is None:
            main_repo = home / "repos" / project_name
        self.main_repo = Path(main_repo)

        if worktrees_dir is None:
            worktrees_dir = home / "repos" / "worktrees" / project_name
        self.worktrees_dir = Path(worktrees_dir)

        self.project_name = project_name
        self.branch_prefix = branch_prefix or f"{os.environ.get('USER', 'dev')}/"

    def list_worktrees(self) -> list[WorktreeInfo]:
        """
        List all worktrees for this project.

        Returns:
            List of WorktreeInfo objects
        """
        if not self.main_repo.exists():
            return []

        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=self.main_repo,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return []

        worktrees = []
        current = {}

        for line in result.stdout.strip().split("\n"):
            if not line:
                if current:
                    worktrees.append(WorktreeInfo(
                        path=Path(current.get("worktree", "")),
                        branch=current.get("branch", "").replace("refs/heads/", ""),
                        commit=current.get("HEAD", ""),
                        is_bare=current.get("bare", False),
                        is_detached=current.get("detached", False),
                    ))
                    current = {}
            elif line.startswith("worktree "):
                current["worktree"] = line[9:]
            elif line.startswith("HEAD "):
                current["HEAD"] = line[5:]
            elif line.startswith("branch "):
                current["branch"] = line[7:]
            elif line == "bare":
                current["bare"] = True
            elif line == "detached":
                current["detached"] = True

        # Don't forget the last one
        if current:
            worktrees.append(WorktreeInfo(
                path=Path(current.get("worktree", "")),
                branch=current.get("branch", "").replace("refs/heads/", ""),
                commit=current.get("HEAD", ""),
                is_bare=current.get("bare", False),
                is_detached=current.get("detached", False),
            ))

        return worktrees

    def get_worktree(self, name: str) -> Optional[WorktreeInfo]:
        """
        Get a specific worktree by name.

        Args:
            name: Worktree directory name

        Returns:
            WorktreeInfo if found, None otherwise
        """
        for wt in self.list_worktrees():
            if wt.name == name:
                return wt
        return None

    def worktree_exists(self, name: str) -> bool:
        """Check if a worktree exists."""
        return self.get_worktree(name) is not None

    def create_worktree(
        self,
        name: str,
        base_branch: str = "main",
        setup_vscode_colors: bool = True,
        open_vscode: bool = False,
    ) -> WorktreeInfo:
        """
        Create a new worktree.

        Args:
            name: Name for the worktree directory
            base_branch: Branch to base the new worktree on
            setup_vscode_colors: Whether to set up VS Code colors
            open_vscode: Whether to open VS Code after creation

        Returns:
            WorktreeInfo for the created worktree

        Raises:
            ValueError: If worktree already exists
            subprocess.CalledProcessError: If git command fails
        """
        if self.worktree_exists(name):
            raise ValueError(f"Worktree '{name}' already exists")

        # Ensure worktrees directory exists
        self.worktrees_dir.mkdir(parents=True, exist_ok=True)

        worktree_path = self.worktrees_dir / name
        branch_name = f"{self.branch_prefix}{name}"

        # Create the worktree with a new branch
        subprocess.run(
            ["git", "worktree", "add", str(worktree_path), "-b", branch_name, base_branch],
            cwd=self.main_repo,
            check=True,
        )

        # Set up VS Code colors based on worktree name
        if setup_vscode_colors:
            setup_colors_for_directory(worktree_path, name)

        # Open in VS Code if requested
        if open_vscode:
            self.open_in_vscode(name)

        return self.get_worktree(name)

    def remove_worktree(self, name: str, force: bool = False) -> None:
        """
        Remove a worktree.

        Args:
            name: Name of the worktree to remove
            force: Force removal even if there are changes

        Raises:
            ValueError: If worktree doesn't exist
            subprocess.CalledProcessError: If git command fails
        """
        wt = self.get_worktree(name)
        if not wt:
            raise ValueError(f"Worktree '{name}' not found")

        cmd = ["git", "worktree", "remove"]
        if force:
            cmd.append("--force")
        cmd.append(str(wt.path))

        subprocess.run(cmd, cwd=self.main_repo, check=True)

    def open_in_vscode(self, name: str) -> None:
        """
        Open a worktree in VS Code.

        Args:
            name: Name of the worktree to open

        Raises:
            ValueError: If worktree doesn't exist
        """
        wt = self.get_worktree(name)
        if not wt:
            raise ValueError(f"Worktree '{name}' not found")

        subprocess.run(["code", str(wt.path)], check=True)

    def get_worktree_path(self, name: str) -> Optional[Path]:
        """Get the path to a worktree by name."""
        wt = self.get_worktree(name)
        return wt.path if wt else None
