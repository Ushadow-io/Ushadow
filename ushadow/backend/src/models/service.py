"""
Service Models - DEPRECATED, Use integration.py Instead

This file originally contained models for both:
1. Services (Docker containers from compose files)
2. Integrations (external APIs/data sources)

These concepts have been separated:

SERVICES (Docker containers):
  - Models: See compose_registry.py (DiscoveredService)
  - Models: See docker_manager.py (ServiceInfo, ServiceType, ServiceStatus)
  - Orchestration: service_orchestrator.py
  - Example: chronicle, openmemory, neo4j

INTEGRATIONS (External APIs/data sources):
  - Models: See models/integration.py (NEW)
  - Adapters: memory/adapters/*
  - Orchestration: integration_orchestrator.py (TODO)
  - Example: Obsidian vault, Notion, mem0.ai, Google Drive

This file now re-exports from integration.py for backward compatibility.
"""

# Re-exports from integration.py for backward compatibility
# These will be removed once all imports are updated

from src.models.integration import (
    IntegrationType,
    AuthMethod,
    AuthConfig,
    ConnectionConfig,
    TransformType,
    FieldMapping,
    MemoryMappingConfig,
    IntegrationConfigSchema as ServiceConfigSchema,  # Alias for compat
    IntegrationTemplateModeConfig as ServiceTemplateModeConfig,  # Alias
    IntegrationTemplate as ServiceTemplate,  # Alias
    IntegrationConfig as ServiceConfig,  # Alias
)

# Legacy enums - keeping for reference but not used
from enum import Enum

class ServiceCategory(str, Enum):
    """
    DEPRECATED: High-level service category.

    This was intended for user-facing grouping but is not currently used.
    Services are now categorized by:
    - ServiceType in docker_manager.py (infrastructure vs application)
    - Capabilities in compose files (requires: [llm, transcription, memory])
    """
    MEMORY = "memory"
    LLM = "llm"
    TRANSCRIPTION = "transcription"
    SPEAKER_RECOGNITION = "speaker_recognition"
    AUDIO_RECORDING = "audio_recording"
    WORKFLOW = "workflow"
    AGENT = "agent"


__all__ = [
    # Active exports (from integration.py)
    'IntegrationType',
    'AuthMethod',
    'AuthConfig',
    'ConnectionConfig',
    'TransformType',
    'FieldMapping',
    'MemoryMappingConfig',
    'ServiceConfigSchema',
    'ServiceTemplateModeConfig',
    'ServiceTemplate',
    'ServiceConfig',
    # Legacy
    'ServiceCategory',
]
