import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { references } from '../api/client'

export default function SetupPage() {
  const [status, setStatus] = useState(null)
  const [availableFiles, setAvailableFiles] = useState({})
  const [downloadStatus, setDownloadStatus] = useState({})
  const [selectedBuild, setSelectedBuild] = useState('GRCh38')
  const [loading, setLoading] = useState(true)

  const loadStatus = async () => {
    try {
      const [sRes, aRes, dRes] = await Promise.all([
        references.status(),
        references.available(selectedBuild),
        references.downloadStatus(),
      ])
      setStatus(sRes.data)
      setAvailableFiles(aRes.data.files || {})
      setDownloadStatus(dRes.data || {})
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [selectedBuild])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [sRes, dRes] = await Promise.all([
          references.status(),
          references.downloadStatus(),
        ])
        setStatus(sRes.data)
        setDownloadStatus(dRes.data || {})
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleDownload = async (fileKey) => {
    try {
      await references.download({ genome_build: selectedBuild, file_key: fileKey })
      loadStatus()
    } catch (err) {
      alert(err.response?.data?.detail || 'Download failed')
    }
  }

  const fileLabels = {
    genome_fa: 'Reference Genome (genome.fa)',
    genome_fai: 'Genome Index (genome.fa.fai)',
    bwa_index: 'BWA Index (genome.fa.bwt)',
    known_sites: 'Known Sites VCF (known_sites.vcf.gz)',
    known_sites_index: 'Known Sites Index (.tbi)',
    genes_gtf: 'Gene Annotation (genes.gtf)',
  }

  if (loading) return <div className="loading-state"><div className="spinner"></div><span>Loading setup status...</span></div>

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/">Dashboard</Link>
        <span className="sep">/</span>
        <span style={{ color: 'var(--text)' }}>Setup</span>
      </div>

      <div className="card" style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(99,102,241,0.05) 100%)' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Reference Files Setup</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 16 }}>
          Download and configure reference genomes and annotation files required for analysis pipelines.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Genome Build:</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {['GRCh38', 'GRCm39'].map(build => (
              <button
                key={build}
                className={`btn btn-sm ${selectedBuild === build ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSelectedBuild(build)}
              >
                {build} {build === 'GRCh38' ? '(Human)' : '(Mouse)'}
              </button>
            ))}
          </div>
          {status && (
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-dim)' }}>
              Disk free: {status.disk_free_gb} GB
            </span>
          )}
        </div>
      </div>

      {/* Current File Status */}
      <div className="card">
        <div className="card-header">
          <h3>Installed Files</h3>
        </div>
        {status && (
          <table className="table">
            <thead>
              <tr><th>File</th><th>Status</th><th>Size</th></tr>
            </thead>
            <tbody>
              {Object.entries(status.files).map(([key, exists]) => (
                <tr key={key}>
                  <td style={{ fontWeight: 600 }}>{fileLabels[key] || key}</td>
                  <td>
                    <span className={`badge ${exists ? 'badge-completed' : 'badge-pending'}`}>
                      {exists ? 'Installed' : 'Missing'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)' }}>
                    {status.sizes_gb[key] > 0 ? `${status.sizes_gb[key]} GB` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Available Downloads */}
      <div className="card">
        <div className="card-header">
          <h3>Available Downloads - {selectedBuild}</h3>
        </div>
        <table className="table">
          <thead>
            <tr><th>File</th><th>Description</th><th>Size</th><th>Required</th><th></th></tr>
          </thead>
          <tbody>
            {Object.entries(availableFiles).map(([key, info]) => {
              const dlKey = `${selectedBuild}_${key}`
              const dl = downloadStatus[dlKey]
              const isDownloading = dl && dl.status === 'downloading'
              const isCompleted = dl && dl.status === 'completed'
              const isFailed = dl && dl.status === 'failed'

              return (
                <tr key={key}>
                  <td style={{ fontWeight: 600 }}>{info.filename}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{info.description}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{info.size_gb}</td>
                  <td>
                    <span className={`badge ${info.required ? 'badge-running' : 'badge-pending'}`}>
                      {info.required ? 'Required' : 'Optional'}
                    </span>
                  </td>
                  <td style={{ minWidth: 180 }}>
                    {isDownloading ? (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{dl.step}</div>
                        <div className="progress-bar" style={{ height: 6 }}>
                          <div className="progress-fill" style={{ width: `${dl.progress}%` }}></div>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{dl.progress}%</span>
                      </div>
                    ) : isCompleted ? (
                      <span className="badge badge-completed">Downloaded</span>
                    ) : isFailed ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="badge badge-failed">Failed</span>
                        <button className="btn btn-sm btn-outline" onClick={() => handleDownload(key)}>Retry</button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => handleDownload(key)}>Download</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Instructions */}
      <div className="card">
        <div className="card-header">
          <h3>Setup Guide</h3>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.8 }}>
          <p><strong>1.</strong> Download the reference genome (required for all pipelines)</p>
          <p><strong>2.</strong> The BWA index and samtools index will be built automatically after genome download (~1 hour for BWA)</p>
          <p><strong>3.</strong> Download known variant sites for BQSR (optional, improves variant calling accuracy)</p>
          <p><strong>4.</strong> Download gene annotations for RNA-Seq quantification (optional)</p>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            Reference directory: <code style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 4 }}>
              {status?.ref_dir || 'data/references/'}
            </code>
          </p>
        </div>
      </div>
    </div>
  )
}
