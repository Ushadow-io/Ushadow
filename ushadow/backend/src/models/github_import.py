"""
Models for GitHub Docker Compose Import functionality.

Supports importing docker-compose files from GitHub repositories
and configuring shadow headers and environment variables.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, field_validator
import re


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


class ImportedServiceConfig(BaseModel):
    """Full configuration for an imported service."""
    service_name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    github_url: str
    compose_path: str
    shadow_header: ShadowHeaderConfig = Field(default_factory=ShadowHeaderConfig)
    env_vars: List[EnvVarConfigItem] = Field(default_factory=list)
    enabled: bool = True


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
