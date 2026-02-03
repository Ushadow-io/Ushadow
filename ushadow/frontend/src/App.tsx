import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { KeycloakAuthProvider } from './contexts/KeycloakAuthContext'
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext'
import { WizardProvider } from './contexts/WizardContext'
import { ChronicleProvider } from './contexts/ChronicleContext'
import { ToastProvider } from './contexts/ToastContext'
import EnvironmentFooter from './components/layout/EnvironmentFooter'
import BugReportButton from './components/BugReportButton'
import { useEnvironmentFavicon } from './hooks/useEnvironmentFavicon'
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion'

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
import ErrorPage from './pages/ErrorPage'
import OAuthCallback from './auth/OAuthCallback'
import Dashboard from './pages/Dashboard'
import WizardStartPage from './pages/WizardStartPage'
import ChroniclePage from './pages/ChroniclePage'
import ConversationsPage from './pages/ConversationsPage'
import ConversationDetailPage from './pages/ConversationDetailPage'
import RecordingPage from './pages/RecordingPage'
import MCPPage from './pages/MCPPage'
import AgentZeroPage from './pages/AgentZeroPage'
import N8NPage from './pages/N8NPage'
import ServicesPage from './pages/ServicesPage'
import SettingsPage from './pages/SettingsPage'
import ServiceConfigsPage from './pages/ServiceConfigsPage'
import InterfacesPage from './pages/InterfacesPage'
import MemoriesPage from './pages/MemoriesPage'
import MemoryDetailPage from './pages/MemoryDetailPage'
import ClusterPage from './pages/ClusterPage'
import SpeakerRecognitionPage from './pages/SpeakerRecognitionPage'
import ChatPage from './pages/ChatPage'
import TimelinePage from './pages/TimelinePage'

// Wizards (all use WizardShell pattern)
import {
  TailscaleWizard,
  ChronicleWizard,
  MemoryWizard,
  QuickstartWizard,
  LocalServicesWizard,
  MobileAppWizard,
  SpeakerRecognitionWizard,
  MyceliaWizard,
} from './wizards'
import KubernetesClustersPage from './pages/KubernetesClustersPage'
import ColorSystemPreview from './components/ColorSystemPreview'

function AppContent() {
  // Set dynamic favicon based on environment
  useEnvironmentFavicon()

  const { backendError, checkSetupStatus, isLoading, token } = useAuth()

  // Show error page if backend has configuration errors
  if (backendError) {
    return <ErrorPage error={backendError} onRetry={checkSetupStatus} />
  }

  // Check if on public route (login/register)
  const isPublicRoute = window.location.pathname === '/login' ||
                        window.location.pathname === '/register' ||
                        window.location.pathname === '/design-system'

  // Check if running in launcher mode (embedded iframe)
  const searchParams = new URLSearchParams(window.location.search)
  const isLauncherMode = searchParams.get('launcher') === 'true'

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 pb-16">
        <Routes>
     
              {/* Public Routes */}
              <Route path="/register" element={<RegistrationPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/design-system" element={<ColorSystemPreview />} />

              {/* Protected Routes - All wrapped in Layout */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <WizardProvider>
                      <ChronicleProvider>
                        <Layout />
                      </ChronicleProvider>
                    </WizardProvider>
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
                <Route path="wizard/mycelia" element={<MyceliaWizard />} />
                <Route path="chronicle" element={<FeatureRoute featureFlag="chronicle_page"><ChroniclePage /></FeatureRoute>} />
                <Route path="conversations" element={<ConversationsPage />} />
                <Route path="conversations/:id" element={<ConversationDetailPage />} />
                <Route path="recording" element={<RecordingPage />} />
                <Route path="speaker-recognition" element={<SpeakerRecognitionPage />} />
                <Route path="mcp" element={<FeatureRoute featureFlag="mcp_hub"><MCPPage /></FeatureRoute>} />
                <Route path="agent-zero" element={<FeatureRoute featureFlag="agent_zero"><AgentZeroPage /></FeatureRoute>} />
                <Route path="n8n" element={<FeatureRoute featureFlag="n8n_workflows"><N8NPage /></FeatureRoute>} />
                <Route path="services" element={<FeatureRoute featureFlag="legacy_services_page"><ServicesPage /></FeatureRoute>} />
                <Route path="instances" element={<FeatureRoute featureFlag="instances_management"><ServiceConfigsPage /></FeatureRoute>} />
                <Route path="interfaces" element={<InterfacesPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="memories" element={<MemoriesPage />} />
                <Route path="memories/:id" element={<MemoryDetailPage />} />
                <Route path="timeline" element={<FeatureRoute featureFlag="timeline"><TimelinePage /></FeatureRoute>} />
                <Route path="cluster" element={<ClusterPage />} />
                <Route path="kubernetes" element={<KubernetesClustersPage />} />
                <Route path="settings" element={<SettingsPage />} />

                {/* Catch-all redirect to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
        </Routes>
      </div>
      <BugReportButton />
      {/* Only show footer on protected routes and when not in launcher mode */}
      {!isPublicRoute && !isLauncherMode && <EnvironmentFooter />}
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <VibeKanbanWebCompanion />
<<<<<<< HEAD
          <AuthProvider>
            <FeatureFlagsProvider>
              <BrowserRouter basename={getBasename()}>
                <AppContent />
              </BrowserRouter>
            </FeatureFlagsProvider>
          </AuthProvider>
=======
          <KeycloakAuthProvider>
            <AuthProvider>
              <FeatureFlagsProvider>
                <BrowserRouter basename={getBasename()}>
                  <AppContent />
                </BrowserRouter>
              </FeatureFlagsProvider>
            </AuthProvider>
          </KeycloakAuthProvider>
>>>>>>> 0e9fc19e (feat: Add Keycloak SSO integration with conversation sharing)
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
// HMR test at Sat 17 Jan 2026 12:59:49 GMT
// HMR polling test 1768654877
