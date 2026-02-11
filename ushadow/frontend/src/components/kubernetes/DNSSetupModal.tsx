import { useState } from 'react'
import { Check, AlertCircle, Loader } from 'lucide-react'
import Modal from '../Modal'
import { kubernetesApi } from '../../services/api'

interface DNSSetupModalProps {
  isOpen: boolean
  onClose: () => void
  clusterId: string
  clusterName: string
  onSuccess: () => void
}

export default function DNSSetupModal({
  isOpen,
  onClose,
  clusterId,
  clusterName,
  onSuccess
}: DNSSetupModalProps) {
  const [domain, setDomain] = useState('')
  const [acmeEmail, setAcmeEmail] = useState('')
  const [installCertManager, setInstallCertManager] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSetup = async () => {
    if (!domain.trim()) {
      setError('Domain is required')
      return
    }

    if (installCertManager && !acmeEmail.trim()) {
      setError('Email is required for Let\'s Encrypt certificates')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await kubernetesApi.setupDns(clusterId, {
        domain: domain.trim(),
        acme_email: acmeEmail.trim() || undefined,
        install_cert_manager: installCertManager
      })

      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to setup DNS')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setDomain('')
    setAcmeEmail('')
    setInstallCertManager(true)
    setError(null)
    setSuccess(false)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Setup DNS for ${clusterName}`}
      maxWidth="md"
      testId="dns-setup-modal"
    >
      {success ? (
        <div className="text-center py-8">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">DNS Setup Complete!</h3>
          <p className="text-sm text-gray-600">
            You can now add services to DNS with custom domain names and TLS certificates.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Setup custom DNS for your Kubernetes services with automatic TLS certificates via Let's Encrypt.
          </p>

          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
              Custom Domain *
            </label>
            <input
              id="domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., chakra, mycompany, dev"
              disabled={loading}
              data-testid="dns-setup-domain-input"
            />
            <p className="text-xs text-gray-500 mt-1">
              Services will be accessible as: servicename.{domain || 'domain'}
            </p>
          </div>

          <div className="flex items-center">
            <input
              id="install-cert-manager"
              type="checkbox"
              checked={installCertManager}
              onChange={(e) => setInstallCertManager(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={loading}
              data-testid="dns-setup-cert-manager-checkbox"
            />
            <label htmlFor="install-cert-manager" className="ml-2 block text-sm text-gray-900">
              Install cert-manager for TLS certificates
            </label>
          </div>

          {installCertManager && (
            <div>
              <label htmlFor="acme-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email for Let's Encrypt *
              </label>
              <input
                id="acme-email"
                type="email"
                value={acmeEmail}
                onChange={(e) => setAcmeEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@example.com"
                disabled={loading}
                data-testid="dns-setup-email-input"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used for certificate expiration notifications
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">What this does:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Installs cert-manager (if selected)</li>
              <li>Creates Let's Encrypt certificate issuer</li>
              <li>Configures CoreDNS for custom DNS</li>
              <li>Enables automatic TLS certificates</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSetup}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              disabled={loading}
              data-testid="dns-setup-submit-button"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Setting up...</span>
                </>
              ) : (
                <span>Setup DNS</span>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
