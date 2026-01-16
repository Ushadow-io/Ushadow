"""
GitHub Docker Compose Import Router.

Provides endpoints for:
- Scanning GitHub repositories for docker-compose files
- Parsing compose files and extracting service/env info
- Importing and registering services with shadow header configuration
"""

import logging
import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends
from ruamel.yaml import YAML

from src.models.github_import import (
    GitHubImportRequest,
    GitHubScanResponse,
    GitHubUrlInfo,
    DetectedComposeFile,
    ComposeParseResponse,
    ComposeServiceInfo,
    ComposeEnvVarInfo,
    ImportServiceRequest,
    ImportServiceResponse,
    ImportedServiceConfig,
    ShadowHeaderConfig,
    EnvVarConfigItem,
    parse_github_url,
)
from src.services.auth import get_current_user
from src.models.user import User
from src.config.yaml_parser import ComposeParser

logger = logging.getLogger(__name__)
router = APIRouter()

# Common docker-compose file patterns to look for
COMPOSE_FILE_PATTERNS = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
    'docker-compose.dev.yml',
    'docker-compose.dev.yaml',
    'docker-compose.prod.yml',
    'docker-compose.prod.yaml',
    'docker-compose.override.yml',
    'docker-compose.override.yaml',
]


async def fetch_github_contents(url: str, token: Optional[str] = None) -> Dict[str, Any]:
    """Fetch contents from GitHub API."""
    headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Ushadow-Import'
    }
    if token:
        headers['Authorization'] = f'token {token}'

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository or path not found")
        if response.status_code == 403:
            raise HTTPException(status_code=403, detail="GitHub API rate limit exceeded or access denied")
        response.raise_for_status()
        return response.json()


async def fetch_raw_content(url: str, token: Optional[str] = None) -> str:
    """Fetch raw file content from GitHub."""
    headers = {'User-Agent': 'Ushadow-Import'}
    if token:
        headers['Authorization'] = f'token {token}'

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.text


def detect_compose_files(contents: List[Dict[str, Any]]) -> List[DetectedComposeFile]:
    """Detect docker-compose files from GitHub directory listing."""
    compose_files = []

    for item in contents:
        if item.get('type') != 'file':
            continue

        name = item.get('name', '').lower()

        # Check if file matches any compose pattern
        for pattern in COMPOSE_FILE_PATTERNS:
            if name == pattern.lower() or name.endswith('-compose.yml') or name.endswith('-compose.yaml'):
                compose_files.append(DetectedComposeFile(
                    path=item.get('path', ''),
                    name=item.get('name', ''),
                    download_url=item.get('download_url', ''),
                    size=item.get('size', 0)
                ))
                break

    return compose_files


def parse_env_var_line(line: str) -> Optional[ComposeEnvVarInfo]:
    """Parse an environment variable line from compose format."""
    if not line or not isinstance(line, str):
        return None

    line = line.strip()
    if not line:
        return None

    # Pattern for ${VAR:-default}
    env_pattern = re.compile(r'\$\{([^:}]+)(?::-([^}]*))?\}')

    # Check for KEY=VALUE format
    if '=' in line:
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()

        if not value:
            return ComposeEnvVarInfo(name=key, has_default=False, is_required=True)

        # Check for ${VAR:-default} pattern
        match = env_pattern.search(value)
        if match:
            var_name, default = match.groups()
            has_default = default is not None and default != ""
            return ComposeEnvVarInfo(
                name=key,
                has_default=has_default,
                default_value=default if has_default else None,
                is_required=not has_default
            )

        # Plain value - has a hardcoded default
        return ComposeEnvVarInfo(
            name=key,
            has_default=True,
            default_value=value,
            is_required=False
        )

    # Bare variable name - required
    return ComposeEnvVarInfo(name=line, has_default=False, is_required=True)


def parse_compose_content(content: str) -> Dict[str, Any]:
    """Parse docker-compose YAML content."""
    yaml = YAML()
    yaml.preserve_quotes = True
    from io import StringIO
    return yaml.load(StringIO(content)) or {}


def extract_services_from_compose(data: Dict[str, Any]) -> List[ComposeServiceInfo]:
    """Extract service information from parsed compose data."""
    services = []
    services_data = data.get('services', {})

    for name, service_data in services_data.items():
        # Parse environment variables
        env_vars = []
        environment = service_data.get('environment', [])

        if isinstance(environment, list):
            for item in environment:
                env_info = parse_env_var_line(str(item) if item else "")
                if env_info:
                    env_vars.append(env_info)
        elif isinstance(environment, dict):
            for key, value in environment.items():
                if value is None:
                    env_vars.append(ComposeEnvVarInfo(name=key, has_default=False, is_required=True))
                else:
                    env_info = parse_env_var_line(f"{key}={value}")
                    if env_info:
                        env_vars.append(env_info)

        # Parse ports
        ports = []
        for port in service_data.get('ports', []):
            if isinstance(port, str):
                port_str = port.replace('/tcp', '').replace('/udp', '')
                if ':' in port_str:
                    host, container = port_str.rsplit(':', 1)
                    ports.append({'host': host, 'container': container})
                else:
                    ports.append({'container': port_str})
            elif isinstance(port, dict):
                ports.append({
                    'host': str(port.get('published', '')),
                    'container': str(port.get('target', ''))
                })

        # Parse depends_on
        depends_on = service_data.get('depends_on', [])
        if isinstance(depends_on, dict):
            depends_on = list(depends_on.keys())

        # Parse volumes
        volumes = service_data.get('volumes', [])
        if isinstance(volumes, list):
            volumes = [str(v) for v in volumes]

        # Parse networks
        networks = service_data.get('networks', [])
        if isinstance(networks, dict):
            networks = list(networks.keys())

        services.append(ComposeServiceInfo(
            name=name,
            image=service_data.get('image'),
            ports=ports,
            environment=env_vars,
            depends_on=depends_on,
            volumes=volumes,
            networks=networks,
            command=service_data.get('command'),
            healthcheck=service_data.get('healthcheck')
        ))

    return services


@router.post("/scan", response_model=GitHubScanResponse)
async def scan_github_repo(
    request: GitHubImportRequest,
    current_user: User = Depends(get_current_user)
) -> GitHubScanResponse:
    """
    Scan a GitHub repository for docker-compose files.

    Accepts a GitHub URL (repository, directory, or specific file) and returns
    a list of detected docker-compose files.
    """
    try:
        github_info = parse_github_url(request.github_url)
        logger.info(f"Scanning GitHub repo: {github_info.owner}/{github_info.repo}")

        # If a specific compose path is provided, verify it exists
        if request.compose_path:
            github_info.path = request.compose_path

        # Fetch directory contents
        contents = await fetch_github_contents(github_info.api_url)

        # Handle single file case
        if isinstance(contents, dict) and contents.get('type') == 'file':
            return GitHubScanResponse(
                success=True,
                github_info=github_info,
                compose_files=[DetectedComposeFile(
                    path=contents.get('path', ''),
                    name=contents.get('name', ''),
                    download_url=contents.get('download_url', ''),
                    size=contents.get('size', 0)
                )],
                message="Found specified compose file"
            )

        # Detect compose files in directory
        compose_files = detect_compose_files(contents if isinstance(contents, list) else [])

        if not compose_files:
            return GitHubScanResponse(
                success=True,
                github_info=github_info,
                compose_files=[],
                message="No docker-compose files found in the specified location"
            )

        return GitHubScanResponse(
            success=True,
            github_info=github_info,
            compose_files=compose_files,
            message=f"Found {len(compose_files)} docker-compose file(s)"
        )

    except ValueError as e:
        return GitHubScanResponse(
            success=False,
            error=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning GitHub repo: {e}")
        return GitHubScanResponse(
            success=False,
            error=str(e)
        )


@router.post("/parse", response_model=ComposeParseResponse)
async def parse_compose_file(
    github_url: str,
    compose_path: str,
    current_user: User = Depends(get_current_user)
) -> ComposeParseResponse:
    """
    Parse a docker-compose file and extract service/environment information.

    Returns structured information about services, including environment variables
    that need to be configured.
    """
    try:
        github_info = parse_github_url(github_url)
        github_info.path = compose_path

        # Build raw URL for file content
        raw_url = f"https://raw.githubusercontent.com/{github_info.owner}/{github_info.repo}/{github_info.branch}/{compose_path}"

        # Fetch compose file content
        content = await fetch_raw_content(raw_url)

        # Parse the compose file
        data = parse_compose_content(content)

        # Extract services
        services = extract_services_from_compose(data)

        # Extract networks
        networks = list(data.get('networks', {}).keys())

        # Extract volumes
        volumes = list(data.get('volumes', {}).keys())

        return ComposeParseResponse(
            success=True,
            compose_path=compose_path,
            services=services,
            networks=networks,
            volumes=volumes,
            message=f"Successfully parsed {len(services)} service(s)"
        )

    except Exception as e:
        logger.error(f"Error parsing compose file: {e}")
        return ComposeParseResponse(
            success=False,
            compose_path=compose_path,
            error=str(e)
        )


@router.post("/register", response_model=ImportServiceResponse)
async def register_imported_service(
    request: ImportServiceRequest,
    current_user: User = Depends(get_current_user)
) -> ImportServiceResponse:
    """
    Register an imported service from GitHub.

    Downloads the compose file, saves it locally, and registers the service
    with the configured shadow header and environment variables.
    """
    try:
        github_info = parse_github_url(request.github_url)
        github_info.path = request.compose_path
        config = request.config

        # Build raw URL and fetch compose content
        raw_url = f"https://raw.githubusercontent.com/{github_info.owner}/{github_info.repo}/{github_info.branch}/{request.compose_path}"
        content = await fetch_raw_content(raw_url)

        # Parse to validate
        data = parse_compose_content(content)
        if not data.get('services'):
            return ImportServiceResponse(
                success=False,
                message="No services found in compose file"
            )

        # Add x-ushadow metadata to the compose content
        yaml = YAML()
        yaml.preserve_quotes = True
        from io import StringIO
        compose_data = yaml.load(StringIO(content)) or {}

        # Build x-ushadow section
        x_ushadow = compose_data.get('x-ushadow', {})

        # Add metadata for the service
        service_meta = {
            'display_name': config.display_name or request.service_name,
            'description': config.description or f"Imported from {github_info.owner}/{github_info.repo}",
            'github_source': {
                'url': request.github_url,
                'owner': github_info.owner,
                'repo': github_info.repo,
                'branch': github_info.branch,
                'path': request.compose_path
            }
        }

        # Add shadow header config
        if config.shadow_header.enabled:
            service_meta['shadow_header'] = {
                'enabled': True,
                'header_name': config.shadow_header.header_name,
                'header_value': config.shadow_header.header_value or request.service_name
            }
            if config.shadow_header.route_path:
                service_meta['route_path'] = config.shadow_header.route_path

        x_ushadow[request.service_name] = service_meta
        compose_data['x-ushadow'] = x_ushadow

        # Ensure compose directory exists
        compose_dir = Path('/compose')
        if not compose_dir.exists():
            compose_dir = Path('compose')
        compose_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '-', request.service_name)
        compose_filename = f"{safe_name}-compose.yaml"
        compose_path = compose_dir / compose_filename

        # Write the compose file with modifications
        output = StringIO()
        yaml.dump(compose_data, output)
        compose_content = output.getvalue()

        # Add environment variable overrides if configured
        env_file_content = []
        for env_config in config.env_vars:
            if env_config.source == "literal" and env_config.value:
                env_file_content.append(f"{env_config.name}={env_config.value}")

        # Write compose file
        with open(compose_path, 'w') as f:
            f.write(compose_content)

        # Write env file if we have overrides
        if env_file_content:
            env_file_path = compose_dir / f"{safe_name}.env"
            with open(env_file_path, 'w') as f:
                f.write('\n'.join(env_file_content) + '\n')

        # Save service configuration to settings
        from src.config.omegaconf_settings import get_settings_store
        settings = get_settings_store()

        service_config_key = f"imported_services.{safe_name}"
        await settings.update({
            service_config_key: {
                'github_url': request.github_url,
                'compose_path': request.compose_path,
                'compose_file': str(compose_path),
                'service_name': request.service_name,
                'display_name': config.display_name,
                'description': config.description,
                'shadow_header': config.shadow_header.model_dump(),
                'env_vars': [ev.model_dump() for ev in config.env_vars],
                'enabled': config.enabled
            }
        })

        # Refresh compose registry to pick up new service
        from src.services.compose_registry import get_compose_registry
        registry = get_compose_registry()
        registry.refresh()

        logger.info(f"Imported service '{request.service_name}' from GitHub: {request.github_url}")

        return ImportServiceResponse(
            success=True,
            service_id=f"{compose_filename.replace('.yaml', '')}:{request.service_name}",
            service_name=request.service_name,
            message=f"Successfully imported service '{request.service_name}'",
            compose_file_path=str(compose_path)
        )

    except Exception as e:
        logger.error(f"Error registering imported service: {e}")
        return ImportServiceResponse(
            success=False,
            message=f"Failed to import service: {str(e)}"
        )


@router.get("/imported")
async def list_imported_services(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all imported services from GitHub."""
    try:
        from src.config.omegaconf_settings import get_settings_store
        settings = get_settings_store()

        imported = settings.get("imported_services", {})
        return [
            {
                'id': key,
                **value
            }
            for key, value in imported.items()
        ] if isinstance(imported, dict) else []

    except Exception as e:
        logger.error(f"Error listing imported services: {e}")
        return []


@router.delete("/imported/{service_id}")
async def delete_imported_service(
    service_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Delete an imported service."""
    try:
        from src.config.omegaconf_settings import get_settings_store
        settings = get_settings_store()

        imported = settings.get("imported_services", {})
        if service_id not in imported:
            raise HTTPException(status_code=404, detail=f"Imported service '{service_id}' not found")

        service_config = imported[service_id]
        compose_file = service_config.get('compose_file')

        # Remove compose file if it exists
        if compose_file and os.path.exists(compose_file):
            os.remove(compose_file)
            logger.info(f"Removed compose file: {compose_file}")

        # Remove env file if it exists
        env_file = compose_file.replace('-compose.yaml', '.env') if compose_file else None
        if env_file and os.path.exists(env_file):
            os.remove(env_file)

        # Remove from settings
        del imported[service_id]
        await settings.update({"imported_services": imported})

        # Refresh compose registry
        from src.services.compose_registry import get_compose_registry
        registry = get_compose_registry()
        registry.refresh()

        return {
            "success": True,
            "message": f"Deleted imported service '{service_id}'"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting imported service: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/imported/{service_id}/config")
async def update_imported_service_config(
    service_id: str,
    config: ImportedServiceConfig,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Update configuration for an imported service."""
    try:
        from src.config.omegaconf_settings import get_settings_store
        settings = get_settings_store()

        imported = settings.get("imported_services", {})
        if service_id not in imported:
            raise HTTPException(status_code=404, detail=f"Imported service '{service_id}' not found")

        # Update configuration
        imported[service_id].update({
            'display_name': config.display_name,
            'description': config.description,
            'shadow_header': config.shadow_header.model_dump(),
            'env_vars': [ev.model_dump() for ev in config.env_vars],
            'enabled': config.enabled
        })

        await settings.update({"imported_services": imported})

        # Update env file with new values
        compose_file = imported[service_id].get('compose_file')
        if compose_file:
            env_file_content = []
            for env_config in config.env_vars:
                if env_config.source == "literal" and env_config.value:
                    env_file_content.append(f"{env_config.name}={env_config.value}")

            if env_file_content:
                env_file_path = compose_file.replace('-compose.yaml', '.env')
                with open(env_file_path, 'w') as f:
                    f.write('\n'.join(env_file_content) + '\n')

        return {
            "success": True,
            "message": f"Updated configuration for '{service_id}'"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating imported service config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
