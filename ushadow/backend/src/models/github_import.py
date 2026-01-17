"""
Models for Docker Import functionality.

Supports importing docker-compose files from:
- GitHub repositories
- Docker Hub images

And configuring shadow headers and environment variables.
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field, field_validator
import re


# =============================================================================
# Import Source Types
# =============================================================================

ImportSourceType = Literal["github", "dockerhub"]


class DockerHubImageInfo(BaseModel):
    """Parsed Docker Hub URL information."""
    namespace: str  # e.g., "fishaudio" or "library" for official images
    repository: str  # e.g., "fish-speech"
    tag: str = "latest"

    @property
    def full_image_name(self) -> str:
        """Get full Docker image name."""
        if self.namespace == "library":
            # Official images don't need namespace prefix
            return f"{self.repository}:{self.tag}"
        return f"{self.namespace}/{self.repository}:{self.tag}"

    @property
    def api_url(self) -> str:
        """Get Docker Hub API URL for image info."""
        return f"https://hub.docker.com/v2/repositories/{self.namespace}/{self.repository}"

    @property
    def tags_url(self) -> str:
        """Get Docker Hub API URL for tags."""
        return f"https://hub.docker.com/v2/repositories/{self.namespace}/{self.repository}/tags"


class GitHubUrlInfo(BaseModel):
    """Parsed GitHub URL information."""
    owner: str
    repo: str
    branch: str = "main"
    path: str = ""

    @property
    def api_url(self) -> str:
        """Get GitHub API URL for contents."""
        if self.path:
            return f"https://api.github.com/repos/{self.owner}/{self.repo}/contents/{self.path}?ref={self.branch}"
        return f"https://api.github.com/repos/{self.owner}/{self.repo}/contents?ref={self.branch}"

    @property
    def raw_url(self) -> str:
        """Get raw GitHub URL for file content."""
        if self.path:
            return f"https://raw.githubusercontent.com/{self.owner}/{self.repo}/{self.branch}/{self.path}"
        return f"https://raw.githubusercontent.com/{self.owner}/{self.repo}/{self.branch}"


class GitHubImportRequest(BaseModel):
    """Request to import from a GitHub URL."""
    github_url: str = Field(..., description="GitHub repository or file URL")
    branch: Optional[str] = Field(None, description="Branch to use (defaults to main/master)")
    compose_path: Optional[str] = Field(None, description="Path to docker-compose file if not auto-detected")

    @field_validator('github_url')
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        """Validate that the URL is a GitHub URL."""
        if not v:
            raise ValueError("GitHub URL is required")
        if not ('github.com' in v or 'raw.githubusercontent.com' in v):
            raise ValueError("URL must be a GitHub URL")
        return v


class DetectedComposeFile(BaseModel):
    """A docker-compose file detected in the repository."""
    path: str
    name: str
    download_url: str
    size: int = 0


class ComposeEnvVarInfo(BaseModel):
    """Environment variable extracted from compose file."""
    name: str
    has_default: bool = False
    default_value: Optional[str] = None
    is_required: bool = True
    description: Optional[str] = None


class ComposeServiceInfo(BaseModel):
    """Service information extracted from compose file."""
    name: str
    image: Optional[str] = None
    ports: List[Dict[str, Any]] = Field(default_factory=list)
    environment: List[ComposeEnvVarInfo] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list)
    volumes: List[str] = Field(default_factory=list)
    networks: List[str] = Field(default_factory=list)
    command: Optional[str] = None
    healthcheck: Optional[Dict[str, Any]] = None


class ShadowHeaderConfig(BaseModel):
    """Configuration for shadow header routing."""
    enabled: bool = True
    header_name: str = Field(default="X-Shadow-Service", description="Header name for service identification")
    header_value: Optional[str] = Field(None, description="Header value (defaults to service name)")
    route_path: Optional[str] = Field(None, description="Tailscale Serve route path (e.g., /myservice)")


class EnvVarConfigItem(BaseModel):
    """Configuration for a single environment variable."""
    name: str
    source: str = "literal"  # "literal", "setting", "default"
    value: Optional[str] = None
    setting_path: Optional[str] = None
    is_secret: bool = False


class PortConfig(BaseModel):
    """Configuration for a port mapping."""
    host_port: int
    container_port: int
    protocol: str = "tcp"


class VolumeConfig(BaseModel):
    """Configuration for a volume mount."""
    name: str
    container_path: str
    is_named_volume: bool = True  # True for named volumes, False for bind mounts


class ImportedServiceConfig(BaseModel):
    """Full configuration for an imported service."""
    service_name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    # Source can be GitHub or Docker Hub
    source_type: ImportSourceType = "github"
    source_url: str  # GitHub URL or Docker Hub URL
    # For GitHub imports
    compose_path: Optional[str] = None
    # For Docker Hub imports
    docker_image: Optional[str] = None
    ports: List[PortConfig] = Field(default_factory=list)
    volumes: List[VolumeConfig] = Field(default_factory=list)
    # Common config
    shadow_header: ShadowHeaderConfig = Field(default_factory=ShadowHeaderConfig)
    env_vars: List[EnvVarConfigItem] = Field(default_factory=list)
    enabled: bool = True

    # Backwards compatibility
    @property
    def github_url(self) -> str:
        return self.source_url


class GitHubScanResponse(BaseModel):
    """Response from scanning a GitHub repository."""
    success: bool
    github_info: Optional[GitHubUrlInfo] = None
    compose_files: List[DetectedComposeFile] = Field(default_factory=list)
    message: Optional[str] = None
    error: Optional[str] = None


class ComposeParseResponse(BaseModel):
    """Response from parsing a docker-compose file."""
    success: bool
    compose_path: str
    services: List[ComposeServiceInfo] = Field(default_factory=list)
    networks: List[str] = Field(default_factory=list)
    volumes: List[str] = Field(default_factory=list)
    message: Optional[str] = None
    error: Optional[str] = None


class ImportServiceRequest(BaseModel):
    """Request to import and register a service from GitHub."""
    github_url: str
    compose_path: str
    service_name: str
    config: ImportedServiceConfig


class ImportServiceResponse(BaseModel):
    """Response from importing a service."""
    success: bool
    service_id: Optional[str] = None
    service_name: Optional[str] = None
    message: str
    compose_file_path: Optional[str] = None


def parse_github_url(url: str) -> GitHubUrlInfo:
    """
    Parse a GitHub URL into its components.

    Supports:
    - https://github.com/owner/repo
    - https://github.com/owner/repo/tree/branch
    - https://github.com/owner/repo/tree/branch/path/to/dir
    - https://github.com/owner/repo/blob/branch/path/to/file
    - https://raw.githubusercontent.com/owner/repo/branch/path/to/file
    """
    url = url.strip()

    # Handle raw.githubusercontent.com URLs
    raw_match = re.match(
        r'https?://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)(?:/(.+))?',
        url
    )
    if raw_match:
        owner, repo, branch, path = raw_match.groups()
        return GitHubUrlInfo(
            owner=owner,
            repo=repo,
            branch=branch,
            path=path or ""
        )

    # Handle github.com URLs
    github_match = re.match(
        r'https?://github\.com/([^/]+)/([^/]+)(?:/(tree|blob)/([^/]+)(?:/(.+))?)?(?:\.git)?',
        url
    )
    if github_match:
        owner, repo, url_type, branch, path = github_match.groups()
        # Remove .git suffix if present
        repo = repo.replace('.git', '')
        return GitHubUrlInfo(
            owner=owner,
            repo=repo,
            branch=branch or "main",
            path=path or ""
        )

    # Simple github.com/owner/repo pattern
    simple_match = re.match(
        r'https?://github\.com/([^/]+)/([^/]+)/?$',
        url
    )
    if simple_match:
        owner, repo = simple_match.groups()
        repo = repo.replace('.git', '')
        return GitHubUrlInfo(
            owner=owner,
            repo=repo,
            branch="main",
            path=""
        )

    raise ValueError(f"Could not parse GitHub URL: {url}")


def parse_dockerhub_url(url: str) -> DockerHubImageInfo:
    """
    Parse a Docker Hub URL into its components.

    Supports:
    - https://hub.docker.com/r/namespace/repository
    - https://hub.docker.com/r/namespace/repository/tags
    - https://hub.docker.com/_/official-image (official images)
    - namespace/repository (direct image reference)
    - namespace/repository:tag
    """
    url = url.strip()

    # Handle hub.docker.com URLs
    dockerhub_match = re.match(
        r'https?://hub\.docker\.com/r/([^/]+)/([^/]+)(?:/tags)?/?$',
        url
    )
    if dockerhub_match:
        namespace, repository = dockerhub_match.groups()
        return DockerHubImageInfo(
            namespace=namespace,
            repository=repository,
            tag="latest"
        )

    # Handle official images: https://hub.docker.com/_/image-name
    official_match = re.match(
        r'https?://hub\.docker\.com/_/([^/]+)/?$',
        url
    )
    if official_match:
        repository = official_match.group(1)
        return DockerHubImageInfo(
            namespace="library",
            repository=repository,
            tag="latest"
        )

    # Handle direct image reference: namespace/repository:tag
    direct_match = re.match(
        r'^([^/:]+)/([^/:]+)(?::([^/]+))?$',
        url
    )
    if direct_match:
        namespace, repository, tag = direct_match.groups()
        return DockerHubImageInfo(
            namespace=namespace,
            repository=repository,
            tag=tag or "latest"
        )

    # Handle official image direct reference: image-name:tag
    official_direct_match = re.match(
        r'^([^/:]+)(?::([^/]+))?$',
        url
    )
    if official_direct_match:
        repository, tag = official_direct_match.groups()
        return DockerHubImageInfo(
            namespace="library",
            repository=repository,
            tag=tag or "latest"
        )

    raise ValueError(f"Could not parse Docker Hub URL: {url}")


def detect_import_source(url: str) -> ImportSourceType:
    """Detect whether a URL is GitHub or Docker Hub."""
    url = url.strip().lower()
    if 'github.com' in url or 'raw.githubusercontent.com' in url:
        return "github"
    if 'hub.docker.com' in url or 'docker.io' in url:
        return "dockerhub"
    # Check if it looks like a docker image reference (namespace/repo or repo:tag)
    if re.match(r'^[a-z0-9_-]+/[a-z0-9_-]+(?::[a-z0-9._-]+)?$', url):
        return "dockerhub"
    if re.match(r'^[a-z0-9_-]+(?::[a-z0-9._-]+)?$', url):
        return "dockerhub"
    # Default to github for URLs
    if url.startswith('http'):
        return "github"
    return "dockerhub"


class DockerHubScanResponse(BaseModel):
    """Response from scanning a Docker Hub image."""
    success: bool
    image_info: Optional[DockerHubImageInfo] = None
    description: Optional[str] = None
    stars: int = 0
    pulls: int = 0
    available_tags: List[str] = Field(default_factory=list)
    message: Optional[str] = None
    error: Optional[str] = None


class DockerHubImportRequest(BaseModel):
    """Request to import from Docker Hub."""
    dockerhub_url: str = Field(..., description="Docker Hub URL or image reference")
    tag: Optional[str] = Field(None, description="Image tag (defaults to latest)")

    @field_validator('dockerhub_url')
    @classmethod
    def validate_dockerhub_url(cls, v: str) -> str:
        """Validate the Docker Hub URL or image reference."""
        if not v:
            raise ValueError("Docker Hub URL or image reference is required")
        return v


class UnifiedImportRequest(BaseModel):
    """Unified request for importing from any supported source."""
    url: str = Field(..., description="GitHub URL, Docker Hub URL, or image reference")
    branch: Optional[str] = Field(None, description="Branch for GitHub (defaults to main)")
    tag: Optional[str] = Field(None, description="Tag for Docker Hub (defaults to latest)")
    compose_path: Optional[str] = Field(None, description="Path to docker-compose file if not auto-detected")


class UnifiedScanResponse(BaseModel):
    """Unified response from scanning any import source."""
    success: bool
    source_type: ImportSourceType
    # GitHub-specific
    github_info: Optional[GitHubUrlInfo] = None
    compose_files: List[DetectedComposeFile] = Field(default_factory=list)
    # Docker Hub-specific
    dockerhub_info: Optional[DockerHubImageInfo] = None
    available_tags: List[str] = Field(default_factory=list)
    image_description: Optional[str] = None
    # Common
    message: Optional[str] = None
    error: Optional[str] = None
