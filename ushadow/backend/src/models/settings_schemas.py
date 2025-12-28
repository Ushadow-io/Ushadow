"""
Settings Schemas using OmegaConf dataclasses.

These define the structure and validation for application settings.
Uses dataclasses (not Pydantic) for OmegaConf compatibility.
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


class MemoryProvider(str, Enum):
    """Supported memory providers."""
    OPENMEMORY = "openmemory"
    CHRONICLE = "chronicle"


class TranscriptionProvider(str, Enum):
    """Supported transcription providers."""
    DEEPGRAM = "deepgram"
    MISTRAL = "mistral"
    WHISPER = "whisper"


@dataclass
class ApiKeysSettings:
    """
    Shared API keys - Single source of truth for credentials.

    These are referenced by services via ${api_keys.openai_api_key} interpolation.
    """
    openai_api_key: Optional[str] = None
    deepgram_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    mistral_api_key: Optional[str] = None


@dataclass
class LLMSettings:
    """LLM configuration."""
    provider: str = "openai"
    openai_model: str = "gpt-4o-mini"
    chat_temperature: float = 0.7
    ollama_model: str = "llama3.1:latest"
    ollama_embedder_model: str = "nomic-embed-text:latest"
    ollama_base_url: str = "http://ollama:11434"


@dataclass
class TranscriptionSettings:
    """Transcription configuration."""
    provider: str = "deepgram"
    language: str = "en"


@dataclass
class OpenMemoryPreferences:
    """OpenMemory service-specific preferences."""
    enable_graph: bool = False
    neo4j_password: Optional[str] = None


@dataclass
class ServicePreferences:
    """Service-specific preferences (not shared across services)."""
    openmemory: OpenMemoryPreferences = field(default_factory=OpenMemoryPreferences)


@dataclass
class InfrastructureSettings:
    """Core infrastructure service URLs."""
    mongodb_uri: str = "mongodb://mongo:27017"
    mongodb_database: str = "ushadow"
    redis_url: str = "redis://redis:6379/0"
    qdrant_base_url: str = "qdrant"
    qdrant_port: str = "6333"
    neo4j_host: str = "neo4j"
    neo4j_user: str = "neo4j"
    ollama_base_url: str = "http://ollama:11434"
    openai_base_url: str = "https://api.openai.com/v1"
    openmemory_server_url: str = "http://mem0:8765"


@dataclass
class AuthSettings:
    """Authentication configuration (non-secret)."""
    admin_email: str = "admin@example.com"
    admin_name: str = "admin"


@dataclass
class AuthSecrets:
    """Authentication secrets."""
    secret_key: str = ""  # Auto-generated if empty
    admin_password_hash: str = ""


@dataclass
class SpeechDetectionSettings:
    """Speech detection settings."""
    min_words: int = 5
    min_confidence: float = 0.5
    min_duration: float = 10.0


@dataclass
class ConversationSettings:
    """Conversation management settings."""
    transcription_buffer_seconds: float = 120.0
    speech_inactivity_threshold: float = 60.0
    new_conversation_timeout_minutes: float = 1.5
    record_only_enrolled_speakers: bool = True


@dataclass
class AudioProcessingSettings:
    """Audio processing settings."""
    audio_cropping_enabled: bool = True
    min_speech_segment_duration: float = 1.0
    cropping_context_padding: float = 0.1


@dataclass
class DiarizationSettings:
    """Speaker diarization settings."""
    diarization_source: str = "pyannote"
    similarity_threshold: float = 0.15
    min_duration: float = 0.5
    collar: float = 2.0
    min_duration_off: float = 1.5
    min_speakers: int = 2
    max_speakers: int = 6


@dataclass
class NetworkSettings:
    """Network configuration."""
    host_ip: str = "localhost"
    backend_public_port: int = 8000
    webui_port: int = 5173
    cors_origins: str = "http://localhost:5173,http://localhost:3000"


@dataclass
class MiscSettings:
    """Miscellaneous settings."""
    debug_dir: str = "./data/debug_dir"
    langfuse_enable_telemetry: bool = False


@dataclass
class LegacySecuritySettings:
    """Legacy format from old secrets.yaml - for backward compatibility."""
    auth_secret_key: str = ""
    session_secret: str = ""


@dataclass
class LegacyAdminSettings:
    """Legacy admin format - for backward compatibility."""
    name: str = "admin"
    email: str = "admin@example.com"
    password: str = "password"


@dataclass
class AllSettings:
    """
    Root settings model - Single unified configuration.

    Merges from multiple sources:
    - config.defaults.yaml (defaults)
    - secrets.yaml (credentials)
    - config.local.yaml (user overrides)
    - MongoDB (runtime changes)
    """
    # Credentials (from secrets.yaml)
    api_keys: ApiKeysSettings = field(default_factory=ApiKeysSettings)
    auth_secrets: AuthSecrets = field(default_factory=AuthSecrets)

    # Core settings
    auth: AuthSettings = field(default_factory=AuthSettings)
    llm: LLMSettings = field(default_factory=LLMSettings)
    transcription: TranscriptionSettings = field(default_factory=TranscriptionSettings)
    infrastructure: InfrastructureSettings = field(default_factory=InfrastructureSettings)
    speech_detection: SpeechDetectionSettings = field(default_factory=SpeechDetectionSettings)
    conversation: ConversationSettings = field(default_factory=ConversationSettings)
    audio_processing: AudioProcessingSettings = field(default_factory=AudioProcessingSettings)
    diarization: DiarizationSettings = field(default_factory=DiarizationSettings)
    network: NetworkSettings = field(default_factory=NetworkSettings)
    misc: MiscSettings = field(default_factory=MiscSettings)

    # Service-specific preferences
    service_preferences: ServicePreferences = field(default_factory=ServicePreferences)

    # Legacy fields (for backward compatibility during migration)
    security: Optional[LegacySecuritySettings] = field(default_factory=lambda: LegacySecuritySettings())
    admin: Optional[LegacyAdminSettings] = field(default_factory=lambda: LegacyAdminSettings())

    # Metadata
    version: str = "1.0.0"
    wizard_completed: bool = False
