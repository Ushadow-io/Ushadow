import { useState, useEffect } from 'react'
import { Globe, Plus, Trash2, Shield, CheckCircle, XCircle, AlertCircle, RefreshCw, Loader } from 'lucide-react'
import { kubernetesApi, DNSStatus, type CertificateStatus } from '../../services/api'
import DNSSetupModal from './DNSSetupModal'
import AddServiceDNSModal from './AddServiceDNSModal'

interface DNSManagementPanelProps {
  clusterId: string
  clusterName: string
}

export default function DNSManagementPanel({ clusterId, clusterName }: DNSManagementPanelProps) {
  const [dnsStatus, setDnsStatus] = useState<DNSStatus | null>(null)
  const [certificates, setCertificates] = useState<CertificateStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [showAddServiceModal, setShowAddServiceModal] = useState(false)
  const [removingService, setRemovingService] = useState<string | null>(null)

  useEffect(() => {
    loadDnsStatus()
  }, [clusterId])

  const loadDnsStatus = async () => {
    setLoading(true)
    try {
      // Try to get status with domain if we have one
      const storedDomain = localStorage.getItem(`dns-domain-${clusterId}`)
      const status = await kubernetesApi.getDnsStatus(clusterId, storedDomain || undefined)
      setDnsStatus(status)

      // If configured, load certificates
      if (status.configured && status.cert_manager_installed) {
        const certsData = await kubernetesApi.listCertificates(clusterId)
        setCertificates(certsData.certificates)
      }
    } catch (err: any) {
      console.error('Failed to load DNS status:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSetupSuccess = () => {
    loadDnsStatus()
  }

  const handleAddServiceSuccess = () => {
    loadDnsStatus()
  }

  const handleRemoveService = async (serviceName: string, namespace: string) => {
    if (!dnsStatus?.domain) return

    if (!confirm(`Remove DNS for ${serviceName}? This will delete the DNS entry and Ingress.`)) {
      return
    }

    setRemovingService(serviceName)
    try {
      await kubernetesApi.removeServiceDns(clusterId, serviceName, dnsStatus.domain, namespace)
      loadDnsStatus()
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || 'Failed to remove DNS')
    } finally {
      setRemovingService(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!dnsStatus?.configured) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Globe className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">DNS Not Configured</h3>
        <p className="text-sm text-gray-600 mb-6">
          Setup custom DNS to access services via short, memorable names with automatic TLS certificates.
        </p>
        <button
          onClick={() => setShowSetupModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          data-testid="dns-setup-button"
        >
          Setup DNS
        </button>

        <DNSSetupModal
          isOpen={showSetupModal}
          onClose={() => setShowSetupModal(false)}
          clusterId={clusterId}
          clusterName={clusterName}
          onSuccess={handleSetupSuccess}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* DNS Status Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
              <Globe className="w-5 h-5" />
              <span>DNS Configuration</span>
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Domain: <span className="font-mono font-medium">{dnsStatus.domain}</span>
            </p>
          </div>
          <button
            onClick={loadDnsStatus}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">CoreDNS:</span>
            <span className="ml-2 font-mono">{dnsStatus.coredns_ip || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-600">Ingress:</span>
            <span className="ml-2 font-mono">{dnsStatus.ingress_ip || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-600">Services:</span>
            <span className="ml-2 font-medium">{dnsStatus.total_services}</span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-600">cert-manager:</span>
            {dnsStatus.cert_manager_installed ? (
              <span className="ml-2 flex items-center text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                Installed
              </span>
            ) : (
              <span className="ml-2 flex items-center text-gray-400">
                <XCircle className="w-4 h-4 mr-1" />
                Not installed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Services List */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-medium text-gray-900">Services with DNS</h4>
            <button
              onClick={() => setShowAddServiceModal(true)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center space-x-1"
              data-testid="add-service-dns-button"
            >
              <Plus className="w-4 h-4" />
              <span>Add Service</span>
            </button>
          </div>
        </div>

        {dnsStatus.mappings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No services added yet. Click "Add Service" to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {dnsStatus.mappings.map((mapping) => {
              const cert = certificates.find(c =>
                c.dns_names.some(dn => dn === mapping.fqdn || mapping.shortnames.includes(dn))
              )

              return (
                <div key={mapping.fqdn} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h5 className="font-medium text-gray-900">{mapping.fqdn}</h5>
                        {mapping.has_tls && (
                          <div className="flex items-center space-x-1">
                            {cert?.ready ? (
                              <span className="flex items-center text-xs text-green-600">
                                <Shield className="w-3 h-3 mr-1" />
                                TLS Ready
                              </span>
                            ) : (
                              <span className="flex items-center text-xs text-yellow-600">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                TLS Pending
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        <span className="font-mono">{mapping.ip}</span>
                        {mapping.shortnames.length > 0 && (
                          <span className="ml-4">
                            Aliases: {mapping.shortnames.map(n => (
                              <span key={n} className="inline-block bg-gray-100 px-2 py-0.5 rounded text-xs font-mono ml-1">
                                {n}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>

                      {cert && (
                        <div className="mt-2 text-xs text-gray-500">
                          Expires: {cert.not_after ? new Date(cert.not_after).toLocaleDateString() : 'Unknown'}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        // Extract service name from FQDN (remove .domain)
                        const serviceName = mapping.fqdn.split('.')[0]
                        handleRemoveService(serviceName, 'default')
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
                      disabled={removingService === mapping.fqdn.split('.')[0]}
                      title="Remove DNS"
                    >
                      {removingService === mapping.fqdn.split('.')[0] ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Certificates */}
      {dnsStatus.cert_manager_installed && certificates.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-base font-medium text-gray-900 mb-4">TLS Certificates</h4>
          <div className="space-y-3">
            {certificates.map((cert) => (
              <div key={cert.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm">{cert.name}</span>
                    {cert.ready ? (
                      <span className="flex items-center text-xs text-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Ready
                      </span>
                    ) : (
                      <span className="flex items-center text-xs text-yellow-600">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {cert.dns_names.join(', ')}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {cert.not_after && `Expires ${new Date(cert.not_after).toLocaleDateString()}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddServiceDNSModal
        isOpen={showAddServiceModal}
        onClose={() => setShowAddServiceModal(false)}
        clusterId={clusterId}
        domain={dnsStatus.domain || ''}
        onSuccess={handleAddServiceSuccess}
      />
    </div>
  )
}
