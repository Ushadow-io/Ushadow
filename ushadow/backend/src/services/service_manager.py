"""
Service Manager

Manages external service configurations defined in services.yaml.
"""

import yaml
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Any

from src.models.service import ServiceConfig
from src.services.settings_manager import SettingsManager

logger = logging.getLogger(__name__)


class ServiceManager:
    """Manages service configurations from services.yaml."""
    
    def __init__(self, config_dir: Optional[Path] = None):
        """
        Initialize service manager.
        
        Args:
            config_dir: Path to config directory. Defaults to project_root/config
        """
        if config_dir is None:
            # Default to project_root/config
            project_root = Path(__file__).parent.parent.parent.parent
            config_dir = project_root / "config"
        
        self.config_dir = Path(config_dir)
        self.services_path = self.config_dir / "services.yaml"
        self.settings_manager = SettingsManager(config_dir)
        
        self._services_cache: Optional[List[ServiceConfig]] = None
    
    def list_services(self, reload: bool = False) -> List[ServiceConfig]:
        """
        Get all service configurations.
        
        Args:
            reload: Force reload from file
            
        Returns:
            List of ServiceConfig objects
        """
        if reload or self._services_cache is None:
            self._services_cache = self._load_services()
        
        return self._services_cache
    
    def get_service(self, service_id: str) -> Optional[ServiceConfig]:
        """Get a specific service by ID."""
        services = self.list_services()
        
        for service in services:
            if service.service_id == service_id:
                return service
        
        return None
    
    def add_service(self, service: ServiceConfig):
        """Add a new service configuration."""
        services = self._load_services_raw()
        
        # Check for duplicates
        if any(s.get("service_id") == service.service_id for s in services):
            raise ValueError(f"Service {service.service_id} already exists")
        
        # Add service
        services.append(service.model_dump(exclude_none=True))
        
        # Save to file
        self._save_services(services)
        
        # Invalidate cache
        self._services_cache = None
    
    def update_service(self, service: ServiceConfig):
        """Update an existing service configuration."""
        services = self._load_services_raw()
        
        # Find and update
        found = False
        for i, s in enumerate(services):
            if s.get("service_id") == service.service_id:
                services[i] = service.model_dump(exclude_none=True)
                found = True
                break
        
        if not found:
            raise ValueError(f"Service {service.service_id} not found")
        
        # Save to file
        self._save_services(services)
        
        # Invalidate cache
        self._services_cache = None
    
    def remove_service(self, service_id: str):
        """Remove a service configuration."""
        services = self._load_services_raw()
        
        # Filter out the service
        original_count = len(services)
        services = [s for s in services if s.get("service_id") != service_id]
        
        if len(services) == original_count:
            raise ValueError(f"Service {service_id} not found")
        
        # Save to file
        self._save_services(services)
        
        # Invalidate cache
        self._services_cache = None
    
    def _load_services(self) -> List[ServiceConfig]:
        """Load and parse services from YAML."""
        raw_services = self._load_services_raw()
        
        # Resolve templates in each service
        resolved_services = []
        for raw_service in raw_services:
            resolved = self._resolve_templates(raw_service)
            try:
                service = ServiceConfig(**resolved)
                resolved_services.append(service)
            except Exception as e:
                logger.error(f"Error parsing service {resolved.get('service_id')}: {e}")
                continue
        
        return resolved_services
    
    def _load_services_raw(self) -> List[Dict[str, Any]]:
        """Load raw services data from YAML."""
        if not self.services_path.exists():
            logger.warning(f"Services file not found: {self.services_path}")
            return []
        
        try:
            with open(self.services_path, 'r') as f:
                data = yaml.safe_load(f)
                
                if data is None:
                    return []
                
                if isinstance(data, dict) and 'services' in data:
                    return data['services']
                
                if isinstance(data, list):
                    return data
                
                logger.warning(f"Unexpected services.yaml structure")
                return []
                
        except yaml.YAMLError as e:
            logger.error(f"Error parsing services.yaml: {e}")
            return []
    
    def _save_services(self, services: List[Dict[str, Any]]):
        """Save services to YAML (atomic write)."""
        # Ensure config directory exists
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # Atomic write using temp file + rename
        temp_path = self.services_path.with_suffix('.yaml.tmp')
        
        try:
            with open(temp_path, 'w') as f:
                yaml.safe_dump(
                    {'services': services},
                    f,
                    default_flow_style=False,
                    sort_keys=False
                )
            
            # Atomic rename
            temp_path.replace(self.services_path)
            
            logger.info(f"Saved services to {self.services_path}")
            
        except Exception as e:
            # Clean up temp file on error
            if temp_path.exists():
                temp_path.unlink()
            raise
    
    def _resolve_templates(self, data: Any) -> Any:
        """
        Recursively resolve template references in data.
        
        Supports:
        - {{config.key.path}} - References from settings
        - {{secrets.key}} - References from secrets (future)
        """
        if isinstance(data, dict):
            return {k: self._resolve_templates(v) for k, v in data.items()}
        
        elif isinstance(data, list):
            return [self._resolve_templates(item) for item in data]
        
        elif isinstance(data, str):
            return self._resolve_string_template(data)
        
        else:
            return data
    
    def _resolve_string_template(self, template: str) -> str:
        """Resolve template references in a string."""
        # Pattern: {{config.key.path}} or {{secrets.key}}
        pattern = r'\{\{(config|secrets)\.([^}]+)\}\}'
        
        def replace_template(match):
            source = match.group(1)  # 'config' or 'secrets'
            key_path = match.group(2)  # 'key.path'
            
            if source == 'config':
                # Get from settings
                value = self.settings_manager.get(key_path)
                return str(value) if value is not None else match.group(0)
            
            elif source == 'secrets':
                # TODO: Implement secrets manager
                logger.warning(f"Secrets not yet implemented: {key_path}")
                return match.group(0)
            
            return match.group(0)
        
        return re.sub(pattern, replace_template, template)
