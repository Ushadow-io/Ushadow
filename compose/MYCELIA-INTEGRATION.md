# Mycelia Integration with ushadow

## Overview

Mycelia has been integrated with ushadow's provider/instance model to support stateless configuration via environment variables.

## Changes Made

### 1. Schema Updates (`mycelia/myceliasdk/config.ts`)

Updated the server config schema to support separate LLM and transcription providers:

```typescript
export const zProviderConfig = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const zServerConfig = z.object({
  llm: zProviderConfig.optional().nullable(),              // New: LLM-specific config
  transcription: zProviderConfig.optional().nullable(),     // New: Transcription-specific config
  inference: zInferenceProviderConfig.optional().nullable(), // Deprecated: kept for backward compatibility
  // ...
});
```

### 2. Resource Updates

Both `LLMResource` and `TranscriptionResource` now follow ushadow's stateless pattern:

**Priority:** Environment variables → MongoDB (fallback)

```typescript
async getInferenceProvider() {
  // 1. Read from env vars (stateless - ushadow pattern)
  const envBaseUrl = Deno.env.get("OPENAI_BASE_URL");
  const envApiKey = Deno.env.get("OPENAI_API_KEY");
  const envModel = Deno.env.get("OPENAI_MODEL");

  if (envBaseUrl && envApiKey) {
    return { baseUrl: envBaseUrl, apiKey: envApiKey, model: envModel };
  }

  // 2. Fallback to MongoDB for backward compatibility
  const config = await getServerConfig();
  // ...
}
```

### 3. Compose File Configuration

**Environment Variables** (compose/mycelia-compose.yml):

```yaml
# LLM Provider Configuration
- OPENAI_BASE_URL=${OPENAI_BASE_URL}
- OPENAI_API_KEY=${OPENAI_API_KEY}
- OPENAI_MODEL=${OPENAI_MODEL}

# Transcription Provider Configuration
- TRANSCRIPTION_BASE_URL=${TRANSCRIPTION_BASE_URL}
- TRANSCRIPTION_API_KEY=${TRANSCRIPTION_API_KEY}
- TRANSCRIPTION_MODEL=${TRANSCRIPTION_MODEL}
```

**ushadow Metadata:**

```yaml
x-ushadow:
  mycelia-backend:
    requires: ["llm", "transcription"]  # Declares capability requirements
```

## How It Works

1. **Service Definition**: Mycelia declares it needs `llm` and `transcription` capabilities in x-ushadow metadata
2. **Provider Resolution**: ushadow's capability resolver maps these to provider instances
3. **Env Var Injection**: ushadow injects the mapped env vars into the container
4. **Runtime**: Mycelia reads configuration from env vars (stateless)

## Backward Compatibility

Mycelia maintains backward compatibility with its original MongoDB-based configuration:
- If env vars are not set, it falls back to reading from MongoDB
- Existing Mycelia installations continue to work unchanged
- The `inference` field is deprecated but still supported

## Provider Requirements

### LLM Provider
- **Base URL**: OpenAI-compatible API endpoint (e.g., http://ollama:11434/v1)
- **API Key**: Authentication key for the provider
- **Model**: Optional model name (e.g., "llama3")
- **Endpoint Used**: `/v1/chat/completions`

### Transcription Provider
- **Base URL**: OpenAI-compatible Whisper API endpoint
- **API Key**: Authentication key for the provider
- **Model**: Optional model name (defaults to "whisper-1")
- **Endpoint Used**: `/v1/audio/transcriptions`

## Example ushadow Provider Configuration

```yaml
providers:
  llm:
    instances:
      - id: ollama-local
        base_url: http://ollama:11434/v1
        api_key: ollama
        model: llama3

  transcription:
    instances:
      - id: whisper-local
        base_url: http://whisper:8000/v1
        api_key: whisper
```

When Mycelia is started, ushadow will:
1. Resolve `llm` → ollama-local instance
2. Resolve `transcription` → whisper-local instance
3. Inject env vars: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `TRANSCRIPTION_BASE_URL`, etc.
4. Start Mycelia with stateless configuration
