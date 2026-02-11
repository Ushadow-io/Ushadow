import { useState } from 'react'
import { Check, AlertCircle, Loader, Plus, X } from 'lucide-react'
import Modal from '../Modal'
import { kubernetesApi } from '../../services/api'

interface AddServiceDNSModalProps {
  isOpen: boolean
  onClose: () => void
  clusterId: string
  domain: string
  onSuccess: () => void
}

export default function AddServiceDNSModal({
  isOpen,
  onClose,
  clusterId,
  domain,
  onSuccess
}: AddServiceDNSModalProps) {
  const [serviceName, setServiceName] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [shortnames, setShortnames] = useState<string[]>([''])
  const [useIngress, setUseIngress] = useState(true)
  const [enableTls, setEnableTls] = useState(true)
  const [servicePort, setServicePort] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleAddShortname = () => {
    setShortnames([...shortnames, ''])
  }

  const handleRemoveShortname = (index: number) => {
    setShortnames(shortnames.filter((_, i) => i !== index))
  }

  const handleShortnameChange = (index: number, value: string) => {
    const newShortnames = [...shortnames]
    newShortnames[index] = value
    setShortnames(newShortnames)
  }

  const handleAdd = async () => {
    // Validation
    if (!serviceName.trim()) {
      setError('Service name is required')
      return
    }

    const validShortnames = shortnames.filter(s => s.trim())
    if (validShortnames.length === 0) {
      setError('At least one shortname is required')
      return
    }

    if (!useIngress && !servicePort) {
      setError('Service port is required when not using Ingress')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await kubernetesApi.addServiceDns(clusterId, domain, {
        service_name: serviceName.trim(),
        namespace: namespace.trim(),
        shortnames: validShortnames,
        use_ingress: useIngress,
        enable_tls: enableTls,
        service_port: servicePort ? parseInt(servicePort) : undefined
      })

      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to add service DNS')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setServiceName('')
    setNamespace('default')
    setShortnames([''])
    setUseIngress(true)
    setEnableTls(true)
    setServicePort('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Service to DNS"
      maxWidth="md"
      testId="add-service-dns-modal"
    >
      {success ? (
        <div className="text-center py-8">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Service Added!</h3>
          <p className="text-sm text-gray-600">
            DNS entry and Ingress created successfully.
            {enableTls && ' TLS certificate will be issued automatically.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="service-name" className="block text-sm font-medium text-gray-700 mb-1">
                Service Name *
              </label>
              <input
                id="service-name"
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ushadow-frontend"
                disabled={loading}
                data-testid="add-service-name-input"
              />
            </div>

            <div>
              <label htmlFor="namespace" className="block text-sm font-medium text-gray-700 mb-1">
                Namespace *
              </label>
              <input
                id="namespace"
                type="text"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="default"
                disabled={loading}
                data-testid="add-service-namespace-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              DNS Short Names *
            </label>
            <div className="space-y-2">
              {shortnames.map((shortname, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={shortname}
                    onChange={(e) => handleShortnameChange(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={index === 0 ? 'ushadow' : 'app'}
                    disabled={loading}
                    data-testid={`add-service-shortname-${index}`}
                  />
                  {shortnames.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveShortname(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                      disabled={loading}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddShortname}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                disabled={loading}
              >
                <Plus className="w-4 h-4" />
                <span>Add alias</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              First name will be used as FQDN: {shortnames[0] || 'name'}.{domain}
            </p>
          </div>

          <div className="flex items-center">
            <input
              id="use-ingress"
              type="checkbox"
              checked={useIngress}
              onChange={(e) => setUseIngress(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={loading}
              data-testid="add-service-use-ingress-checkbox"
            />
            <label htmlFor="use-ingress" className="ml-2 block text-sm text-gray-900">
              Use Ingress Controller (recommended for HTTP services)
            </label>
          </div>

          {!useIngress && (
            <div>
              <label htmlFor="service-port" className="block text-sm font-medium text-gray-700 mb-1">
                Service Port *
              </label>
              <input
                id="service-port"
                type="number"
                value={servicePort}
                onChange={(e) => setServicePort(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="8000"
                disabled={loading}
                data-testid="add-service-port-input"
              />
            </div>
          )}

          <div className="flex items-center">
            <input
              id="enable-tls"
              type="checkbox"
              checked={enableTls}
              onChange={(e) => setEnableTls(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={loading}
              data-testid="add-service-enable-tls-checkbox"
            />
            <label htmlFor="enable-tls" className="ml-2 block text-sm text-gray-900">
              Enable TLS certificate (Let's Encrypt)
            </label>
          </div>

          {error && (
            <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">This will create:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>DNS mapping in CoreDNS</li>
              <li>Ingress resource for HTTP routing</li>
              {enableTls && <li>TLS certificate (auto-issued)</li>}
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
              onClick={handleAdd}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              disabled={loading}
              data-testid="add-service-dns-submit-button"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <span>Add Service</span>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
