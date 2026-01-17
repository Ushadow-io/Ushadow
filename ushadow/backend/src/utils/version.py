"""Version utility to read version from pyproject.toml"""
import os
from pathlib import Path


def get_version() -> str:
    """
    Read version from pyproject.toml.
    Searches up the directory tree from this file to find pyproject.toml.

    Returns:
        Version string (e.g., "0.1.0")
    """
    # Start from current file and search up
    current_path = Path(__file__).resolve()

    # Search up the directory tree for pyproject.toml
    for parent in [current_path.parent] + list(current_path.parents):
        pyproject_path = parent / "pyproject.toml"
        if pyproject_path.exists():
            try:
                with open(pyproject_path, 'r') as f:
                    for line in f:
                        if line.startswith('version = '):
                            # Extract version from: version = "0.1.0"
                            version = line.split('=')[1].strip().strip('"')
                            return version
            except Exception:
                continue

    # Fallback to hardcoded version if pyproject.toml not found
    return "0.1.0"


# Cache the version at module load time
VERSION = get_version()
