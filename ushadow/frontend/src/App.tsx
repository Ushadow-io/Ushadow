import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext'
import { WizardProvider } from './contexts/WizardContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Layout from './components/layout/Layout'

// Pages
import RegistrationPage from './pages/RegistrationPage'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import WizardStartPage from './pages/WizardStartPage'
import MemoryWizardPage from './pages/MemoryWizardPage'
import ChronicleWizardPage from './pages/ChronicleWizardPage'
import ChroniclePage from './pages/ChroniclePage'
import MCPPage from './pages/MCPPage'
import AgentZeroPage from './pages/AgentZeroPage'
import N8NPage from './pages/N8NPage'
import ServicesPage from './pages/ServicesPage'
import SettingsPage from './pages/SettingsPage'
import FeatureFlags from './pages/FeatureFlags'
import ClusterPage from './pages/ClusterPage'
import KubernetesClustersPage from './pages/KubernetesClustersPage'

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <FeatureFlagsProvider>
          <WizardProvider>
            <BrowserRouter>
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
                <Route path="wizard/memory" element={<MemoryWizardPage />} />
                <Route path="wizard/chronicle" element={<ChronicleWizardPage />} />
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
