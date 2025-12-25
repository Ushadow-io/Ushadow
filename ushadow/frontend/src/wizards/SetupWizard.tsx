import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  Settings,
  Sliders,
  X,
} from 'lucide-react'
import { wizardApi } from '../services/api'
import { getStorageKey } from '../utils/storage'
import OpenMemoryWizard from './OpenMemoryWizard'

type WizardStep = 'setup_type' | 'api_keys' | 'llm_setup' | 'transcription_setup' | 'memory_setup' | 'services_setup' | 'complete'
type SetupType = 'basic' | 'intermediate' | 'customized'

// Step visibility based on setup type
const STEP_VISIBILITY: Record<SetupType, WizardStep[]> = {
  basic: ['setup_type', 'api_keys', 'complete'],  // Basic: just API keys
  intermediate: ['setup_type', 'llm_setup', 'transcription_setup', 'memory_setup', 'complete'],
  customized: ['setup_type', 'llm_setup', 'transcription_setup', 'memory_setup', 'services_setup', 'complete'],
}

// LLM Setup State
interface LLMSetupForm {
  provider: 'openai' | 'ollama'
  // OpenAI config
  openai_api_key: string
  openai_model: string
  openai_base_url: string
  // Ollama config
  ollama_base_url: string
  ollama_model: string
  ollama_embedder_model: string
  install_ollama_container: boolean
}

// Transcription Setup State
interface TranscriptionSetupForm {
  provider: 'deepgram' | 'mistral' | 'parakeet'
  // API keys
  deepgram_api_key: string
  mistral_api_key: string
  // Parakeet config (for local transcription)
  parakeet_url: string
  install_parakeet_container: boolean
}

// Memory Setup State
interface MemorySetupForm {
  provider: 'chronicle' | 'openmemory_mcp' | 'mycelia'
  // OpenMemory config (set by mini-wizard)
  openmemory_server_url: string
  openmemory_enable_graph: boolean
  openmemory_neo4j_password: string
  // Mycelia config
  mycelia_url: string
}

// Additional Services State
interface ServicesSetupForm {
  enable_speaker_recognition: boolean
  enable_local_transcription: boolean
}

interface Message {
  type: 'success' | 'error' | 'info'
  text: string
}

const API_KEY_LINKS = {
  openai: 'https://platform.openai.com/api-keys',
  deepgram: 'https://console.deepgram.com/signup',
  mistral: 'https://console.mistral.ai/api-keys/',
  huggingface: 'https://huggingface.co/settings/tokens',
  langfuse: 'https://cloud.langfuse.com/',
  ngrok: 'https://dashboard.ngrok.com/get-started/your-authtoken',
}

export default function SetupWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<WizardStep>('setup_type')
  const [setupType, setSetupType] = useState<SetupType>('basic')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [showOpenMemoryWizard, setShowOpenMemoryWizard] = useState(false)

  // Basic mode API keys
  const [apiKeys, setApiKeys] = useState({
    openai_api_key: '',
    deepgram_api_key: '',
  })

  // Step 1: LLM Setup
  const [llmSetup, setLLMSetup] = useState<LLMSetupForm>({
    provider: 'openai',
    openai_api_key: '',
    openai_model: 'gpt-4o-mini',
    openai_base_url: 'https://api.openai.com/v1',
    ollama_base_url: 'http://ollama:11434',
    ollama_model: 'llama3.1:latest',
    ollama_embedder_model: 'nomic-embed-text:latest',
    install_ollama_container: false,
  })

  // Step 2: Transcription Setup
  const [transcriptionSetup, setTranscriptionSetup] = useState<TranscriptionSetupForm>({
    provider: 'deepgram',
    deepgram_api_key: '',
    mistral_api_key: '',
    parakeet_url: 'http://parakeet-asr:8767',
    install_parakeet_container: false,
  })

  // Step 3: Memory Setup
  const [memorySetup, setMemorySetup] = useState<MemorySetupForm>({
    provider: 'chronicle',
    openmemory_server_url: 'http://openmemory:8765',
    openmemory_enable_graph: false,
    openmemory_neo4j_password: '',
    mycelia_url: 'http://mycelia:5173',
  })

  // Step 4: Additional Services (Customized only)
  const [servicesSetup, setServicesSetup] = useState<ServicesSetupForm>({
    enable_speaker_recognition: false,
    enable_local_transcription: false,
  })

  // API Keys visibility state
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({
    openai_api_key: false,
    deepgram_api_key: false,
    mistral_api_key: false,
    hf_token: false,
    langfuse_public_key: false,
    langfuse_secret_key: false,
    ngrok_authtoken: false,
  })

  useEffect(() => {
    loadWizardStatus()
  }, [])

  const loadWizardStatus = async () => {
    try {
      setLoading(true)

      // Load saved configuration to prefill form fields
      const [apiKeysRes, providersRes, llmConfigRes] = await Promise.all([
        wizardApi.getApiKeys().catch(() => null),
        wizardApi.getProviders().catch(() => null),
        wizardApi.getLLMConfig().catch(() => null),
      ])

      // Prefill from saved settings
      if (apiKeysRes?.data) {
        setApiKeys(prev => ({
          openai_api_key: apiKeysRes.data.openai_api_key || prev.openai_api_key,
          deepgram_api_key: apiKeysRes.data.deepgram_api_key || prev.deepgram_api_key,
        }))

        setLLMSetup(prev => ({
          ...prev,
          openai_api_key: apiKeysRes.data.openai_api_key || prev.openai_api_key,
        }))

        setTranscriptionSetup(prev => ({
          ...prev,
          deepgram_api_key: apiKeysRes.data.deepgram_api_key || prev.deepgram_api_key,
          mistral_api_key: apiKeysRes.data.mistral_api_key || prev.mistral_api_key,
        }))
      }

      if (providersRes?.data) {
        setLLMSetup(prev => ({
          ...prev,
          provider: providersRes.data.llm_provider || prev.provider,
        }))

        setTranscriptionSetup(prev => ({
          ...prev,
          provider: providersRes.data.transcription_provider || prev.provider,
        }))

        setMemorySetup(prev => ({
          ...prev,
          provider: providersRes.data.memory_provider || prev.provider,
        }))
      }

      if (llmConfigRes?.data) {
        setLLMSetup(prev => ({
          ...prev,
          ...llmConfigRes.data,
        }))
      }

      // Always start at the beginning when explicitly navigating to /wizard
      setCurrentStep('setup_type')
    } catch (error: any) {
      console.error('Failed to load wizard status:', error)
      showMessage('error', 'Failed to load setup status')
      // Even on error, show the wizard from the beginning
      setCurrentStep('setup_type')
    } finally {
      setLoading(false)
    }
  }

  // Save functions for new wizard flow
  const saveApiKeys = async () => {
    try {
      setSaving(true)

      // For Basic mode: Save OpenAI and Deepgram keys, set providers to defaults
      await wizardApi.updateProviders({
        llm_provider: 'openai',
        transcription_provider: 'deepgram',
        memory_provider: 'chronicle',
      })

      await wizardApi.updateLLMConfig({
        openai_model: 'gpt-4o-mini',
        openai_base_url: 'https://api.openai.com/v1',
      })

      const keysToUpdate: any = {}
      // Only save keys that aren't masked (masked keys contain ***)
      if (apiKeys.openai_api_key && !apiKeys.openai_api_key.includes('***')) {
        keysToUpdate.openai_api_key = apiKeys.openai_api_key
      }
      if (apiKeys.deepgram_api_key && !apiKeys.deepgram_api_key.includes('***')) {
        keysToUpdate.deepgram_api_key = apiKeys.deepgram_api_key
      }

      if (Object.keys(keysToUpdate).length > 0) {
        await wizardApi.updateApiKeys(keysToUpdate)
      }

      showMessage('success', 'API keys saved successfully')
      return true
    } catch (error: any) {
      console.error('Failed to save API keys:', error)
      showMessage('error', error.response?.data?.detail || 'Failed to save API keys')
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveLLMSetup = async () => {
    try {
      setSaving(true)

      // Save LLM provider selection
      await wizardApi.updateProviders({
        llm_provider: llmSetup.provider,
      })

      // Save LLM configuration
      if (llmSetup.provider === 'openai') {
        await wizardApi.updateLLMConfig({
          openai_model: llmSetup.openai_model,
          openai_base_url: llmSetup.openai_base_url,
        })

        // Save OpenAI API key (skip if masked)
        if (llmSetup.openai_api_key && !llmSetup.openai_api_key.includes('***')) {
          await wizardApi.updateApiKeys({
            openai_api_key: llmSetup.openai_api_key,
          })
        }
      } else if (llmSetup.provider === 'ollama') {
        await wizardApi.updateLLMConfig({
          ollama_base_url: llmSetup.ollama_base_url,
          ollama_model: llmSetup.ollama_model,
          ollama_embedder_model: llmSetup.ollama_embedder_model,
          install_ollama_container: llmSetup.install_ollama_container,
        })
      }

      showMessage('success', 'LLM configuration saved successfully')
      return true
    } catch (error: any) {
      console.error('Failed to save LLM setup:', error)
      showMessage('error', error.response?.data?.detail || 'Failed to save LLM configuration')
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveTranscriptionSetup = async () => {
    try {
      setSaving(true)

      // Save transcription provider selection
      await wizardApi.updateProviders({
        transcription_provider: transcriptionSetup.provider,
      })

      // Save API keys based on provider (skip if masked)
      const keysToUpdate: any = {}
      if (transcriptionSetup.provider === 'deepgram' && transcriptionSetup.deepgram_api_key && !transcriptionSetup.deepgram_api_key.includes('***')) {
        keysToUpdate.deepgram_api_key = transcriptionSetup.deepgram_api_key
      }
      if (transcriptionSetup.provider === 'mistral' && transcriptionSetup.mistral_api_key && !transcriptionSetup.mistral_api_key.includes('***')) {
        keysToUpdate.mistral_api_key = transcriptionSetup.mistral_api_key
      }

      if (Object.keys(keysToUpdate).length > 0) {
        await wizardApi.updateApiKeys(keysToUpdate)
      }

      // TODO: Handle Parakeet container installation if install_parakeet_container is true

      showMessage('success', 'Transcription configuration saved successfully')
      return true
    } catch (error: any) {
      console.error('Failed to save transcription setup:', error)
      showMessage('error', error.response?.data?.detail || 'Failed to save transcription configuration')
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveMemorySetup = async () => {
    try {
      setSaving(true)

      // Save memory provider selection
      const providerUpdate: any = {
        memory_provider: memorySetup.provider,
      }

      // Add OpenMemory config if selected
      if (memorySetup.provider === 'openmemory_mcp') {
        providerUpdate.openmemory_server_url = memorySetup.openmemory_server_url
        providerUpdate.openmemory_enable_graph = memorySetup.openmemory_enable_graph
        if (memorySetup.openmemory_neo4j_password) {
          providerUpdate.openmemory_neo4j_password = memorySetup.openmemory_neo4j_password
        }
      }

      await wizardApi.updateProviders(providerUpdate)

      showMessage('success', 'Memory configuration saved successfully')
      return true
    } catch (error: any) {
      console.error('Failed to save memory setup:', error)
      showMessage('error', error.response?.data?.detail || 'Failed to save memory configuration')
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveServicesSetup = async () => {
    try {
      setSaving(true)

      // TODO: Implement services configuration (speaker recognition, parakeet)
      // This will likely involve starting/stopping docker containers

      showMessage('success', 'Services configuration saved successfully')
      return true
    } catch (error: any) {
      console.error('Failed to save services setup:', error)
      showMessage('error', error.response?.data?.detail || 'Failed to save services configuration')
      return false
    } finally {
      setSaving(false)
    }
  }

  const completeWizard = async () => {
    try {
      setSaving(true)
      await wizardApi.complete()

      // Mark wizard as dismissed so it won't auto-redirect again
      localStorage.setItem(getStorageKey('wizard_dismissed'), 'true')

      showMessage('success', 'Setup complete! Redirecting...')

      // Redirect to main app after short delay
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (error: any) {
      console.error('Failed to complete wizard:', error)
      showMessage('error', 'Failed to complete setup')
    } finally {
      setSaving(false)
    }
  }

  const skipWizard = () => {
    // Mark wizard as dismissed
    localStorage.setItem(getStorageKey('wizard_dismissed'), 'true')

    // Redirect to main app
    navigate('/')
  }

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const toggleApiKeyVisibility = (field: string) => {
    setShowApiKeys(prev => ({ ...prev, [field]: !prev[field] }))
  }


  // Get next step based on current step and setup type
  const getNextStep = (current: WizardStep): WizardStep | null => {
    const visibleSteps = STEP_VISIBILITY[setupType]
    const currentIndex = visibleSteps.indexOf(current)
    if (currentIndex === -1 || currentIndex === visibleSteps.length - 1) {
      return null
    }
    return visibleSteps[currentIndex + 1]
  }

  // Get previous step based on current step and setup type
  const getPreviousStep = (current: WizardStep): WizardStep | null => {
    const visibleSteps = STEP_VISIBILITY[setupType]
    const currentIndex = visibleSteps.indexOf(current)
    if (currentIndex <= 0) {
      return null
    }
    return visibleSteps[currentIndex - 1]
  }

  const handleNext = async () => {
    // Save current step data if needed
    if (currentStep === 'api_keys') {
      const saved = await saveApiKeys()
      if (!saved) return
    } else if (currentStep === 'llm_setup') {
      const saved = await saveLLMSetup()
      if (!saved) return
    } else if (currentStep === 'transcription_setup') {
      const saved = await saveTranscriptionSetup()
      if (!saved) return
    } else if (currentStep === 'memory_setup') {
      const saved = await saveMemorySetup()
      if (!saved) return
    } else if (currentStep === 'services_setup') {
      const saved = await saveServicesSetup()
      if (!saved) return
    }

    // Navigate to next step
    const nextStep = getNextStep(currentStep)
    if (nextStep) {
      if (nextStep === 'complete') {
        await completeWizard()
      }
      setCurrentStep(nextStep)
    }
  }

  const handleBack = () => {
    const previousStep = getPreviousStep(currentStep)
    if (previousStep) {
      setCurrentStep(previousStep)
    }
  }

  const canProceed = () => {
    if (currentStep === 'setup_type') return true

    if (currentStep === 'api_keys') {
      // Basic mode: Require OpenAI and Deepgram keys (allow masked keys from backend)
      const hasOpenAI = apiKeys.openai_api_key && apiKeys.openai_api_key.trim() !== ''
      const hasDeepgram = apiKeys.deepgram_api_key && apiKeys.deepgram_api_key.trim() !== ''
      return hasOpenAI && hasDeepgram
    }

    if (currentStep === 'llm_setup') {
      // For OpenAI: Require API key (allow masked keys from backend)
      if (llmSetup.provider === 'openai') {
        return llmSetup.openai_api_key && llmSetup.openai_api_key.trim() !== ''
      }
      // For Ollama: Require base URL and model names
      if (llmSetup.provider === 'ollama') {
        return llmSetup.ollama_base_url && llmSetup.ollama_model && llmSetup.ollama_embedder_model
      }
      return false
    }

    if (currentStep === 'transcription_setup') {
      // For Deepgram: Require API key (allow masked keys from backend)
      if (transcriptionSetup.provider === 'deepgram') {
        return transcriptionSetup.deepgram_api_key && transcriptionSetup.deepgram_api_key.trim() !== ''
      }
      // For Mistral: Require API key (allow masked keys from backend)
      if (transcriptionSetup.provider === 'mistral') {
        return transcriptionSetup.mistral_api_key && transcriptionSetup.mistral_api_key.trim() !== ''
      }
      // For Parakeet: Require URL
      if (transcriptionSetup.provider === 'parakeet') {
        return transcriptionSetup.parakeet_url && transcriptionSetup.parakeet_url.trim() !== ''
      }
      return false
    }

    if (currentStep === 'memory_setup') {
      // Chronicle: No additional config needed
      if (memorySetup.provider === 'chronicle') {
        return true
      }
      // OpenMemory: Require server URL
      if (memorySetup.provider === 'openmemory_mcp') {
        return memorySetup.openmemory_server_url && memorySetup.openmemory_server_url.trim() !== ''
      }
      // Mycelia: Require URL
      if (memorySetup.provider === 'mycelia') {
        return memorySetup.mycelia_url && memorySetup.mycelia_url.trim() !== ''
      }
      return false
    }

    if (currentStep === 'services_setup') {
      // Services step is optional - always allow proceeding
      return true
    }

    if (currentStep === 'complete') return true
    return false
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        {/* Header */}
        <div className="p-8 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome to Chronicle
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Let's get your system set up in just a few steps
              </p>
            </div>
            {/* Skip button (only show on setup_type and api_keys steps) */}
            {currentStep !== 'complete' && (
              <button
                onClick={skipWizard}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                Skip for now
              </button>
            )}
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="p-8 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-3">
            {/* Step indicator */}
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>
                {currentStep === 'setup_type' && 'Step 1: Choose Setup Type'}
                {currentStep === 'api_keys' && 'Step 2: Enter API Keys'}
                {currentStep === 'llm_setup' && 'Step 2: Configure LLM'}
                {currentStep === 'transcription_setup' && 'Step 3: Configure Transcription'}
                {currentStep === 'memory_setup' && 'Step 4: Configure Memory'}
                {currentStep === 'services_setup' && 'Step 5: Configure Services'}
                {currentStep === 'complete' && 'Setup Complete'}
              </span>
              <span>
                {STEP_VISIBILITY[setupType].indexOf(currentStep) + 1} / {STEP_VISIBILITY[setupType].length}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${((STEP_VISIBILITY[setupType].indexOf(currentStep) + 1) / STEP_VISIBILITY[setupType].length) * 100}%`
                }}
              />
            </div>

            {/* Step labels */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
              <span>Setup Type</span>
              <span>LLM</span>
              <span>Transcription</span>
              <span>Memory</span>
              {setupType === 'customized' && <span>Services</span>}
              <span>Done</span>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`p-4 mx-8 mt-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400'
              : message.type === 'error'
              ? 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400'
              : 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400'
          }`}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{message.text}</span>
          </div>
        )}

        {/* Step Content */}
        <div className="p-8 min-h-[400px]">
          {/* Setup Type Step */}
          {currentStep === 'setup_type' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Welcome to Chronicle
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Chronicle is your AI-powered personal memory system. Choose your setup type to get started.
                </p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  What you'll need:
                </h3>
                <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>OpenAI API Key</strong> - For memory extraction and LLM features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Deepgram or Mistral API Key</strong> - For audio transcription</span>
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Basic Setup */}
                <button
                  onClick={() => setSetupType('basic')}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    setupType === 'basic'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Sparkles className={`w-6 h-6 ${setupType === 'basic' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Basic
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Quick setup with recommended providers
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <li>• OpenAI</li>
                    <li>• Deepgram</li>
                  </ul>
                </button>

                {/* Intermediate Setup */}
                <button
                  onClick={() => setSetupType('intermediate')}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    setupType === 'intermediate'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Settings className={`w-6 h-6 ${setupType === 'intermediate' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Intermediate
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Choose your LLM and transcription providers
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <li>• OpenAI</li>
                    <li>• Deepgram / Mistral</li>
                  </ul>
                </button>

                {/* Customized Setup */}
                <button
                  onClick={() => setSetupType('customized')}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    setupType === 'customized'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Sliders className={`w-6 h-6 ${setupType === 'customized' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Customized
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Full control over all services
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <li>• All LLM options</li>
                    <li>• All transcription options</li>
                    <li>• Optional services</li>
                  </ul>
                </button>
              </div>
            </div>
          )}

          {/* API Keys Step (Basic mode only) */}
          {currentStep === 'api_keys' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Enter Your API Keys
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Enter your OpenAI and Deepgram API keys to get started with Chronicle.
                </p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  What you'll need:
                </h3>
                <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>OpenAI API Key</strong> - For memory extraction and LLM features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Deepgram API Key</strong> - For audio transcription</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                {/* OpenAI API Key */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      OpenAI API Key *
                    </label>
                    <a
                      href={API_KEY_LINKS.openai}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                    >
                      Get API Key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKeys.openai_api_key ? 'text' : 'password'}
                      value={apiKeys.openai_api_key}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, openai_api_key: e.target.value }))}
                      placeholder="sk-..."
                      className="w-full px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleApiKeyVisibility('openai_api_key')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      {showApiKeys.openai_api_key ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Used for memory extraction and chat features
                  </p>
                </div>

                {/* Deepgram API Key */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Deepgram API Key *
                    </label>
                    <a
                      href={API_KEY_LINKS.deepgram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                    >
                      Get API Key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKeys.deepgram_api_key ? 'text' : 'password'}
                      value={apiKeys.deepgram_api_key}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, deepgram_api_key: e.target.value }))}
                      placeholder="Enter Deepgram API key"
                      className="w-full px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleApiKeyVisibility('deepgram_api_key')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      {showApiKeys.deepgram_api_key ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    High-quality audio transcription
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* LLM Setup Step */}
          {currentStep === 'llm_setup' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Configure Language Model
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Select and configure your LLM provider for memory extraction and chat features.
                </p>
              </div>

              {/* LLM Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  LLM Provider
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={() => setLLMSetup(prev => ({ ...prev, provider: 'openai' }))}
                    disabled={setupType === 'basic'} // Basic only allows OpenAI
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      llmSetup.provider === 'openai'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    } ${setupType === 'basic' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">OpenAI</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Cloud-based LLM (Recommended)</p>
                  </button>
                  <button
                    onClick={() => setLLMSetup(prev => ({ ...prev, provider: 'ollama' }))}
                    disabled={setupType === 'basic'} // Basic doesn't support Ollama
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      llmSetup.provider === 'ollama'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    } ${setupType === 'basic' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Ollama</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Local LLM server</p>
                    {setupType === 'basic' && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Not available in Basic setup</p>
                    )}
                  </button>
                </div>
              </div>

              {/* OpenAI Configuration */}
              {llmSetup.provider === 'openai' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        OpenAI API Key *
                      </label>
                      <a
                        href={API_KEY_LINKS.openai}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                      >
                        Get API Key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showApiKeys.openai_api_key ? 'text' : 'password'}
                        value={llmSetup.openai_api_key}
                        onChange={(e) => setLLMSetup(prev => ({ ...prev, openai_api_key: e.target.value }))}
                        placeholder="sk-..."
                        className="w-full px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => toggleApiKeyVisibility('openai_api_key')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {showApiKeys.openai_api_key ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      OpenAI Model
                    </label>
                    <input
                      type="text"
                      value={llmSetup.openai_model}
                      onChange={(e) => setLLMSetup(prev => ({ ...prev, openai_model: e.target.value }))}
                      placeholder="gpt-4o-mini"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: gpt-4o-mini</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      OpenAI Base URL
                    </label>
                    <input
                      type="text"
                      value={llmSetup.openai_base_url}
                      onChange={(e) => setLLMSetup(prev => ({ ...prev, openai_base_url: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: https://api.openai.com/v1</p>
                  </div>
                </div>
              )}

              {/* Ollama Configuration */}
              {llmSetup.provider === 'ollama' && (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      Ollama must be installed and running for Chronicle to function.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ollama Base URL *
                    </label>
                    <input
                      type="text"
                      value={llmSetup.ollama_base_url}
                      onChange={(e) => setLLMSetup(prev => ({ ...prev, ollama_base_url: e.target.value }))}
                      placeholder="http://ollama:11434"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ollama Model *
                    </label>
                    <input
                      type="text"
                      value={llmSetup.ollama_model}
                      onChange={(e) => setLLMSetup(prev => ({ ...prev, ollama_model: e.target.value }))}
                      placeholder="llama3.1:latest"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The Ollama model to use for LLM tasks</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ollama Embedder Model *
                    </label>
                    <input
                      type="text"
                      value={llmSetup.ollama_embedder_model}
                      onChange={(e) => setLLMSetup(prev => ({ ...prev, ollama_embedder_model: e.target.value }))}
                      placeholder="nomic-embed-text:latest"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The Ollama model to use for text embeddings</p>
                  </div>

                  <div className="flex items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <input
                      type="checkbox"
                      id="install_ollama"
                      checked={llmSetup.install_ollama_container}
                      onChange={(e) => setLLMSetup(prev => ({ ...prev, install_ollama_container: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="install_ollama" className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                      Install Ollama container automatically
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transcription Setup Step */}
          {currentStep === 'transcription_setup' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Configure Transcription
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Select and configure your transcription provider for audio-to-text conversion.
                </p>
              </div>

              {/* Transcription Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Transcription Provider
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => setTranscriptionSetup(prev => ({ ...prev, provider: 'deepgram' }))}
                    disabled={setupType === 'basic'} // Basic only allows Deepgram
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      transcriptionSetup.provider === 'deepgram'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    } ${setupType === 'basic' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Deepgram</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">High quality (Recommended)</p>
                  </button>
                  <button
                    onClick={() => setTranscriptionSetup(prev => ({ ...prev, provider: 'mistral' }))}
                    disabled={setupType === 'basic'} // Basic doesn't support Mistral
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      transcriptionSetup.provider === 'mistral'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    } ${setupType === 'basic' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Mistral</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Voxtral models</p>
                    {setupType === 'basic' && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Not available in Basic setup</p>
                    )}
                  </button>
                  <button
                    onClick={() => setTranscriptionSetup(prev => ({ ...prev, provider: 'parakeet' }))}
                    disabled={setupType === 'basic' || setupType === 'intermediate'} // Only customized supports Parakeet
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      transcriptionSetup.provider === 'parakeet'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    } ${(setupType === 'basic' || setupType === 'intermediate') ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Parakeet</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Local offline ASR</p>
                    {(setupType === 'basic' || setupType === 'intermediate') && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Only in Customized setup</p>
                    )}
                  </button>
                </div>
              </div>

              {/* Deepgram Configuration */}
              {transcriptionSetup.provider === 'deepgram' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Deepgram API Key *
                      </label>
                      <a
                        href={API_KEY_LINKS.deepgram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                      >
                        Get API Key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showApiKeys.deepgram_api_key ? 'text' : 'password'}
                        value={transcriptionSetup.deepgram_api_key}
                        onChange={(e) => setTranscriptionSetup(prev => ({ ...prev, deepgram_api_key: e.target.value }))}
                        placeholder="Enter Deepgram API key"
                        className="w-full px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => toggleApiKeyVisibility('deepgram_api_key')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {showApiKeys.deepgram_api_key ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      High-quality audio transcription
                    </p>
                  </div>
                </div>
              )}

              {/* Mistral Configuration */}
              {transcriptionSetup.provider === 'mistral' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Mistral API Key *
                      </label>
                      <a
                        href={API_KEY_LINKS.mistral}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                      >
                        Get API Key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showApiKeys.mistral_api_key ? 'text' : 'password'}
                        value={transcriptionSetup.mistral_api_key}
                        onChange={(e) => setTranscriptionSetup(prev => ({ ...prev, mistral_api_key: e.target.value }))}
                        placeholder="Enter Mistral API key"
                        className="w-full px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => toggleApiKeyVisibility('mistral_api_key')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {showApiKeys.mistral_api_key ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Uses Voxtral models for transcription
                    </p>
                  </div>
                </div>
              )}

              {/* Parakeet Configuration */}
              {transcriptionSetup.provider === 'parakeet' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      Parakeet is a local, offline transcription service for privacy-focused deployments.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Parakeet ASR URL *
                    </label>
                    <input
                      type="text"
                      value={transcriptionSetup.parakeet_url}
                      onChange={(e) => setTranscriptionSetup(prev => ({ ...prev, parakeet_url: e.target.value }))}
                      placeholder="http://parakeet-asr:8767"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      URL where Parakeet ASR service is running
                    </p>
                  </div>

                  <div className="flex items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <input
                      type="checkbox"
                      id="install_parakeet"
                      checked={transcriptionSetup.install_parakeet_container}
                      onChange={(e) => setTranscriptionSetup(prev => ({ ...prev, install_parakeet_container: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="install_parakeet" className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                      Install Parakeet ASR container automatically
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Memory Setup Step */}
          {currentStep === 'memory_setup' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Configure Memory Storage
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Select and configure your memory storage provider for conversation memories.
                </p>
              </div>

              {/* Memory Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Memory Provider
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => setMemorySetup(prev => ({ ...prev, provider: 'chronicle' }))}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      memorySetup.provider === 'chronicle'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Chronicle</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Native memory engine (Recommended)</p>
                  </button>
                  <button
                    onClick={() => setMemorySetup(prev => ({ ...prev, provider: 'openmemory_mcp' }))}
                    disabled={setupType === 'basic'} // Basic doesn't support OpenMemory
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      memorySetup.provider === 'openmemory_mcp'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    } ${setupType === 'basic' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">OpenMemory MCP</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">OpenMemory server via MCP</p>
                    {setupType === 'basic' && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Not available in Basic setup</p>
                    )}
                  </button>
                  <button
                    onClick={() => setMemorySetup(prev => ({ ...prev, provider: 'mycelia' }))}
                    disabled={setupType === 'basic'} // Basic doesn't support Mycelia
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      memorySetup.provider === 'mycelia'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    } ${setupType === 'basic' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Mycelia</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Mycelia memory backend</p>
                    {setupType === 'basic' && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Not available in Basic setup</p>
                    )}
                  </button>
                </div>
              </div>

              {/* Chronicle Configuration */}
              {memorySetup.provider === 'chronicle' && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Chronicle's native memory engine uses Qdrant for vector storage and is automatically configured. No additional setup required.
                  </p>
                </div>
              )}

              {/* OpenMemory MCP Configuration */}
              {memorySetup.provider === 'openmemory_mcp' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      OpenMemory MCP provides cross-client memory compatibility using the Model Context Protocol.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowOpenMemoryWizard(true)}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    <Settings className="w-5 h-5" />
                    Configure OpenMemory Setup
                  </button>

                  {memorySetup.openmemory_server_url && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-300">
                        <strong>Server URL:</strong> {memorySetup.openmemory_server_url}
                      </p>
                      {memorySetup.openmemory_enable_graph && (
                        <p className="text-sm text-green-800 dark:text-green-300 mt-1">
                          <strong>Graph Memory:</strong> Enabled with Neo4j
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Mycelia Configuration */}
              {memorySetup.provider === 'mycelia' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      Mycelia is an alternative memory backend for Chronicle.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Mycelia URL *
                    </label>
                    <input
                      type="text"
                      value={memorySetup.mycelia_url}
                      onChange={(e) => setMemorySetup(prev => ({ ...prev, mycelia_url: e.target.value }))}
                      placeholder="http://mycelia:5173"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      URL where Mycelia service is running
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Services Setup Step (Customized only) */}
          {currentStep === 'services_setup' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Additional Services
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Configure optional services to enhance Chronicle's capabilities.
                </p>
              </div>

              <div className="space-y-4">
                {/* Speaker Recognition */}
                <div className="p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        Speaker Recognition
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Identify and differentiate between speakers in conversations using voice biometrics.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      id="enable_speaker_recognition"
                      checked={servicesSetup.enable_speaker_recognition}
                      onChange={(e) => setServicesSetup(prev => ({ ...prev, enable_speaker_recognition: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 ml-4 mt-1"
                    />
                  </div>
                </div>

                {/* Local Transcription */}
                <div className="p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        Local Transcription (Parakeet ASR)
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Install Parakeet ASR for offline, privacy-focused transcription without external API calls.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      id="enable_local_transcription"
                      checked={servicesSetup.enable_local_transcription}
                      onChange={(e) => setServicesSetup(prev => ({ ...prev, enable_local_transcription: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 ml-4 mt-1"
                    />
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    These services are optional and can be configured later in the Settings page.
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-green-600" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Setup Complete!
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                  Your Chronicle system is now configured and ready to use.
                </p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-left">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Next Steps:
                </h3>
                <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Start recording conversations or upload audio files</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>View and search your memories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Chat with your AI assistant about your memories</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-8 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 'setup_type' || saving}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={!canProceed() || saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                {currentStep === 'complete' ? 'Go to Dashboard' : 'Next'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* OpenMemory Wizard Overlay */}
      {showOpenMemoryWizard && (
        <OpenMemoryWizard
          userName="chronicle"
          environmentName="production"
          onCancel={() => setShowOpenMemoryWizard(false)}
          onComplete={(config) => {
            setMemorySetup(prev => ({
              ...prev,
              openmemory_server_url: config.server_url,
              openmemory_enable_graph: config.enable_graph_memory,
              openmemory_neo4j_password: config.neo4j_password || '',
            }))
            setShowOpenMemoryWizard(false)
            showMessage('success', 'OpenMemory configuration saved')
          }}
        />
      )}
    </div>
  )
}
