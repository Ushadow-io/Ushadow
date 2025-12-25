"""
Settings API Endpoints

Manages application settings and configuration.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
import logging

from ..services.settings_manager import SettingsManager
from ..services.env_manager import EnvManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])


# Dependency injection
def get_settings_manager() -> SettingsManager:
    """Get SettingsManager instance."""
    return SettingsManager()


def get_env_manager() -> EnvManager:
    """Get EnvManager instance."""
    return EnvManager()


@router.get("/", response_model=Dict[str, Any])
async def get_settings(
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """
    Get all settings (merged from defaults and local overrides).
    
    Returns the complete settings object with all values resolved.
    """
    try:
        settings = settings_manager.load_settings()
        return settings
        
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/local", response_model=Dict[str, Any])
async def get_local_settings(
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """
    Get only local settings overrides (not merged with defaults).
    
    Returns the contents of config.local.yaml.
    """
    try:
        local_settings = settings_manager.load_local_settings()
        return local_settings or {}
        
    except Exception as e:
        logger.error(f"Failed to load local settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/defaults", response_model=Dict[str, Any])
async def get_default_settings(
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """
    Get default settings (from config.defaults.yaml).
    
    These are the shipped defaults that should not be modified.
    """
    try:
        defaults = settings_manager.load_defaults()
        return defaults
        
    except Exception as e:
        logger.error(f"Failed to load default settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{key_path}")
async def get_setting(
    key_path: str,
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Any:
    """
    Get a specific setting by key path (dot notation).
    
    Example: GET /api/settings/services.pieces.url
    """
    try:
        value = settings_manager.get(key_path)
        
        if value is None:
            raise HTTPException(
                status_code=404,
                detail=f"Setting '{key_path}' not found"
            )
        
        return {"key": key_path, "value": value}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get setting {key_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/", response_model=Dict[str, Any])
async def update_settings(
    updates: Dict[str, Any],
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """
    Update local settings (writes to config.local.yaml).
    
    This performs a deep merge with existing local settings.
    Only the changed values need to be provided.
    """
    try:
        # Load current local settings
        current_local = settings_manager.load_local_settings() or {}
        
        # Deep merge updates
        updated_local = settings_manager._deep_merge(current_local, updates)
        
        # Save to local settings file
        settings_manager.save_local_settings(updated_local)
        
        logger.info(f"Updated local settings")
        
        # Return merged settings
        return settings_manager.load_settings()
        
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{key_path}")
async def update_setting(
    key_path: str,
    value: Any,
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """
    Update a specific setting by key path.
    
    Example: PUT /api/settings/services.pieces.enabled
    Body: {"value": true}
    """
    try:
        settings_manager.set(key_path, value)
        
        logger.info(f"Updated setting {key_path}")
        
        return {
            "key": key_path,
            "value": value,
            "message": "Setting updated successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to update setting {key_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{key_path}", status_code=204)
async def delete_setting(
    key_path: str,
    settings_manager: SettingsManager = Depends(get_settings_manager)
):
    """
    Delete a setting from local overrides (resets to default).
    
    This removes the key from config.local.yaml, causing the
    default value to be used instead.
    """
    try:
        # Load current local settings
        local_settings = settings_manager.load_local_settings() or {}
        
        # Remove the key
        keys = key_path.split(".")
        current = local_settings
        
        for key in keys[:-1]:
            if key not in current:
                raise HTTPException(
                    status_code=404,
                    detail=f"Setting '{key_path}' not found in local overrides"
                )
            current = current[key]
        
        if keys[-1] not in current:
            raise HTTPException(
                status_code=404,
                detail=f"Setting '{key_path}' not found in local overrides"
            )
        
        del current[keys[-1]]
        
        # Save updated local settings
        settings_manager.save_local_settings(local_settings)
        
        logger.info(f"Deleted setting {key_path} from local overrides")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete setting {key_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-env", response_model=Dict[str, Any])
async def sync_to_env_file(
    settings_manager: SettingsManager = Depends(get_settings_manager),
    env_manager: EnvManager = Depends(get_env_manager)
) -> Dict[str, Any]:
    """
    Sync settings to .env file for Docker Compose.
    
    Converts YAML settings to environment variables and writes to .env file.
    """
    try:
        settings = settings_manager.load_settings()
        env_vars = env_manager.sync_from_settings(settings)
        
        logger.info(f"Synced {len(env_vars)} variables to .env file")
        
        return {
            "count": len(env_vars),
            "message": f"Synced {len(env_vars)} environment variables to .env"
        }
        
    except Exception as e:
        logger.error(f"Failed to sync to .env file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset", response_model=Dict[str, Any])
async def reset_to_defaults(
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """
    Reset all settings to defaults by clearing local overrides.
    
    WARNING: This deletes config.local.yaml!
    """
    try:
        settings_manager.reset_local_settings()
        
        logger.warning("Reset all settings to defaults")
        
        return {
            "message": "Settings reset to defaults",
            "settings": settings_manager.load_settings()
        }
        
    except Exception as e:
        logger.error(f"Failed to reset settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))
