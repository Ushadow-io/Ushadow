import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext'
import { WizardProvider } from './contexts/WizardContext'

// Detect runtime base path for path-based routing (e.g., /wiz/, /prod/)
const getBasename = () => {
  const { pathname, port, protocol } = window.location
  const isStandardPort = (protocol === 'https:' && (port === '' || port === '443')) ||
                         (protocol === 'http:' && (port === '' || port === '80'))

  if (!isStandardPort) return '/' // Dev mode - no base path

  // Extract first path segment as base path (e.g., /wiz from /wiz/settings)
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length > 0 && !segments[0].includes('.')) {
    return `/${segments[0]}`
  }
  return '/'
}
import ProtectedRoute from './components/auth/ProtectedRoute'
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
import FeatureFlags from './pages/FeatureFlags'
import ClusterPage from './pages/ClusterPage'

// Wizards (all use WizardShell pattern)
import {
  TailscaleWizard,
  ChronicleWizard,
  MemoryWizard,
  QuickstartWizard,
} from './wizards'
import KubernetesClustersPage from './pages/KubernetesClustersPage'

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <FeatureFlagsProvider>
          <WizardProvider>
            <BrowserRouter basename={getBasename()}>
              <Routes>
     
              {/* Public Routes */}
              <Route path="/register" element={<RegistrationPage />} />
              <Route path="/login" element={<LoginPage />} />

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
                <Route path="wizard/memory" element={<MemoryWizard />} />
                <Route path="wizard/chronicle" element={<ChronicleWizard />} />
                <Route path="wizard/tailscale" element={<TailscaleWizard />} />
                <Route path="chronicle" element={<ChroniclePage />} />
                <Route path="mcp" element={<MCPPage />} />
                <Route path="agent-zero" element={<AgentZeroPage />} />
                <Route path="n8n" element={<N8NPage />} />
                <Route path="services" element={<ServicesPage />} />
                <Route path="cluster" element={<ClusterPage />} />
                <Route path="kubernetes" element={<KubernetesClustersPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="feature-flags" element={<FeatureFlags />} />

                {/* Catch-all redirect to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
              </Routes>
            </BrowserRouter>
          </WizardProvider>
          </FeatureFlagsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
