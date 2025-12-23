"""
Docker Utilities for Chronicle Setup

Provides network management and other Docker-related utilities
for Chronicle's infrastructure setup scripts.
"""

import subprocess
import sys
import json
from typing import Dict, List


class DockerNetworkManager:
    """Manages Docker networks for Chronicle infrastructure."""

    # Chronicle uses two logical networks
    NETWORKS = {
        "chronicle-network": {
            "description": "Main Chronicle application network",
            "driver": "bridge"
        },
        "infra-network": {
            "description": "Shared infrastructure network (MongoDB, Redis, Qdrant, Neo4j)",
            "driver": "bridge"
        }
    }

    @staticmethod
    def network_exists(network_name: str) -> bool:
        """
        Check if a Docker network exists.

        Args:
            network_name: Name of the network to check

        Returns:
            True if network exists, False otherwise
        """
        try:
            result = subprocess.run(
                ["docker", "network", "inspect", network_name],
                capture_output=True,
                timeout=10
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False

    @staticmethod
    def create_network(network_name: str, driver: str = "bridge") -> bool:
        """
        Create a Docker network if it doesn't exist.

        Args:
            network_name: Name of the network to create
            driver: Network driver (default: bridge)

        Returns:
            True if network was created or already exists, False on error
        """
        # Check if network already exists
        if DockerNetworkManager.network_exists(network_name):
            return True

        try:
            result = subprocess.run(
                ["docker", "network", "create", "--driver", driver, network_name],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                print(f"✅ Created network: {network_name}", file=sys.stderr)
                return True
            else:
                print(f"❌ Failed to create network {network_name}: {result.stderr}", file=sys.stderr)
                return False

        except subprocess.TimeoutExpired:
            print(f"❌ Timeout creating network: {network_name}", file=sys.stderr)
            return False
        except FileNotFoundError:
            print("❌ Docker command not found. Is Docker installed?", file=sys.stderr)
            return False
        except Exception as e:
            print(f"❌ Error creating network {network_name}: {e}", file=sys.stderr)
            return False

    @classmethod
    def ensure_chronicle_networks(cls) -> Dict[str, bool]:
        """
        Ensure all required Chronicle networks exist.

        Creates both chronicle-network and infra-network if they don't exist.

        Returns:
            Dict mapping network names to success status
        """
        results = {}

        for network_name, config in cls.NETWORKS.items():
            driver = config.get("driver", "bridge")
            results[network_name] = cls.create_network(network_name, driver)

        return results

    @staticmethod
    def list_networks() -> List[Dict[str, str]]:
        """
        List all Docker networks.

        Returns:
            List of network information dicts with 'name', 'driver', and 'scope'
        """
        try:
            result = subprocess.run(
                ["docker", "network", "ls", "--format", "{{json .}}"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode != 0:
                return []

            networks = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    try:
                        networks.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

            return networks

        except Exception:
            return []
