"""Unified deployment target identifier utilities."""

import os
from typing import Literal


def get_environment_name() -> str:
    """Get the current environment name from ENV_NAME or COMPOSE_PROJECT_NAME."""
    env_name = os.getenv("ENV_NAME")
    if env_name:
        return env_name

    # Fallback to extracting from COMPOSE_PROJECT_NAME (e.g., "ushadow-purple" -> "purple")
    compose_project = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")
    if "-" in compose_project:
        return compose_project.split("-", 1)[1]
    return compose_project


def make_deployment_target_id(
    identifier: str,
    target_type: Literal["unode", "k8s"]
) -> str:
    """
    Generate a unified deployment target ID.

    Format: {identifier}.{type}.{environment}

    Examples:
        - UNode: "ushadow-purple.unode.purple"
        - K8s:   "my-cluster.k8s.purple"

    Args:
        identifier: Hostname for unodes, cluster name for k8s
        target_type: "unode" or "k8s"

    Returns:
        Deployment target ID
    """
    env = get_environment_name()
    return f"{identifier}.{target_type}.{env}"


def parse_deployment_target_id(target_id: str) -> dict:
    """
    Parse a deployment target ID into components.

    Args:
        target_id: Deployment target ID (e.g., "ushadow-purple.unode.purple")

    Returns:
        Dict with keys: identifier, type, environment

    Raises:
        ValueError: If target_id format is invalid
    """
    parts = target_id.split(".")
    if len(parts) != 3:
        raise ValueError(
            f"Invalid deployment target ID: {target_id}. "
            f"Expected format: {{identifier}}.{{type}}.{{environment}}"
        )

    identifier, target_type, environment = parts

    if target_type not in ("unode", "k8s"):
        raise ValueError(
            f"Invalid target type: {target_type}. Expected 'unode' or 'k8s'"
        )

    return {
        "identifier": identifier,
        "type": target_type,
        "environment": environment
    }
