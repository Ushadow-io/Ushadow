"""Robot Framework library for Tailscale admin API operations."""

import os
import requests
from typing import Optional


class TailscaleAdmin:
    """Library for Tailscale admin console API operations."""

    def __init__(self):
        """Initialize with API key from environment."""
        self.api_key = os.getenv('TAILSCALE_API_KEY', '')
        self.tailnet = os.getenv('TAILSCALE_TAILNET', '')
        self.base_url = 'https://api.tailscale.com/api/v2'

    def _get_headers(self):
        """Get headers for Tailscale API requests."""
        if not self.api_key:
            raise ValueError("TAILSCALE_API_KEY environment variable not set")
        return {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }

    def delete_device_by_hostname(self, hostname: str) -> bool:
        """Delete a device from Tailscale admin by hostname.

        Args:
            hostname: The Tailscale hostname (e.g., "test-green-123456")

        Returns:
            True if device was deleted, False if not found or error
        """
        if not self.api_key:
            print("⚠️ TAILSCALE_API_KEY not set, skipping device cleanup")
            return False

        if not self.tailnet:
            print("⚠️ TAILSCALE_TAILNET not set, skipping device cleanup")
            return False

        try:
            # Get list of devices to find the device ID
            devices_url = f"{self.base_url}/tailnet/{self.tailnet}/devices"
            response = requests.get(devices_url, headers=self._get_headers(), timeout=10)

            if response.status_code != 200:
                print(f"❌ Failed to list devices: {response.status_code}")
                return False

            devices = response.json().get('devices', [])

            # Find device by hostname
            device_id = None
            for device in devices:
                device_hostname = device.get('hostname', '')
                # Hostname in API response doesn't include tailnet suffix
                if device_hostname == hostname or device.get('name', '') == hostname:
                    device_id = device.get('id')
                    break

            if not device_id:
                print(f"⚠️ Device with hostname '{hostname}' not found in tailnet")
                return False

            # Delete the device
            delete_url = f"{self.base_url}/device/{device_id}"
            response = requests.delete(delete_url, headers=self._get_headers(), timeout=10)

            if response.status_code in (200, 204):
                print(f"✅ Device '{hostname}' (ID: {device_id}) deleted from Tailscale admin")
                return True
            else:
                print(f"❌ Failed to delete device: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"❌ Error deleting device: {e}")
            return False

    def is_api_configured(self) -> bool:
        """Check if Tailscale API is properly configured.

        Returns:
            True if API key and tailnet are set
        """
        return bool(self.api_key and self.tailnet)
