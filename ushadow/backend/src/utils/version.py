"""Version utility to read version from package metadata"""
import importlib.metadata
from pathlib import Path


def get_version() -> str:
    """
    Get application version using importlib.metadata.
    Falls back to reading pyproject.toml if package is not installed,
    and finally to a hardcoded default.

    Returns:
        Version string (e.g., "0.1.0")
    """
    # Try to get version from installed package metadata
    try:
        return importlib.metadata.version("ushadow-backend")
    except importlib.metadata.PackageNotFoundError:
        pass

    # Fallback: Read from pyproject.toml (for development)
    try:
        current_path = Path(__file__).resolve()
        # Search up the directory tree for pyproject.toml
        for parent in [current_path.parent] + list(current_path.parents):
            pyproject_path = parent / "pyproject.toml"
            if pyproject_path.exists():
                with open(pyproject_path, 'r') as f:
                    for line in f:
                        if line.startswith('version = '):
                            # Extract version from: version = "0.1.0"
                            version = line.split('=')[1].strip().strip('"')
                            return version
    except Exception:
        pass

    # Final fallback to hardcoded version
    return "0.1.0"


# Cache the version at module load time
VERSION = get_version()
