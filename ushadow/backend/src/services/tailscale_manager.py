"""Tailscale Manager - Unified Tailscale Service.

This service consolidates all Tailscale operations:
- Container lifecycle (start, stop, status)
- Authentication (auth URL, clear auth, status)
- Layer 1 routing (base infrastructure routes)
- Certificate provisioning
- Tailnet settings queries

Architecture:
- Layer 1 (Tailscale Serve): External HTTPS → Internal containers
  - /api/* → backend (REST APIs)
  - /auth/* → backend (authentication)
  - /ws_pcm, /ws_omi → chronicle (WebSockets, direct for low latency)
  - /* → frontend (SPA catch-all)

- Layer 2 (Generic Proxy): Backend routes REST to services via /api/services/{name}/proxy/*
  - NOT handled by this service

See: docs/MANUAL/url_routing.md for complete architecture.
"""

import logging
import os
import json
import yaml
import time
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass
from pathlib import Path

import docker

from src.utils.qrcode import generate_qr_code_data_url

logger = logging.getLogger(__name__)


# ============================================================================
# Data Models
# ============================================================================

@dataclass
class ContainerStatus:
    """Tailscale container status."""
    exists: bool = False
    running: bool = False
    authenticated: bool = False
    hostname: Optional[str] = None  # Full DNS name (e.g., "red.spangled-kettle.ts.net")
    ip_address: Optional[str] = None  # IPv4 address (e.g., "100.x.x.x")


@dataclass
class AuthUrlResponse:
    """Authentication URL response with QR code data."""
    auth_url: str
    web_url: str
    qr_code_data: str


@dataclass
class CertResponse:
    """Certificate provisioning response."""
    provisioned: bool
    cert_path: Optional[str] = None
    key_path: Optional[str] = None
    error: Optional[str] = None


@dataclass
class TailnetSettings:
    """Tailnet configuration settings."""
    magic_dns: Dict[str, Any]
    https_serve: Dict[str, Any]


# ============================================================================
# TailscaleManager Service
# ============================================================================

class TailscaleManager:
    """Unified Tailscale management service.

    Handles:
    - Container lifecycle operations
    - Layer 1 base routing (external HTTPS → internal containers)
    - Authentication flow
    - Certificate management
    - Tailnet settings
    """

    def __init__(self, docker_client: Optional[docker.DockerClient] = None):
        """Initialize TailscaleManager.

        Args:
            docker_client: Docker client instance. If None, creates from environment.
        """
        self.docker_client = docker_client or docker.from_env()
        self.env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"

        # Cache for auth URL to avoid regenerating nodekeys unnecessarily
        self._cached_auth_url: Optional[AuthUrlResponse] = None
        self._auth_url_timestamp: Optional[float] = None
        self._auth_url_cache_ttl: int = 300  # 5 minutes

    # ========================================================================
    # Container Management
    # ========================================================================

    def get_container_name(self) -> str:
        """Get the Tailscale container name for this environment.

        Returns:
            Container name like "ushadow-red-tailscale"
        """
        return f"{self.env_name}-tailscale"

    def get_volume_name(self) -> str:
        """Get the Tailscale volume name for this environment.

        Returns:
            Volume name like "ushadow-red-tailscale-data"
        """
        return f"{self.env_name}-tailscale-data"

    def get_container_status(self) -> ContainerStatus:
        """Get Tailscale container and authentication status.

        Returns:
            ContainerStatus with exists, running, authenticated, hostname, ip
        """
        status = ContainerStatus()
        container_name = self.get_container_name()

        try:
            container = self.docker_client.containers.get(container_name)
            container.reload()  # Refresh container state
            status.exists = True
            status.running = container.status == "running"

            # Only try to get Tailscale status if container is running
            if status.running:
                try:
                    tailscale_status = self._get_tailscale_status_from_container()
                    status.authenticated = tailscale_status.get("authenticated", False)
                    status.hostname = tailscale_status.get("hostname")
                    status.ip_address = tailscale_status.get("ip_address")
                except Exception as e:
                    # Log but don't fail - container is running but Tailscale may not be ready
                    logger.debug(f"Could not get Tailscale status (container running but not ready): {e}")

        except docker.errors.NotFound:
            status.exists = False
            status.running = False
        except Exception as e:
            logger.error(f"Error checking container status: {e}")
            # Return what we know so far
            pass

        return status

    def start_container(self) -> Dict[str, Any]:
        """Start Tailscale container (creates if doesn't exist).

        Returns:
            Dict with status ("created", "started", "already_running") and message
        """
        container_name = self.get_container_name()
        volume_name = self.get_volume_name()

        try:
            # Check if container exists
            try:
                container = self.docker_client.containers.get(container_name)

                if container.status == "running":
                    return {
                        "status": "already_running",
                        "message": "Tailscale container is already running"
                    }

                # Container exists but not running - start it
                container.start()
                return {
                    "status": "started",
                    "message": "Tailscale container started"
                }

            except docker.errors.NotFound:
                # Container doesn't exist - create it
                # TODO: Get image, network, ports from settings/config
                # For now, use defaults
                container = self.docker_client.containers.run(
                    image="tailscale/tailscale:latest",
                    name=container_name,
                    detach=True,
                    network_mode="host",
                    environment={
                        "TS_STATE_DIR": "/var/lib/tailscale",
                        "TS_SOCKET": "/var/run/tailscale/tailscaled.sock",
                    },
                    volumes={
                        volume_name: {"bind": "/var/lib/tailscale", "mode": "rw"}
                    },
                    cap_add=["NET_ADMIN", "NET_RAW"],
                )

                return {
                    "status": "created",
                    "message": "Tailscale container created and started"
                }

        except Exception as e:
            logger.error(f"Error starting Tailscale container: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    def stop_container(self) -> Dict[str, Any]:
        """Stop Tailscale container.

        Returns:
            Dict with status and message
        """
        container_name = self.get_container_name()

        try:
            container = self.docker_client.containers.get(container_name)
            container.stop()
            return {
                "status": "success",
                "message": "Tailscale container stopped"
            }
        except docker.errors.NotFound:
            return {
                "status": "not_found",
                "message": "Tailscale container not found"
            }
        except Exception as e:
            logger.error(f"Error stopping container: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    def clear_auth(self) -> Dict[str, Any]:
        """Clear Tailscale authentication (de-auth and remove all cached data).

        This will:
        1. Log out from Tailscale
        2. Stop and remove container
        3. Remove volume with state data
        4. Clear all cached config files
        5. Remove provisioned certificates
        6. Clear serve configuration

        Returns:
            Dict with status and message
        """
        container_name = self.get_container_name()
        volume_name = self.get_volume_name()

        try:
            # Try to logout first (if container is running)
            try:
                self.logout()
                logger.info("Logged out from Tailscale")
            except Exception as e:
                logger.debug(f"Could not logout (container may not be running): {e}")

            # Remove container
            try:
                container = self.docker_client.containers.get(container_name)
                container.remove(force=True)
                logger.info(f"Removed container: {container_name}")
            except docker.errors.NotFound:
                logger.debug(f"Container {container_name} not found")

            # Remove volume
            try:
                volume = self.docker_client.volumes.get(volume_name)
                volume.remove(force=True)
                logger.info(f"Removed volume: {volume_name}")
            except docker.errors.NotFound:
                logger.debug(f"Volume {volume_name} not found")

            # Clear all config files that might have cached auth data
            config_files = [
                Path("/config/tailscale.yaml"),
                Path("/config/tailscale-serve.json"),
            ]

            for config_file in config_files:
                if config_file.exists():
                    try:
                        config_file.unlink()
                        logger.info(f"Removed config file: {config_file}")
                    except Exception as e:
                        logger.warning(f"Could not remove {config_file}: {e}")

            # Clear all provisioned certificates
            certs_dir = Path("/config/SECRETS/certs")
            if certs_dir.exists():
                try:
                    for cert_file in certs_dir.glob("*.crt"):
                        cert_file.unlink()
                        logger.info(f"Removed certificate: {cert_file}")
                    for key_file in certs_dir.glob("*.key"):
                        key_file.unlink()
                        logger.info(f"Removed key: {key_file}")
                except Exception as e:
                    logger.warning(f"Error removing certificates: {e}")

            # Clear in-memory cached auth URL
            self._cached_auth_url = None
            self._auth_url_timestamp = None

            logger.info("Cleared all Tailscale auth data and cached files")

            return {
                "status": "success",
                "message": "Tailscale authentication cleared, all cached data removed"
            }

        except Exception as e:
            logger.error(f"Error clearing Tailscale auth: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    # ========================================================================
    # Command Execution
    # ========================================================================

    def exec_command(self, command: str, timeout: int = 10) -> Tuple[int, str, str]:
        """Execute a command in the Tailscale container.

        Args:
            command: Command to execute (can include pipes/shell operators)
            timeout: Timeout in seconds (default: 10)

        Returns:
            Tuple of (exit_code, stdout, stderr)
        """
        import signal
        from contextlib import contextmanager

        @contextmanager
        def time_limit(seconds):
            """Context manager for timeout."""
            def signal_handler(signum, frame):
                raise TimeoutError(f"Command timed out after {seconds} seconds")

            # Set the signal handler
            signal.signal(signal.SIGALRM, signal_handler)
            signal.alarm(seconds)
            try:
                yield
            finally:
                signal.alarm(0)

        container_name = self.get_container_name()

        try:
            container = self.docker_client.containers.get(container_name)

            # If command contains pipes or shell operators, wrap in sh -c
            if any(op in command for op in ['|', '&&', '||', '>', '<']):
                cmd = ['/bin/sh', '-c', command]
            else:
                cmd = command

            # Execute with timeout
            try:
                with time_limit(timeout):
                    result = container.exec_run(cmd, demux=True)
                    exit_code = result.exit_code
                    output = result.output

                    if isinstance(output, tuple):
                        stdout = output[0].decode() if output[0] else ""
                        stderr = output[1].decode() if output[1] else ""
                    else:
                        stdout = output.decode() if output else ""
                        stderr = ""

                    return exit_code, stdout, stderr

            except TimeoutError as e:
                error_msg = str(e)
                logger.warning(f"Command timed out: {command}")
                return 1, "", error_msg

        except docker.errors.NotFound:
            error_msg = f"Container '{container_name}' not found"
            logger.error(error_msg)
            return 1, "", error_msg
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error executing command: {error_msg}")
            return 1, "", error_msg

    # ========================================================================
    # Tailscale Status
    # ========================================================================

    def _get_tailscale_status_from_container(self) -> Dict[str, Any]:
        """Get Tailscale status from container via 'tailscale status --json'.

        Returns:
            Dict with authenticated, hostname, ip_address
        """
        status = {
            "authenticated": False,
            "hostname": None,
            "ip_address": None
        }

        try:
            # Use a short timeout for status check
            exit_code, stdout, stderr = self.exec_command("tailscale status --json", timeout=5)

            if exit_code == 0 and stdout.strip():
                data = json.loads(stdout)
                self_node = data.get("Self", {})

                # Get hostname (DNSName)
                dns_name = self_node.get("DNSName", "")
                if dns_name:
                    status["hostname"] = dns_name.rstrip(".")
                    status["authenticated"] = True

                # Get IPv4 address
                tailscale_ips = self_node.get("TailscaleIPs", [])
                for ip in tailscale_ips:
                    if "." in ip:  # IPv4
                        status["ip_address"] = ip
                        break
            else:
                logger.debug(f"Tailscale status command failed (exit {exit_code}): {stderr}")

        except Exception as e:
            logger.debug(f"Could not get Tailscale status: {e}")

        return status

    def get_tailnet_suffix(self) -> Optional[str]:
        """Get the tailnet suffix from hostname.

        Example: "ushadow.spangled-kettle.ts.net" → "spangled-kettle.ts.net"

        Returns:
            Tailnet suffix or None if not configured
        """
        container_status = self.get_container_status()

        if container_status.hostname and '.' in container_status.hostname:
            # Return everything after the first dot
            return container_status.hostname.split('.', 1)[1]

        return None

    # ========================================================================
    # Authentication
    # ========================================================================

    def get_auth_url(self, regenerate: bool = False) -> AuthUrlResponse:
        """Get Tailscale authentication URL with QR code.

        Uses CLI to trigger auth flow and extracts the URL.
        QR code generation separated to utility function for cleanliness.

        Args:
            regenerate: If True, force generation of new auth URL (clears cache)

        Returns:
            AuthUrlResponse with auth_url, web_url, qr_code_data

        Raises:
            RuntimeError: If container not running, already authenticated, or command fails
        """
        import re

        # Check if already authenticated - if so, clear cache and don't generate URL
        status = self.get_container_status()
        if status.authenticated:
            logger.info("Already authenticated, clearing auth URL cache")
            self._cached_auth_url = None
            self._auth_url_timestamp = None
            raise RuntimeError("Already authenticated to Tailscale - no auth URL needed")

        # Check cache first (unless regenerate requested)
        if not regenerate and self._cached_auth_url and self._auth_url_timestamp:
            age = time.time() - self._auth_url_timestamp
            if age < self._auth_url_cache_ttl:
                logger.debug(f"Returning cached auth URL (age: {age:.1f}s)")
                return self._cached_auth_url
            else:
                logger.debug(f"Cached auth URL expired (age: {age:.1f}s)")

        # Use timeout long enough for auth URL to appear
        cmd = "tailscale up --auth-key= --timeout=6s"
        if regenerate:
            cmd += " --force-reauth"

        # Execute and capture output
        exit_code, stdout, stderr = self.exec_command(cmd, timeout=15)

        # Parse output for URL - try multiple patterns
        output = stdout + stderr
        auth_url = None

        logger.debug(f"Auth URL command output (exit_code={exit_code}):\nstdout: {stdout}\nstderr: {stderr}")

        # Pattern 1: "AuthURL is https://..."
        url_match = re.search(r'AuthURL is (https://login\.tailscale\.com/[^\s]+)', output)
        if not url_match:
            # Pattern 2: "To authenticate, visit:" followed by URL
            url_match = re.search(r'To authenticate, visit:[\s\n\t]+(https://login\.tailscale\.com/[^\s]+)', output)
        if not url_match:
            # Pattern 3: Plain URL in output
            url_match = re.search(r'(https://login\.tailscale\.com/[^\s]+)', output)

        if not url_match:
            # Try getting URL from tailscale status
            logger.debug("URL not found in 'tailscale up' output, trying 'tailscale status'")
            status_exit, status_stdout, status_stderr = self.exec_command("tailscale status", timeout=5)
            status_output = status_stdout + status_stderr
            url_match = re.search(r'Log in at:\s+(https://login\.tailscale\.com/[^\s]+)', status_output)

            if not url_match:
                logger.error(f"Failed to extract URL from both 'up' and 'status' commands")
                logger.error(f"'up' output ({len(output)} chars): {output[:500]}")
                logger.error(f"'status' output ({len(status_output)} chars): {status_output[:500]}")
                raise RuntimeError(f"Could not extract auth URL from output: {output[:500]}")

        auth_url = url_match.group(1)

        # Generate QR code using utility function (separated for cleanliness)
        qr_code_data = generate_qr_code_data_url(auth_url) or ""

        # Build response
        response = AuthUrlResponse(
            auth_url=auth_url,
            web_url=auth_url,
            qr_code_data=qr_code_data
        )

        # Cache the response
        self._cached_auth_url = response
        self._auth_url_timestamp = time.time()
        logger.debug("Cached new auth URL")

        return response

    def authenticate_with_key(self, auth_key: str, accept_routes: bool = True) -> bool:
        """Authenticate Tailscale using a pre-generated auth key.

        This is for automated authentication (testing, CI/CD, etc.) without
        requiring interactive user login.

        Args:
            auth_key: Tailscale auth key (e.g., "tskey-auth-...")
            accept_routes: Accept subnet routes from other nodes

        Returns:
            True if authentication succeeded

        Raises:
            RuntimeError: If authentication fails

        Example:
            >>> manager = TailscaleManager()
            >>> manager.authenticate_with_key("tskey-auth-k123...")
        """
        try:
            # Build command
            cmd = f"tailscale up --authkey={auth_key}"
            if accept_routes:
                cmd += " --accept-routes"

            # Execute
            exit_code, stdout, stderr = self.exec_command(cmd, timeout=30)

            if exit_code == 0:
                logger.info("Successfully authenticated with auth key")
                # Clear cached auth URL since we're now authenticated
                self._cached_auth_url = None
                self._auth_url_timestamp = None
                return True
            else:
                logger.error(f"Authentication failed: {stderr}")
                raise RuntimeError(f"Authentication with auth key failed: {stderr}")

        except Exception as e:
            logger.error(f"Error during auth key authentication: {e}")
            raise RuntimeError(f"Authentication failed: {e}")

    def logout(self) -> bool:
        """Logout from Tailscale (de-authenticate).

        This logs out the local machine but does NOT remove the device from
        the Tailscale admin console. To fully remove, use Control API.

        Returns:
            True if logout succeeded

        Raises:
            RuntimeError: If logout fails
        """
        try:
            exit_code, stdout, stderr = self.exec_command("tailscale logout", timeout=10)

            if exit_code == 0:
                logger.info("Successfully logged out from Tailscale")
                # Clear cached auth URL
                self._cached_auth_url = None
                self._auth_url_timestamp = None
                return True
            else:
                logger.error(f"Logout failed: {stderr}")
                raise RuntimeError(f"Logout failed: {stderr}")

        except Exception as e:
            logger.error(f"Error during logout: {e}")
            raise RuntimeError(f"Logout failed: {e}")

    # ========================================================================
    # Layer 1: Base Route Configuration
    # ========================================================================

    def configure_base_routes(self,
                             backend_container: Optional[str] = None,
                             frontend_container: Optional[str] = None,
                             chronicle_container: Optional[str] = None,
                             backend_port: int = 8000,
                             frontend_port: Optional[int] = None) -> bool:
        """Configure base infrastructure routes (Layer 1).

        Sets up:
        - /api/* → backend (REST APIs through generic proxy)
        - /auth/* → backend (authentication)
        - /ws_pcm → chronicle (WebSocket, direct for low latency)
        - /ws_omi → chronicle (WebSocket, direct for low latency)
        - /* → frontend (SPA catch-all)

        Args:
            backend_container: Backend container name (default: {env}-backend)
            frontend_container: Frontend container name (default: {env}-webui)
            chronicle_container: Chronicle container name (default: {env}-chronicle-backend)
            backend_port: Backend internal port (default: 8000)
            frontend_port: Frontend internal port (auto-detect if None)

        Returns:
            True if all routes configured successfully
        """
        # Use defaults if not provided
        if not backend_container:
            backend_container = f"{self.env_name}-backend"
        if not frontend_container:
            frontend_container = f"{self.env_name}-webui"
        if not chronicle_container:
            chronicle_container = f"{self.env_name}-chronicle-backend"

        # Auto-detect frontend port based on dev/prod mode
        if frontend_port is None:
            dev_mode = os.getenv("DEV_MODE", "false").lower() == "true"
            frontend_port = 5173 if dev_mode else 80

        backend_base = f"http://{backend_container}:{backend_port}"
        frontend_target = f"http://{frontend_container}:{frontend_port}"
        chronicle_base = f"http://{chronicle_container}:{backend_port}"

        success = True

        # Backend API routes - include path in target to preserve it
        # (Tailscale serve strips the --set-path prefix from the request)
        backend_routes = ["/api", "/auth"]
        for route in backend_routes:
            target = f"{backend_base}{route}"
            if not self.add_serve_route(route, target):
                success = False

        # WebSocket routes - direct to Chronicle for low latency
        ws_routes = ["/ws_pcm", "/ws_omi"]
        for route in ws_routes:
            target = f"{chronicle_base}{route}"
            if not self.add_serve_route(route, target):
                success = False

        # Frontend catches everything else
        if not self.add_serve_route("/", frontend_target):
            success = False

        return success

    def add_serve_route(self, path: str, target: str) -> bool:
        """Add a route to Tailscale serve.

        Args:
            path: URL path (e.g., "/api", "/ws_pcm", or "/" for root)
            target: Backend target (e.g., "http://backend:8000/api")

        Returns:
            True if successful, False otherwise
        """
        if path == "/":
            # Root route - no --set-path
            cmd = f"tailscale serve --bg {target}"
        else:
            cmd = f"tailscale serve --bg --set-path {path} {target}"

        exit_code, stdout, stderr = self.exec_command(cmd)

        if exit_code == 0:
            logger.info(f"Added Tailscale serve route: {path} -> {target}")
            return True
        else:
            logger.error(f"Failed to add route {path}: {stderr}")
            return False

    def remove_serve_route(self, path: str) -> bool:
        """Remove a route from Tailscale serve.

        Args:
            path: URL path to remove (e.g., "/api", "/ws_pcm")

        Returns:
            True if successful, False otherwise
        """
        if path == "/":
            cmd = "tailscale serve --https=443 off"
        else:
            cmd = f"tailscale serve --https=443 --set-path {path} off"

        exit_code, stdout, stderr = self.exec_command(cmd)

        if exit_code == 0:
            logger.info(f"Removed Tailscale serve route: {path}")
            return True
        else:
            logger.error(f"Failed to remove route {path}: {stderr}")
            return False

    def reset_serve(self) -> bool:
        """Reset all Tailscale serve configuration.

        Returns:
            True if successful, False otherwise
        """
        exit_code, stdout, stderr = self.exec_command("tailscale serve reset")

        if exit_code == 0:
            logger.info("Reset Tailscale serve configuration")
            return True
        else:
            logger.error(f"Failed to reset serve: {stderr}")
            return False

    def get_serve_status(self) -> Optional[str]:
        """Get current Tailscale serve status.

        Returns:
            Status string showing current routes, or None if error
        """
        exit_code, stdout, stderr = self.exec_command("tailscale serve status")

        if exit_code == 0:
            return stdout
        return None

    # ========================================================================
    # Certificate Management
    # ========================================================================

    def _is_retryable_cert_error(self, error: str) -> bool:
        """Check if cert provisioning error is retryable (network/timeout issues).

        Args:
            error: Error message from cert command

        Returns:
            True if error appears to be transient network/timeout issue
        """
        retryable_indicators = [
            "timeout",
            "timed out",  # Our exec_command timeout message
            "EOF",
            "connection reset",
            "connection refused",
            "network unreachable",
            "temporary failure",
            "i/o timeout",
        ]
        error_lower = error.lower()
        return any(indicator in error_lower for indicator in retryable_indicators)

    def _wait_for_stable_connection(self, max_wait_seconds: int = 15) -> bool:
        """Wait for Tailscale connection to stabilize before cert provisioning.

        Checks the daemon logs for connection stability. Returns True if connection
        appears stable, False if we hit the timeout.

        Args:
            max_wait_seconds: Maximum time to wait for stability

        Returns:
            True if connection is stable, False if timeout reached
        """
        logger.info("Waiting for Tailscale connection to stabilize...")

        try:
            container = self.docker_client.containers.get(self.container_name)

            # Wait a few seconds for initial connection to settle
            time.sleep(3)

            # Check if connection is stable (no reconnections for 5+ seconds)
            stable_count = 0
            check_interval = 2
            checks_needed = 3  # Need 3 consecutive stable checks (6 seconds)

            for _ in range(max_wait_seconds // check_interval):
                # Get recent logs (last 10 lines)
                logs = container.logs(tail=10).decode('utf-8', errors='ignore')
                logs_lower = logs.lower()

                # Check for connection issues in recent logs
                # Focus on actual reconnection events, not stable connection logs
                has_connection_issues = (
                    'unexpected eof' in logs_lower or
                    'connection reset' in logs_lower or
                    'forcing port 443 dial' in logs_lower or
                    'control: controlhttp:' in logs_lower  # Control plane reconnection
                )

                if has_connection_issues:
                    logger.debug("Connection still stabilizing (reconnection detected)")
                    stable_count = 0
                else:
                    stable_count += 1
                    if stable_count >= checks_needed:
                        logger.info("Connection stable, proceeding with cert provisioning")
                        return True

                time.sleep(check_interval)

            logger.warning(f"Connection did not fully stabilize within {max_wait_seconds}s, attempting anyway")
            return False

        except Exception as e:
            logger.warning(f"Could not check connection stability: {e}")
            # Don't block cert provisioning if we can't check
            return True

    def provision_cert(self, hostname: str, certs_dir: Path, max_retries: int = 3) -> CertResponse:
        """Provision TLS certificate for hostname with automatic retry on network failures.

        Args:
            hostname: Hostname to provision cert for (e.g., "red.spangled-kettle.ts.net")
            certs_dir: Directory to save certificates to
            max_retries: Maximum number of retry attempts (default: 3)

        Returns:
            CertResponse with provisioned status, paths, or error

        Note:
            This operation can take 60-90 seconds as it contacts Let's Encrypt.
            On macOS with Docker Desktop, sleep/wake events can interrupt long-lived
            connections, so we automatically retry up to max_retries times.
        """
        try:
            # Ensure certs directory exists
            certs_dir.mkdir(parents=True, exist_ok=True)

            # Check if already exists
            cert_file = certs_dir / f"{hostname}.crt"
            key_file = certs_dir / f"{hostname}.key"

            if cert_file.exists() and key_file.exists():
                logger.info(f"Certificate already exists for {hostname}")
                return CertResponse(
                    provisioned=True,
                    cert_path=str(cert_file),
                    key_path=str(key_file)
                )

            # Wait for connection to stabilize before attempting cert provisioning
            # This helps avoid starting ACME while control plane is reconnecting
            self._wait_for_stable_connection()

            # Provision in container - save to /certs directory
            # Note: /certs is bind-mounted to the same host directory as certs_dir,
            # so files written by tailscale cert are immediately available here
            cert_cmd = f"tailscale cert --cert-file /certs/{hostname}.crt --key-file /certs/{hostname}.key {hostname}"

            # Retry logic for network interruptions (macOS sleep/wake, connection drops)
            last_error = None
            for attempt in range(1, max_retries + 1):
                logger.info(f"Certificate provisioning attempt {attempt}/{max_retries} for {hostname}")

                exit_code, stdout, stderr = self.exec_command(cert_cmd, timeout=90)

                if exit_code == 0:
                    # Success - verify files exist
                    if not cert_file.exists() or not key_file.exists():
                        return CertResponse(
                            provisioned=False,
                            error="Certificate command succeeded but files not found in certs directory"
                        )

                    # Set proper permissions
                    os.chmod(cert_file, 0o644)
                    os.chmod(key_file, 0o600)

                    logger.info(f"Certificate provisioned successfully at {certs_dir} (attempt {attempt})")

                    return CertResponse(
                        provisioned=True,
                        cert_path=str(cert_file),
                        key_path=str(key_file)
                    )

                # Command failed - check if retryable
                last_error = stderr or stdout or "Unknown error"
                logger.warning(f"Cert provisioning attempt {attempt} failed: {last_error}")

                # Check if error is retryable
                if not self._is_retryable_cert_error(last_error):
                    logger.error(f"Non-retryable error encountered: {last_error}")
                    return CertResponse(provisioned=False, error=last_error)

                # Retryable error - wait before next attempt (exponential backoff)
                if attempt < max_retries:
                    wait_time = 2 ** attempt  # 2s, 4s, 8s
                    logger.info(f"Retrying in {wait_time}s due to network error...")
                    time.sleep(wait_time)

            # All retries exhausted
            error_msg = f"Certificate provisioning failed after {max_retries} attempts. Last error: {last_error}"
            logger.error(error_msg)
            return CertResponse(provisioned=False, error=error_msg)

        except Exception as e:
            logger.error(f"Unexpected error provisioning certificate: {e}")
            return CertResponse(provisioned=False, error=str(e))

    # ========================================================================
    # Tailnet Settings
    # ========================================================================

    def get_tailnet_settings(self) -> Optional[TailnetSettings]:
        """Get tailnet settings (MagicDNS, HTTPS).

        Returns:
            TailnetSettings with magic_dns and https_serve config, or None if error
        """
        try:
            # Get status JSON to check MagicDNS
            exit_code, stdout, stderr = self.exec_command("tailscale status --json")

            magic_dns_enabled = False
            magic_dns_suffix = None

            if exit_code == 0 and stdout.strip():
                status_data = json.loads(stdout)
                magic_dns_suffix = status_data.get("MagicDNSSuffix")
                magic_dns_enabled = bool(magic_dns_suffix)

            # Check if HTTPS cert support is enabled using `tailscale cert`
            https_enabled = None
            https_error = None

            exit_code, stdout, stderr = self.exec_command("tailscale cert 2>&1")
            output = stdout + stderr

            if "not enabled" in output.lower() or "not configured" in output.lower():
                https_enabled = False
                https_error = "HTTPS cert support is not enabled/configured for your tailnet"
            elif "usage:" in output.lower():
                # Got usage message - cert support is enabled but no domain specified
                https_enabled = True
            else:
                # Some other error occurred
                https_enabled = None
                https_error = output.strip() if output.strip() else "Unknown error checking HTTPS"

            return TailnetSettings(
                magic_dns={
                    "enabled": magic_dns_enabled,
                    "suffix": magic_dns_suffix,
                    "admin_url": "https://login.tailscale.com/admin/dns"
                },
                https_serve={
                    "enabled": https_enabled,
                    "error": https_error,
                    "admin_url": "https://login.tailscale.com/admin/dns"
                }
            )

        except Exception as e:
            logger.error(f"Error getting tailnet settings: {e}")
            return None


# ============================================================================
# Singleton Instance
# ============================================================================

_tailscale_manager: Optional[TailscaleManager] = None


def get_tailscale_manager() -> TailscaleManager:
    """Get singleton TailscaleManager instance.

    Returns:
        TailscaleManager instance
    """
    global _tailscale_manager
    if _tailscale_manager is None:
        _tailscale_manager = TailscaleManager()
    return _tailscale_manager
