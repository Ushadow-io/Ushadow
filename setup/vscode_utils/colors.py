#!/usr/bin/env python3
"""
Dynamically set VSCode colors based on project/environment name.
Colors are derived from named colors or generated via hashing.
"""

import json
import hashlib
import re
from pathlib import Path

# Predefined color names with their hex codes
NAMED_COLORS = {
    # Primary colors
    "red": {"primary": "#c41e3a", "dark": "#731f2a"},
    "blue": {"primary": "#0066cc", "dark": "#003366"},
    "green": {"primary": "#2ea043", "dark": "#1f7a34"},
    "yellow": {"primary": "#f0ad4e", "dark": "#c08a1e"},

    # Extended colors
    "gold": {"primary": "#DAA520", "dark": "#8B6914"},
    "orange": {"primary": "#ff6b35", "dark": "#cc5629"},
    "purple": {"primary": "#8b3a8b", "dark": "#5c2a5c"},
    "pink": {"primary": "#ff1493", "dark": "#c90a69"},
    "cyan": {"primary": "#00bcd4", "dark": "#00838f"},
    "teal": {"primary": "#009688", "dark": "#004d40"},
    "lime": {"primary": "#76ff03", "dark": "#558b2f"},
    "indigo": {"primary": "#3f51b5", "dark": "#283593"},
    "brown": {"primary": "#795548", "dark": "#4e342e"},
    "grey": {"primary": "#757575", "dark": "#424242"},
    "gray": {"primary": "#757575", "dark": "#424242"},  # US spelling
    "black": {"primary": "#212121", "dark": "#000000"},

    # Additional common colors
    "silver": {"primary": "#a8a8a8", "dark": "#6b6b6b"},
    "coral": {"primary": "#ff7f50", "dark": "#cc6640"},
    "salmon": {"primary": "#fa8072", "dark": "#c8665b"},
    "navy": {"primary": "#000080", "dark": "#000050"},
    "magenta": {"primary": "#ff00ff", "dark": "#cc00cc"},
    "violet": {"primary": "#ee82ee", "dark": "#be68be"},
    "maroon": {"primary": "#800000", "dark": "#500000"},
    "olive": {"primary": "#808000", "dark": "#505000"},
    "aqua": {"primary": "#00ffff", "dark": "#00cccc"},
    "turquoise": {"primary": "#40e0d0", "dark": "#33b3a6"},
    "crimson": {"primary": "#dc143c", "dark": "#b01030"},
    "lavender": {"primary": "#e6e6fa", "dark": "#b8b8c8"},
    "mint": {"primary": "#98ff98", "dark": "#7acc7a"},
    "peach": {"primary": "#ffcba4", "dark": "#cca283"},
    "rose": {"primary": "#ff007f", "dark": "#cc0066"},
    "ruby": {"primary": "#e0115f", "dark": "#b30d4c"},
    "emerald": {"primary": "#50c878", "dark": "#40a060"},
    "sapphire": {"primary": "#0f52ba", "dark": "#0c4295"},
    "amber": {"primary": "#ffbf00", "dark": "#cc9900"},
    "bronze": {"primary": "#cd7f32", "dark": "#a46628"},
    "copper": {"primary": "#b87333", "dark": "#935c29"},
    "platinum": {"primary": "#e5e4e2", "dark": "#b7b6b5"},
    "slate": {"primary": "#708090", "dark": "#5a6673"},
    "charcoal": {"primary": "#36454f", "dark": "#2b373f"},

    # Semantic environment names (mapped to meaningful colors)
    "main": {"primary": "#2ea043", "dark": "#1f7a34"},      # green - stable
    "master": {"primary": "#2ea043", "dark": "#1f7a34"},    # green - stable
    "dev": {"primary": "#0066cc", "dark": "#003366"},       # blue - development
    "develop": {"primary": "#0066cc", "dark": "#003366"},   # blue - development
    "staging": {"primary": "#f0ad4e", "dark": "#c08a1e"},   # yellow - caution
    "stage": {"primary": "#f0ad4e", "dark": "#c08a1e"},     # yellow - caution
    "prod": {"primary": "#c41e3a", "dark": "#731f2a"},      # red - production
    "production": {"primary": "#c41e3a", "dark": "#731f2a"},# red - production
    "test": {"primary": "#8b3a8b", "dark": "#5c2a5c"},      # purple - testing
    "qa": {"primary": "#8b3a8b", "dark": "#5c2a5c"},        # purple - testing
    "feature": {"primary": "#00bcd4", "dark": "#00838f"},   # cyan - feature work
    "hotfix": {"primary": "#ff6b35", "dark": "#cc5629"},    # orange - urgent
    "bugfix": {"primary": "#ff6b35", "dark": "#cc5629"},    # orange - fixes
    "release": {"primary": "#009688", "dark": "#004d40"},   # teal - release prep
    "sandbox": {"primary": "#76ff03", "dark": "#558b2f"},   # lime - experimental
    "demo": {"primary": "#ff1493", "dark": "#c90a69"},      # pink - demonstrations
}


def hash_to_color(name: str) -> dict:
    """Generate a color from a project name using hashing."""
    hash_object = hashlib.md5(name.encode())
    hash_hex = hash_object.hexdigest()

    # Extract color from hash (first 6 chars)
    primary = f"#{hash_hex[:6]}"

    # Create darker shade by reducing brightness
    r = int(hash_hex[0:2], 16)
    g = int(hash_hex[2:4], 16)
    b = int(hash_hex[4:6], 16)

    # Reduce brightness by 40%
    dark_r = max(0, int(r * 0.6))
    dark_g = max(0, int(g * 0.6))
    dark_b = max(0, int(b * 0.6))

    dark = f"#{dark_r:02x}{dark_g:02x}{dark_b:02x}"

    return {"primary": primary, "dark": dark}


def get_colors(name: str) -> dict:
    """Get colors for a name, using named colors or generating via hash."""
    name_lower = name.lower().strip()

    if name_lower in NAMED_COLORS:
        return NAMED_COLORS[name_lower]
    else:
        return hash_to_color(name)


def strip_jsonc_comments(text: str) -> str:
    """Remove comments from JSONC (JSON with Comments) format."""
    # Remove line comments (//)
    text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
    # Remove block comments (/* */)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    return text


def generate_vscode_settings(colors: dict) -> dict:
    """Generate VS Code color customization settings."""
    return {
        "titleBar.activeBackground": colors["primary"],
        "titleBar.activeForeground": "#ffffff",
        "titleBar.inactiveBackground": colors["dark"],
        "titleBar.inactiveForeground": "#cccccc",
        "statusBar.background": colors["primary"],
        "statusBar.foreground": "#ffffff",
        "statusBar.noFolderBackground": colors["primary"],
        "activityBar.background": colors["dark"],
        "activityBar.foreground": "#ffffff",
        "activityBar.inactiveForeground": "#cccccc",
        "activityBar.activeBorder": colors["primary"],
    }


def update_vscode_settings(vscode_dir: Path, colors: dict) -> None:
    """Update .vscode/settings.json with the provided colors."""
    settings_file = vscode_dir / "settings.json"

    # Load existing settings or create new ones
    if settings_file.exists():
        with open(settings_file, "r") as f:
            content = f.read()
            # Strip JSONC comments before parsing
            content = strip_jsonc_comments(content)
            try:
                settings = json.loads(content) if content.strip() else {}
            except json.JSONDecodeError:
                settings = {}
    else:
        settings = {}

    # Update color customizations
    settings["workbench.colorCustomizations"] = generate_vscode_settings(colors)

    # Ensure directory exists
    vscode_dir.mkdir(parents=True, exist_ok=True)

    # Write back to file with nice formatting
    with open(settings_file, "w") as f:
        json.dump(settings, f, indent=2)


def setup_colors_for_directory(directory: Path, name: str | None = None) -> dict:
    """
    Set up VS Code colors for a directory.

    Args:
        directory: The directory to set up colors for
        name: Optional name to use for color lookup (defaults to directory name)

    Returns:
        The colors that were applied
    """
    if name is None:
        name = directory.name

    colors = get_colors(name)
    vscode_dir = directory / ".vscode"
    update_vscode_settings(vscode_dir, colors)

    return colors


def list_available_colors() -> list[str]:
    """Return a list of all available named colors."""
    return sorted(NAMED_COLORS.keys())
