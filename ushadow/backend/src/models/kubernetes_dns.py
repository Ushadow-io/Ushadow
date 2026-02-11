"""Kubernetes DNS management models."""

from typing import List, Optional
from pydantic import BaseModel, Field


class DNSServiceMapping(BaseModel):
    """DNS mapping for a Kubernetes service."""
    service_name: str = Field(..., description="Kubernetes service name")
    namespace: str = Field(default="default", description="Kubernetes namespace")
    shortnames: List[str] = Field(..., description="DNS shortnames (e.g., ['ushadow', 'app'])")
    use_ingress: bool = Field(default=True, description="Use Ingress Controller IP instead of service IP")
    enable_tls: bool = Field(default=True, description="Enable TLS certificates for this service")
    service_port: Optional[int] = Field(None, description="Service port (required if not using ingress)")


class DNSConfig(BaseModel):
    """DNS configuration for a cluster."""
    cluster_id: str
    domain: str = Field(..., description="Custom DNS domain (e.g., 'chakra', 'mycompany')")
    coredns_namespace: str = Field(default="kube-system", description="CoreDNS namespace")
    dns_configmap_name: str = Field(default="custom-dns-hosts", description="DNS ConfigMap name")
    hosts_filename: str = Field(default="custom.hosts", description="Hosts file name in ConfigMap")
    ingress_namespace: str = Field(default="ingress-nginx", description="Ingress controller namespace")
    ingress_service_name: str = Field(default="ingress-nginx-controller", description="Ingress service name")
    cert_issuer: str = Field(default="letsencrypt-prod", description="cert-manager ClusterIssuer name")
    acme_email: Optional[str] = Field(None, description="Email for Let's Encrypt certificates")


class DNSSetupRequest(BaseModel):
    """Request to setup DNS for a cluster."""
    domain: str = Field(..., description="Custom DNS domain")
    acme_email: Optional[str] = Field(None, description="Email for Let's Encrypt")
    install_cert_manager: bool = Field(default=True, description="Install cert-manager if not present")


class DNSMapping(BaseModel):
    """Current DNS mapping."""
    ip: str
    fqdn: str
    shortnames: List[str]
    has_tls: bool = False
    cert_ready: bool = False


class DNSStatus(BaseModel):
    """DNS system status."""
    configured: bool = Field(default=False, description="DNS system is configured")
    domain: Optional[str] = Field(None, description="Configured domain")
    coredns_ip: Optional[str] = Field(None, description="CoreDNS service IP")
    ingress_ip: Optional[str] = Field(None, description="Ingress controller IP")
    cert_manager_installed: bool = Field(default=False, description="cert-manager is installed")
    mappings: List[DNSMapping] = Field(default_factory=list, description="Current DNS mappings")
    total_services: int = Field(default=0, description="Total services with DNS")


class AddServiceDNSRequest(BaseModel):
    """Request to add a service to DNS."""
    service_name: str
    namespace: str = "default"
    shortnames: List[str]
    use_ingress: bool = True
    enable_tls: bool = True
    service_port: Optional[int] = None


class CertificateStatus(BaseModel):
    """TLS certificate status."""
    name: str
    namespace: str
    ready: bool
    secret_name: str
    issuer_name: str
    dns_names: List[str]
    not_before: Optional[str] = None
    not_after: Optional[str] = None
    renewal_time: Optional[str] = None
