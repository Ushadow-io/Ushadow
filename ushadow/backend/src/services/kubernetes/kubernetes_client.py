"""Low-level Kubernetes client: kubeconfig storage, encryption, and API setup."""

import base64
import hashlib
import os
import subprocess
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from kubernetes import client, config

from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="K8s")


class KubernetesClient:
    """
    Handles kubeconfig file I/O (encrypted at rest) and creates k8s API clients.

    This is the infrastructure leaf — no DB access, no business logic.
    All other k8s services depend on this to get API clients.
    """

    def __init__(self, kubeconfig_dir: Path):
        self._kubeconfig_dir = kubeconfig_dir
        self._kubeconfig_dir.mkdir(parents=True, exist_ok=True)
        self._fernet = self._init_fernet()

    # -------------------------------------------------------------------------
    # Encryption helpers
    # -------------------------------------------------------------------------

    def _init_fernet(self) -> Fernet:
        """Initialize Fernet encryption using the application secret key."""
        from src.config.secrets import get_auth_secret_key

        try:
            secret = get_auth_secret_key().encode()
            logger.debug("Using auth secret key from get_auth_secret_key()")
        except ValueError:
            secret = b"default-secret-key"
            logger.warning("get_auth_secret_key() raised ValueError, falling back to default")
        key = hashlib.sha256(secret).digest()
        key_hash = base64.b16encode(key[:8]).decode()
        logger.debug(f"Fernet key initialized (first 8 bytes hash: {key_hash})")
        fernet_key = base64.urlsafe_b64encode(key)
        return Fernet(fernet_key)

    def encrypt_kubeconfig(self, kubeconfig_yaml: str) -> bytes:
        """Encrypt kubeconfig content for at-rest storage."""
        return self._fernet.encrypt(kubeconfig_yaml.encode())

    def decrypt_kubeconfig(self, encrypted_data: bytes) -> str:
        """Decrypt stored kubeconfig content."""
        return self._fernet.decrypt(encrypted_data).decode()

    # -------------------------------------------------------------------------
    # Kubeconfig file management
    # -------------------------------------------------------------------------

    def save_kubeconfig(self, cluster_id: str, kubeconfig_yaml: str) -> None:
        """Encrypt and persist a kubeconfig for a cluster."""
        encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
        encrypted_data = self.encrypt_kubeconfig(kubeconfig_yaml)
        encrypted_path.write_bytes(encrypted_data)
        os.chmod(encrypted_path, 0o600)

    def remove_kubeconfig(self, cluster_id: str) -> None:
        """Delete stored kubeconfig files for a cluster (both encrypted and legacy)."""
        for path in [
            self._kubeconfig_dir / f"{cluster_id}.enc",
            self._kubeconfig_dir / f"{cluster_id}.yaml",
        ]:
            if path.exists():
                path.unlink()

    def get_kubeconfig_path(self, cluster_id: str) -> Path | None:
        """
        Return the path to the kubeconfig (legacy plain YAML only).

        Returns None if only the encrypted form exists (use get_kube_client instead).
        """
        legacy = self._kubeconfig_dir / f"{cluster_id}.yaml"
        return legacy if legacy.exists() else None

    # -------------------------------------------------------------------------
    # K8s API client factory
    # -------------------------------------------------------------------------

    def get_kube_client(self, cluster_id: str) -> tuple[client.CoreV1Api, client.AppsV1Api]:
        """
        Return (CoreV1Api, AppsV1Api) for the given cluster.

        Prefers the encrypted kubeconfig; falls back to legacy plain YAML.

        Raises:
            FileNotFoundError: No kubeconfig exists for this cluster.
            ValueError: Kubeconfig could not be decrypted.
        """
        encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
        legacy_path = self._kubeconfig_dir / f"{cluster_id}.yaml"

        logger.debug(f"Looking for kubeconfig in: {self._kubeconfig_dir}")
        logger.debug(f"Encrypted path: {encrypted_path} (exists={encrypted_path.exists()})")
        logger.debug(f"Legacy path: {legacy_path} (exists={legacy_path.exists()})")

        if encrypted_path.exists():
            try:
                logger.debug(f"Reading encrypted kubeconfig from {encrypted_path}")
                encrypted_data = encrypted_path.read_bytes()
                logger.debug(f"Encrypted data size: {len(encrypted_data)} bytes")
                is_fernet = encrypted_data.startswith(b'gAAAAAA')
                logger.debug(f"Data appears to be Fernet-encrypted: {is_fernet}")
                kubeconfig_yaml = self.decrypt_kubeconfig(encrypted_data)
                logger.debug(f"Successfully decrypted kubeconfig ({len(kubeconfig_yaml)} chars)")
            except InvalidToken as e:
                logger.error(
                    f"Failed to decrypt kubeconfig - InvalidToken. "
                    f"Cluster: {cluster_id}, Data size: {len(encrypted_data)} bytes, "
                    f"Error: {str(e) or '(empty error message)'}"
                )
                raise ValueError(f"Failed to decrypt kubeconfig for cluster {cluster_id}") from e
            except Exception as e:
                logger.error(f"Failed to decrypt kubeconfig - {type(e).__name__}: {e}")
                raise ValueError(f"Failed to decrypt kubeconfig for cluster {cluster_id}: {e}") from e

            temp_path = self._kubeconfig_dir / f".tmp_{cluster_id}.yaml"
            temp_path.write_text(kubeconfig_yaml)
            os.chmod(temp_path, 0o600)
            try:
                logger.debug(f"Loading kubeconfig from temp file: {temp_path}")
                config.load_kube_config(config_file=str(temp_path))
                logger.debug(f"Successfully loaded kubeconfig for cluster {cluster_id}")
                return client.CoreV1Api(), client.AppsV1Api()
            finally:
                if temp_path.exists():
                    temp_path.unlink()

        elif legacy_path.exists():
            logger.warning(f"Using unencrypted kubeconfig for cluster {cluster_id}")
            config.load_kube_config(config_file=str(legacy_path))
            return client.CoreV1Api(), client.AppsV1Api()

        else:
            logger.error(f"Kubeconfig not found - checked: {encrypted_path}, {legacy_path}")
            raise FileNotFoundError(f"Kubeconfig not found for cluster {cluster_id}")

    def get_kubeconfig_file_for_subprocess(self, cluster_id: str) -> tuple[str, Path | None]:
        """
        Resolve a kubeconfig file path suitable for passing to subprocesses (helm, kubectl).

        Returns:
            (kubeconfig_file_path, temp_path_or_None)
            Caller must delete temp_path when done.

        Raises:
            FileNotFoundError: No kubeconfig exists for this cluster.
        """
        encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
        legacy_path = self._kubeconfig_dir / f"{cluster_id}.yaml"

        if encrypted_path.exists():
            kubeconfig_yaml = self.decrypt_kubeconfig(encrypted_path.read_bytes())
            temp_path = self._kubeconfig_dir / f".tmp_sub_{cluster_id}.yaml"
            temp_path.write_text(kubeconfig_yaml)
            os.chmod(temp_path, 0o600)
            return str(temp_path), temp_path

        if legacy_path.exists():
            return str(legacy_path), None

        raise FileNotFoundError(f"Kubeconfig not found for cluster {cluster_id}")

    # -------------------------------------------------------------------------
    # kubectl wrapper
    # -------------------------------------------------------------------------

    async def run_kubectl_command(self, cluster_id: str, command: str) -> str:
        """
        Run a kubectl command against a cluster.

        Args:
            cluster_id: The cluster to target.
            command: kubectl args (without the 'kubectl' prefix).

        Returns:
            Command stdout.

        Raises:
            FileNotFoundError: Kubeconfig not found.
            Exception: kubectl exited non-zero.
        """
        kubeconfig_file, temp_path = self.get_kubeconfig_file_for_subprocess(cluster_id)
        try:
            cmd = f"kubectl --kubeconfig={kubeconfig_file} {command}"
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            logger.error(f"kubectl command failed: {e.stderr}")
            raise Exception(f"kubectl command failed: {e.stderr}") from e
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink()
