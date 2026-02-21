"""Kubernetes DNS management service with cert-manager support."""

import logging
import tempfile
import yaml
from typing import Optional, List, Dict, Tuple
from pathlib import Path

from src.models.kubernetes_dns import (
    DNSConfig,
    DNSMapping,
    DNSStatus,
    DNSServiceMapping,
    CertificateStatus,
)

logger = logging.getLogger(__name__)


class KubernetesDNSManager:
    """Manages CoreDNS configuration and TLS certificates for Kubernetes services."""

    def __init__(self, kubectl_runner):
        """
        Initialize DNS manager.

        Args:
            kubectl_runner: Function to run kubectl commands
        """
        self.kubectl = kubectl_runner

    async def get_dns_status(self, cluster_id: str, config: Optional[DNSConfig] = None) -> DNSStatus:
        """Get current DNS configuration status."""
        try:
            # Get CoreDNS IP
            coredns_ip = await self._get_coredns_ip()

            # Get Ingress IP
            ingress_ip = await self._get_ingress_ip(
                config.ingress_namespace if config else "ingress-nginx"
            )

            # Check if cert-manager is installed
            cert_manager_installed = await self._is_cert_manager_installed()

            # Check if DNS is configured
            configured = False
            domain = None
            mappings = []

            if config:
                # Check if ConfigMap exists
                configmap_name = config.dns_configmap_name
                namespace = config.coredns_namespace

                hosts_content = await self._get_dns_configmap_content(
                    configmap_name, namespace, config.hosts_filename
                )

                if hosts_content:
                    configured = True
                    domain = config.domain
                    mappings = self._parse_hosts_file(hosts_content, config.domain)

            return DNSStatus(
                configured=configured,
                domain=domain,
                coredns_ip=coredns_ip,
                ingress_ip=ingress_ip,
                cert_manager_installed=cert_manager_installed,
                mappings=mappings,
                total_services=len(mappings)
            )

        except Exception as e:
            logger.error(f"Error getting DNS status: {e}")
            return DNSStatus(configured=False)

    async def setup_dns_system(
        self,
        cluster_id: str,
        config: DNSConfig,
        install_cert_manager: bool = True
    ) -> Tuple[bool, Optional[str]]:
        """
        Setup DNS system on cluster.

        Returns: (success, error_message)
        """
        try:
            # 1. Install cert-manager if requested
            if install_cert_manager:
                success, error = await self._install_cert_manager()
                if not success:
                    return False, f"Failed to install cert-manager: {error}"

            # 2. Create ClusterIssuer for Let's Encrypt
            if config.acme_email:
                success, error = await self._create_cert_issuer(
                    config.cert_issuer,
                    config.acme_email
                )
                if not success:
                    return False, f"Failed to create cert issuer: {error}"

            # 3. Create DNS ConfigMap (empty initially)
            success, error = await self._create_dns_configmap(config)
            if not success:
                return False, f"Failed to create DNS ConfigMap: {error}"

            # 4. Patch CoreDNS Corefile
            success, error = await self._patch_coredns_config(config)
            if not success:
                return False, f"Failed to patch CoreDNS config: {error}"

            # 5. Patch CoreDNS Deployment
            success, error = await self._patch_coredns_deployment(config)
            if not success:
                return False, f"Failed to patch CoreDNS deployment: {error}"

            logger.info(f"DNS system setup complete for cluster {cluster_id}")
            return True, None

        except Exception as e:
            logger.error(f"Error setting up DNS system: {e}")
            return False, str(e)

    async def add_service_dns(
        self,
        cluster_id: str,
        config: DNSConfig,
        mapping: DNSServiceMapping
    ) -> Tuple[bool, Optional[str]]:
        """
        Add DNS entry for a service and create Ingress with optional TLS.

        Returns: (success, error_message)
        """
        try:
            # 1. Get service IP or ingress IP
            if mapping.use_ingress:
                ip = await self._get_ingress_ip(config.ingress_namespace)
                if not ip:
                    return False, "Ingress controller not found"
            else:
                ip = await self._get_service_ip(mapping.service_name, mapping.namespace)
                if not ip:
                    return False, f"Service {mapping.service_name} not found"

            # 2. Update DNS ConfigMap
            success, error = await self._add_dns_mapping(
                config, ip, mapping.shortnames
            )
            if not success:
                return False, f"Failed to add DNS mapping: {error}"

            # 3. Create Ingress resource
            success, error = await self._create_ingress(
                config, mapping
            )
            if not success:
                return False, f"Failed to create Ingress: {error}"

            logger.info(f"Added DNS for service {mapping.service_name}")
            return True, None

        except Exception as e:
            logger.error(f"Error adding service DNS: {e}")
            return False, str(e)

    async def remove_service_dns(
        self,
        cluster_id: str,
        config: DNSConfig,
        service_name: str,
        namespace: str
    ) -> Tuple[bool, Optional[str]]:
        """Remove DNS entry and Ingress for a service."""
        try:
            # 1. Remove from DNS ConfigMap
            success, error = await self._remove_dns_mapping(config, service_name)
            if not success:
                logger.warning(f"Failed to remove DNS mapping: {error}")

            # 2. Delete Ingress
            ingress_name = f"{service_name}-ingress"
            await self.kubectl(
                f"delete ingress {ingress_name} -n {namespace} --ignore-not-found=true"
            )

            logger.info(f"Removed DNS for service {service_name}")
            return True, None

        except Exception as e:
            logger.error(f"Error removing service DNS: {e}")
            return False, str(e)

    async def list_certificates(
        self,
        cluster_id: str,
        namespace: Optional[str] = None
    ) -> List[CertificateStatus]:
        """List TLS certificates managed by cert-manager."""
        try:
            cmd = "get certificates -o json"
            if namespace:
                cmd += f" -n {namespace}"
            else:
                cmd += " -A"

            result = await self.kubectl(cmd)
            certs_data = yaml.safe_load(result)

            certificates = []
            for cert in certs_data.get("items", []):
                metadata = cert.get("metadata", {})
                spec = cert.get("spec", {})
                status = cert.get("status", {})

                conditions = status.get("conditions", [])
                ready = any(
                    c.get("type") == "Ready" and c.get("status") == "True"
                    for c in conditions
                )

                certificates.append(CertificateStatus(
                    name=metadata.get("name"),
                    namespace=metadata.get("namespace"),
                    ready=ready,
                    secret_name=spec.get("secretName"),
                    issuer_name=spec.get("issuerRef", {}).get("name"),
                    dns_names=spec.get("dnsNames", []),
                    not_before=status.get("notBefore"),
                    not_after=status.get("notAfter"),
                    renewal_time=status.get("renewalTime")
                ))

            return certificates

        except Exception as e:
            logger.error(f"Error listing certificates: {e}")
            return []

    # Private helper methods

    async def _get_coredns_ip(self) -> Optional[str]:
        """Get CoreDNS service IP."""
        try:
            result = await self.kubectl(
                "get svc kube-dns -n kube-system -o jsonpath='{.spec.clusterIP}'"
            )
            return result.strip() if result else None
        except Exception as e:
            logger.error(f"Error getting CoreDNS IP: {e}")
            return None

    async def _get_ingress_ip(self, namespace: str) -> Optional[str]:
        """Get Ingress controller IP."""
        try:
            result = await self.kubectl(
                f"get svc ingress-nginx-controller -n {namespace} "
                "-o jsonpath='{.spec.clusterIP}'"
            )
            return result.strip() if result else None
        except Exception as e:
            logger.error(f"Error getting Ingress IP: {e}")
            return None

    async def _get_service_ip(self, service: str, namespace: str) -> Optional[str]:
        """Get service IP (LoadBalancer or ClusterIP)."""
        try:
            # Try LoadBalancer IP first
            result = await self.kubectl(
                f"get svc {service} -n {namespace} "
                "-o jsonpath='{.status.loadBalancer.ingress[0].ip}'"
            )
            if result and result.strip() and result.strip() != "None":
                return result.strip()

            # Fall back to ClusterIP
            result = await self.kubectl(
                f"get svc {service} -n {namespace} "
                "-o jsonpath='{.spec.clusterIP}'"
            )
            return result.strip() if result else None
        except Exception as e:
            logger.error(f"Error getting service IP: {e}")
            return None

    async def _is_cert_manager_installed(self) -> bool:
        """Check if cert-manager is installed."""
        try:
            result = await self.kubectl("get namespace cert-manager")
            return "cert-manager" in result
        except:
            return False

    async def _install_cert_manager(self) -> Tuple[bool, Optional[str]]:
        """Install cert-manager using official manifest."""
        try:
            logger.info("Installing cert-manager...")

            # Install cert-manager CRDs and components
            cert_manager_version = "v1.14.2"  # Latest stable
            manifest_url = (
                f"https://github.com/cert-manager/cert-manager/releases/download/"
                f"{cert_manager_version}/cert-manager.yaml"
            )

            await self.kubectl(f"apply -f {manifest_url}")

            # Wait for cert-manager to be ready
            await self.kubectl(
                "wait --for=condition=available --timeout=300s "
                "deployment/cert-manager -n cert-manager"
            )

            logger.info("cert-manager installed successfully")
            return True, None

        except Exception as e:
            logger.error(f"Error installing cert-manager: {e}")
            return False, str(e)

    async def _create_cert_issuer(
        self,
        issuer_name: str,
        email: str
    ) -> Tuple[bool, Optional[str]]:
        """Create Let's Encrypt ClusterIssuer."""
        try:
            issuer_yaml = f"""
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: {issuer_name}
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: {email}
    privateKeySecretRef:
      name: {issuer_name}
    solvers:
    - http01:
        ingress:
          class: nginx
"""

            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                f.write(issuer_yaml)
                temp_file = f.name

            try:
                await self.kubectl(f"apply -f {temp_file}")
                return True, None
            finally:
                Path(temp_file).unlink()

        except Exception as e:
            logger.error(f"Error creating cert issuer: {e}")
            return False, str(e)

    async def _get_dns_configmap_content(
        self,
        configmap_name: str,
        namespace: str,
        filename: str
    ) -> Optional[str]:
        """Get DNS ConfigMap content."""
        try:
            result = await self.kubectl(
                f"get configmap {configmap_name} -n {namespace} "
                f"-o jsonpath='{{.data.{filename}}}'"
            )
            return result if result else None
        except:
            return None

    def _parse_hosts_file(self, content: str, domain: str) -> List[DNSMapping]:
        """Parse hosts file into DNS mappings."""
        mappings = []

        for line in content.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            parts = line.split()
            if len(parts) >= 2:
                ip = parts[0]
                fqdn = parts[1]
                shortnames = parts[2:] if len(parts) > 2 else []

                mappings.append(DNSMapping(
                    ip=ip,
                    fqdn=fqdn,
                    shortnames=shortnames,
                    has_tls=False,  # TODO: Check for certificate
                    cert_ready=False
                ))

        return mappings

    async def _create_dns_configmap(self, config: DNSConfig) -> Tuple[bool, Optional[str]]:
        """Create DNS ConfigMap."""
        try:
            initial_content = f"# {config.domain} DNS Mappings\n# Managed by Ushadow\n"

            with tempfile.NamedTemporaryFile(mode='w', suffix='.hosts', delete=False) as f:
                f.write(initial_content)
                temp_file = f.name

            try:
                await self.kubectl(
                    f"create configmap {config.dns_configmap_name} "
                    f"--from-file={config.hosts_filename}={temp_file} "
                    f"--namespace={config.coredns_namespace} "
                    "--dry-run=client -o yaml | kubectl apply -f -"
                )
                return True, None
            finally:
                Path(temp_file).unlink()

        except Exception as e:
            logger.error(f"Error creating DNS ConfigMap: {e}")
            return False, str(e)

    async def _patch_coredns_config(self, config: DNSConfig) -> Tuple[bool, Optional[str]]:
        """Patch CoreDNS Corefile to include hosts plugin."""
        try:
            # Get current Corefile
            result = await self.kubectl(
                f"get configmap coredns -n {config.coredns_namespace} "
                "-o jsonpath='{.data.Corefile}'"
            )

            if not result:
                return False, "CoreDNS Corefile not found"

            corefile = result

            # Check if already patched
            hosts_line = f"hosts /etc/custom-hosts/{config.hosts_filename}"
            if hosts_line in corefile:
                logger.info("CoreDNS already configured")
                return True, None

            # Insert after 'ready'
            lines = corefile.split('\n')
            new_lines = []

            for line in lines:
                new_lines.append(line)
                if line.strip() == 'ready':
                    new_lines.extend([
                        f"    hosts /etc/custom-hosts/{config.hosts_filename} {{",
                        "        fallthrough",
                        "    }"
                    ])

            new_corefile = '\n'.join(new_lines)

            # Create ConfigMap YAML
            configmap = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {
                    "name": "coredns",
                    "namespace": config.coredns_namespace
                },
                "data": {
                    "Corefile": new_corefile
                }
            }

            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                yaml.dump(configmap, f)
                temp_file = f.name

            try:
                await self.kubectl(f"apply -f {temp_file}")
                logger.info("CoreDNS Corefile patched")
                return True, None
            finally:
                Path(temp_file).unlink()

        except Exception as e:
            logger.error(f"Error patching CoreDNS config: {e}")
            return False, str(e)

    async def _patch_coredns_deployment(self, config: DNSConfig) -> Tuple[bool, Optional[str]]:
        """Mount DNS ConfigMap in CoreDNS deployment."""
        try:
            # Get current deployment
            result = await self.kubectl(
                f"get deployment coredns -n {config.coredns_namespace} -o json"
            )

            deployment = yaml.safe_load(result)

            # Check if already configured
            volumes = deployment["spec"]["template"]["spec"].get("volumes", [])
            if any(v.get("name") == "custom-hosts" for v in volumes):
                logger.info("CoreDNS deployment already configured")
                return True, None

            # Add volume
            volumes.append({
                "name": "custom-hosts",
                "configMap": {
                    "name": config.dns_configmap_name
                }
            })
            deployment["spec"]["template"]["spec"]["volumes"] = volumes

            # Add volume mount
            containers = deployment["spec"]["template"]["spec"]["containers"]
            for container in containers:
                if container["name"] == "coredns":
                    if "volumeMounts" not in container:
                        container["volumeMounts"] = []
                    container["volumeMounts"].append({
                        "name": "custom-hosts",
                        "mountPath": "/etc/custom-hosts",
                        "readOnly": True
                    })

            # Apply
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                yaml.dump(deployment, f)
                temp_file = f.name

            try:
                await self.kubectl(f"apply -f {temp_file}")
                logger.info("CoreDNS deployment patched")
                return True, None
            finally:
                Path(temp_file).unlink()

        except Exception as e:
            logger.error(f"Error patching CoreDNS deployment: {e}")
            return False, str(e)

    async def _add_dns_mapping(
        self,
        config: DNSConfig,
        ip: str,
        shortnames: List[str]
    ) -> Tuple[bool, Optional[str]]:
        """Add DNS mapping to ConfigMap."""
        try:
            # Get current content
            current = await self._get_dns_configmap_content(
                config.dns_configmap_name,
                config.coredns_namespace,
                config.hosts_filename
            ) or ""

            # Remove existing entries for this FQDN
            fqdn = f"{shortnames[0]}.{config.domain}"
            lines = [
                line for line in current.split('\n')
                if fqdn not in line
            ]

            # Add new entry
            all_names = [fqdn] + shortnames
            new_line = f"{ip}  {' '.join(all_names)}"
            lines.append(new_line)

            new_content = '\n'.join(lines)

            # Update ConfigMap
            with tempfile.NamedTemporaryFile(mode='w', suffix='.hosts', delete=False) as f:
                f.write(new_content)
                temp_file = f.name

            try:
                await self.kubectl(
                    f"create configmap {config.dns_configmap_name} "
                    f"--from-file={config.hosts_filename}={temp_file} "
                    f"--namespace={config.coredns_namespace} "
                    "--dry-run=client -o yaml | kubectl apply -f -"
                )
                return True, None
            finally:
                Path(temp_file).unlink()

        except Exception as e:
            logger.error(f"Error adding DNS mapping: {e}")
            return False, str(e)

    async def _remove_dns_mapping(
        self,
        config: DNSConfig,
        service_name: str
    ) -> Tuple[bool, Optional[str]]:
        """Remove DNS mapping from ConfigMap."""
        try:
            # Get current content
            current = await self._get_dns_configmap_content(
                config.dns_configmap_name,
                config.coredns_namespace,
                config.hosts_filename
            ) or ""

            # Remove lines containing service name
            lines = [
                line for line in current.split('\n')
                if service_name not in line
            ]

            new_content = '\n'.join(lines)

            # Update ConfigMap
            with tempfile.NamedTemporaryFile(mode='w', suffix='.hosts', delete=False) as f:
                f.write(new_content)
                temp_file = f.name

            try:
                await self.kubectl(
                    f"create configmap {config.dns_configmap_name} "
                    f"--from-file={config.hosts_filename}={temp_file} "
                    f"--namespace={config.coredns_namespace} "
                    "--dry-run=client -o yaml | kubectl apply -f -"
                )
                return True, None
            finally:
                Path(temp_file).unlink()

        except Exception as e:
            logger.error(f"Error removing DNS mapping: {e}")
            return False, str(e)

    async def _create_ingress(
        self,
        config: DNSConfig,
        mapping: DNSServiceMapping
    ) -> Tuple[bool, Optional[str]]:
        """Create Ingress resource with optional TLS."""
        try:
            ingress_name = f"{mapping.service_name}-ingress"
            fqdn = f"{mapping.shortnames[0]}.{config.domain}"

            # Build host rules
            hosts = [fqdn] + mapping.shortnames
            rules = []

            for host in hosts:
                rules.append({
                    "host": host,
                    "http": {
                        "paths": [{
                            "path": "/",
                            "pathType": "Prefix",
                            "backend": {
                                "service": {
                                    "name": mapping.service_name,
                                    "port": {
                                        "number": mapping.service_port or 80
                                    }
                                }
                            }
                        }]
                    }
                })

            ingress = {
                "apiVersion": "networking.k8s.io/v1",
                "kind": "Ingress",
                "metadata": {
                    "name": ingress_name,
                    "namespace": mapping.namespace,
                    "annotations": {
                        "nginx.ingress.kubernetes.io/rewrite-target": "/"
                    }
                },
                "spec": {
                    "ingressClassName": "nginx",
                    "rules": rules
                }
            }

            # Add TLS if enabled
            if mapping.enable_tls and config.acme_email:
                ingress["metadata"]["annotations"]["cert-manager.io/cluster-issuer"] = config.cert_issuer
                ingress["spec"]["tls"] = [{
                    "hosts": hosts,
                    "secretName": f"{mapping.service_name}-tls"
                }]

            # Apply Ingress
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                yaml.dump(ingress, f)
                temp_file = f.name

            try:
                await self.kubectl(f"apply -f {temp_file}")
                logger.info(f"Created Ingress {ingress_name}")
                return True, None
            finally:
                Path(temp_file).unlink()

        except Exception as e:
            logger.error(f"Error creating Ingress: {e}")
            return False, str(e)
