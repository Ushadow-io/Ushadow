"""
Ushadow Telemetry Client
Privacy-focused anonymous usage tracking
"""

import hashlib
import json
import platform
import uuid
from pathlib import Path
from typing import Optional
import urllib.request
import urllib.error


class TelemetryClient:
    """
    Privacy-focused telemetry client for Ushadow.

    Generates a stable machine ID hash and sends anonymous usage pings.
    No personal information is collected or transmitted.
    """

    def __init__(
        self,
        endpoint: str = "https://ushadow-telemetry.your-subdomain.workers.dev",
        app_version: str = "unknown",
        config_dir: Optional[Path] = None,
    ):
        """
        Initialize telemetry client.

        Args:
            endpoint: Cloudflare Worker endpoint URL
            app_version: Current app version (e.g., "0.2.4")
            config_dir: Directory to store machine ID (defaults to ~/.ushadow)
        """
        self.endpoint = endpoint.rstrip('/')
        self.app_version = app_version
        self.config_dir = config_dir or Path.home() / ".ushadow"
        self.config_dir.mkdir(parents=True, exist_ok=True)

        self.machine_id = self._get_or_create_machine_id()
        self.os_info = self._get_os_info()

    def _get_or_create_machine_id(self) -> str:
        """
        Get or create a stable machine identifier.

        Uses hardware-based hash for stability across reinstalls.
        Falls back to persistent UUID if hardware info unavailable.

        Returns:
            16-character hex string uniquely identifying this machine
        """
        machine_id_file = self.config_dir / "machine_id"

        # Try to load existing ID
        if machine_id_file.exists():
            try:
                return machine_id_file.read_text().strip()
            except Exception:
                pass

        # Generate new machine ID
        machine_id = self._generate_machine_id()

        # Save for future use
        try:
            machine_id_file.write_text(machine_id)
            machine_id_file.chmod(0o600)  # Restrict permissions
        except Exception:
            pass  # Not critical if we can't save

        return machine_id

    def _generate_machine_id(self) -> str:
        """
        Generate stable machine identifier from hardware characteristics.

        Returns:
            16-character hex hash
        """
        components = [
            platform.node(),          # Hostname
            platform.machine(),       # Architecture (x86_64, arm64, etc.)
            str(uuid.getnode()),      # MAC address as integer
            platform.system(),        # OS type
        ]

        # Hash components together
        raw = "-".join(components)
        hash_obj = hashlib.sha256(raw.encode())
        return hash_obj.hexdigest()[:16]

    def _get_os_info(self) -> dict:
        """
        Get OS information.

        Returns:
            Dict with os and os_version keys
        """
        system = platform.system().lower()

        # Normalize OS names
        os_map = {
            'darwin': 'mac',
            'windows': 'windows',
            'linux': 'linux',
        }

        return {
            'os': os_map.get(system, system),
            'os_version': platform.release(),
        }

    def send_ping(self, timeout: int = 5) -> bool:
        """
        Send telemetry ping to record app usage.

        Args:
            timeout: Request timeout in seconds

        Returns:
            True if ping succeeded, False otherwise
        """
        try:
            data = {
                'machine_id': self.machine_id,
                'os': self.os_info['os'],
                'os_version': self.os_info['os_version'],
                'app_version': self.app_version,
            }

            req = urllib.request.Request(
                f'{self.endpoint}/ping',
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status == 200

        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
            # Fail silently - telemetry should never break the app
            return False
        except Exception:
            return False

    def send_install_event(self, install_method: str = "unknown", timeout: int = 5) -> bool:
        """
        Send install event (separate from regular pings).

        Args:
            install_method: "installer" or "script"
            timeout: Request timeout in seconds

        Returns:
            True if event sent successfully, False otherwise
        """
        try:
            data = {
                'machine_id': self.machine_id,
                'os': self.os_info['os'],
                'os_version': self.os_info['os_version'],
                'install_method': install_method,
            }

            req = urllib.request.Request(
                f'{self.endpoint}/install',
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status == 200

        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
            return False
        except Exception:
            return False


# Convenience function for simple usage
def send_telemetry_ping(
    endpoint: str = "https://ushadow-telemetry.your-subdomain.workers.dev",
    app_version: str = "unknown"
) -> bool:
    """
    Send a telemetry ping with minimal setup.

    Args:
        endpoint: Cloudflare Worker endpoint URL
        app_version: Current app version

    Returns:
        True if successful, False otherwise
    """
    client = TelemetryClient(endpoint=endpoint, app_version=app_version)
    return client.send_ping()


if __name__ == "__main__":
    # Example usage
    client = TelemetryClient(
        endpoint="https://ushadow-telemetry.your-subdomain.workers.dev",
        app_version="0.2.4"
    )

    print(f"Machine ID: {client.machine_id}")
    print(f"OS: {client.os_info['os']} {client.os_info['os_version']}")

    success = client.send_ping()
    print(f"Ping sent: {success}")
