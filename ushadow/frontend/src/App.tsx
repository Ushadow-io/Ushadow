import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext'
import { WizardProvider } from './contexts/WizardContext'
import { ChronicleProvider } from './contexts/ChronicleContext'
import EnvironmentFooter from './components/layout/EnvironmentFooter'
import BugReportButton from './components/BugReportButton'
import { useEnvironmentFavicon } from './hooks/useEnvironmentFavicon'

// Get router basename from Vite build config (for path-based deployments like /wiz/)
// Runtime detection was removed because it incorrectly treated app routes (/settings, /services)
// as base paths, causing path duplication bugs (/settings/settings, /services/wizard)
const getBasename = () => {
  const viteBase = import.meta.env.BASE_URL
  // Vite's BASE_URL is '/' by default, or the configured base path
  return viteBase === '/' ? '' : viteBase.replace(/\/$/, '')
}

import ProtectedRoute from './components/auth/ProtectedRoute'
import FeatureRoute from './components/auth/FeatureRoute'
import Layout from './components/layout/Layout'

// Pages
import RegistrationPage from './pages/RegistrationPage'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import WizardStartPage from './pages/WizardStartPage'
import ChroniclePage from './pages/ChroniclePage'
import MCPPage from './pages/MCPPage'
import AgentZeroPage from './pages/AgentZeroPage'
import N8NPage from './pages/N8NPage'
import ServicesPage from './pages/ServicesPage'
import SettingsPage from './pages/SettingsPage'
import MemoriesPage from './pages/MemoriesPage'
import ClusterPage from './pages/ClusterPage'
import SpeakerRecognitionPage from './pages/SpeakerRecognitionPage'
import ChatPage from './pages/ChatPage'

// Wizards (all use WizardShell pattern)
import {
  TailscaleWizard,
  ChronicleWizard,
  MemoryWizard,
  QuickstartWizard,
  LocalServicesWizard,
  MobileAppWizard,
  SpeakerRecognitionWizard,
} from './wizards'
import KubernetesClustersPage from './pages/KubernetesClustersPage'
import ColorSystemPreview from './components/ColorSystemPreview'

function AppContent() {
  // Set dynamic favicon based on environment
  useEnvironmentFavicon()

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Routes>
     
              {/* Public Routes */}
              <Route path="/register" element={<RegistrationPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/design-system" element={<ColorSystemPreview />} />

              {/* Protected Routes - All wrapped in Layout */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* Dashboard as default route */}
                <Route index element={<Dashboard />} />

                {/* Core feature pages */}
                <Route path="wizard" element={<Navigate to="/wizard/start" replace />} />
                <Route path="wizard/start" element={<WizardStartPage />} />
                <Route path="wizard/quickstart" element={<QuickstartWizard />} />
                <Route path="wizard/local" element={<LocalServicesWizard />} />
                <Route path="wizard/memory" element={<MemoryWizard />} />
                <Route path="wizard/chronicle" element={<ChronicleWizard />} />
                <Route path="wizard/tailscale" element={<TailscaleWizard />} />
                <Route path="wizard/mobile-app" element={<MobileAppWizard />} />
                <Route path="wizard/speaker-recognition" element={<SpeakerRecognitionWizard />} />
                <Route path="chronicle" element={<ChroniclePage />} />
                <Route path="speaker-recognition" element={<SpeakerRecognitionPage />} />
                <Route path="mcp" element={<FeatureRoute featureFlag="mcp_hub"><MCPPage /></FeatureRoute>} />
                <Route path="agent-zero" element={<FeatureRoute featureFlag="agent_zero"><AgentZeroPage /></FeatureRoute>} />
                <Route path="n8n" element={<FeatureRoute featureFlag="n8n_workflows"><N8NPage /></FeatureRoute>} />
                <Route path="services" element={<ServicesPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="memories" element={<MemoriesPage />} />
                <Route path="cluster" element={<ClusterPage />} />
                <Route path="kubernetes" element={<KubernetesClustersPage />} />
                <Route path="settings" element={<SettingsPage />} />

                {/* Catch-all redirect to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
        </Routes>
      </div>
      <BugReportButton />
      <EnvironmentFooter />
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <FeatureFlagsProvider>
            <WizardProvider>
              <ChronicleProvider>
                <BrowserRouter basename={getBasename()}>
                  <AppContent />
                </BrowserRouter>
              </ChronicleProvider>
            </WizardProvider>
          </FeatureFlagsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
