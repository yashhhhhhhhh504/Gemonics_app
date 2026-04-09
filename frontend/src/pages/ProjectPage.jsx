import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { projects, samples, jobs } from '../api/client'

export default function ProjectPage() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [sampleList, setSampleList] = useState([])
  const [jobList, setJobList] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [showRunPipeline, setShowRunPipeline] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileR1Ref = useRef()
  const fileR2Ref = useRef()

  const [pipelineForm, setPipelineForm] = useState({
    name: '', analysis_type: 'wgs', run_mode: 'standard', threads: 4, memory_gb: 8
  })

  const load = async () => {
    try {
      const [pRes, sRes, jRes] = await Promise.all([
        projects.get(id), samples.list(id), jobs.list(id),
      ])
      setProject(pRes.data)
      setSampleList(sRes.data)
      setJobList(jRes.data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => {
    const interval = setInterval(() => {
      jobs.list(id).then(res => setJobList(res.data)).catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [id])

  const handleUpload = async (e) => {
    e.preventDefault()
    const r1File = fileR1Ref.current?.files?.[0]
    if (!r1File) {
      alert('Please select an R1 file')
      return
    }
    setUploading(true)
    setUploadProgress(0)
    try {
      const formData = new FormData()
      formData.append('sample_name', uploadName)
      formData.append('file_r1', r1File)
      const r2File = fileR2Ref.current?.files?.[0]
      if (r2File) {
        formData.append('file_r2', r2File)
      }

      const token = localStorage.getItem('token')
      const xhr = new XMLHttpRequest()

      await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const err = JSON.parse(xhr.responseText)
              reject(new Error(err.detail || `Upload failed (${xhr.status})`))
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`))
            }
          }
        })
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

        xhr.open('POST', `/api/projects/${id}/samples/upload`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(formData)
      })

      setShowUpload(false)
      setUploadName('')
      setUploadProgress(0)
      load()
    } catch (err) {
      alert(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRunPipeline = async (e) => {
    e.preventDefault()
    try {
      await jobs.create({ ...pipelineForm, project_id: parseInt(id) })
      setShowRunPipeline(false)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to start pipeline')
    }
  }

  const handleDeleteSample = async (sampleId) => {
    if (!confirm('Delete this sample?')) return
    await samples.delete(id, sampleId)
    load()
  }

  if (!project) return <div className="loading-state"><div className="spinner"></div><span>Loading project...</span></div>

  const analysisTypes = {
    wgs: { label: 'Whole Genome (WGS)', desc: 'Complete genome analysis with deep variant calling' },
    wes: { label: 'Whole Exome (WES)', desc: 'Targeted exome analysis for coding regions' },
    gene_panel: { label: 'Gene Panel', desc: 'Focused panel analysis for specific gene sets' },
    rna_seq: { label: 'RNA-Seq', desc: 'Transcriptome analysis with quantification' },
  }

  const runModes = {
    standard: { label: 'Standard', desc: 'Balanced speed and accuracy', color: 'var(--blue)' },
    fast: { label: 'Fast', desc: 'Quicker results, skips BQSR', color: 'var(--yellow)' },
    high_sensitivity: { label: 'High Sensitivity', desc: 'Maximum accuracy, lower thresholds', color: 'var(--green)' },
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/">Dashboard</Link>
        <span className="sep">/</span>
        <span style={{ color: 'var(--text)' }}>{project.name}</span>
      </div>

      {/* Project Header */}
      <div className="card" style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(99,102,241,0.05) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{project.name}</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 12 }}>{project.description || 'No description'}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="job-meta-tag">{project.organism}</span>
              <span className="job-meta-tag">{project.genome_build}</span>
              <span className="job-meta-tag">{sampleList.length} samples</span>
              <span className="job-meta-tag">{jobList.length} jobs</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-outline" onClick={() => setShowUpload(true)}>Upload Samples</button>
            <button
              className="btn btn-success"
              onClick={() => { setPipelineForm({...pipelineForm, name: `${project.name} Analysis`}); setShowRunPipeline(true) }}
              disabled={sampleList.length === 0}
            >
              Run Pipeline
            </button>
          </div>
        </div>
      </div>

      {/* Samples */}
      <div className="card">
        <div className="card-header">
          <h3>Samples ({sampleList.length})</h3>
          <button className="btn btn-sm btn-outline" onClick={() => setShowUpload(true)}>+ Add</button>
        </div>
        {sampleList.length === 0 ? (
          <div className="empty-state">
            <p>No samples uploaded yet. Upload FASTQ/BAM files to get started.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>R1 File</th><th>R2 File</th><th>Type</th><th>Size</th><th></th></tr>
            </thead>
            <tbody>
              {sampleList.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td><span className="download-filename">{s.file_r1 ? s.file_r1.split('/').pop() : '-'}</span></td>
                  <td><span className="download-filename">{s.file_r2 ? s.file_r2.split('/').pop() : '-'}</span></td>
                  <td><span className="badge badge-completed">{s.file_type}</span></td>
                  <td style={{ color: 'var(--text-dim)' }}>{s.file_size_mb} MB</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => handleDeleteSample(s.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Jobs */}
      <div className="card">
        <div className="card-header">
          <h3>Analysis Jobs ({jobList.length})</h3>
        </div>
        {jobList.length === 0 ? (
          <div className="empty-state">
            <p>No analysis runs yet. Upload samples and run a pipeline.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Mode</th><th>Status</th><th>Progress</th><th>Step</th><th></th></tr>
            </thead>
            <tbody>
              {jobList.map(j => (
                <tr key={j.id}>
                  <td><Link to={`/job/${j.id}`} style={{ fontWeight: 600 }}>{j.name}</Link></td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{j.analysis_type.toUpperCase()}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{j.run_mode}</td>
                  <td><span className={`badge badge-${j.status}`}>{j.status}</span></td>
                  <td style={{ minWidth: 130 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ flex: 1 }}><div className="progress-fill" style={{ width: `${j.progress}%` }}></div></div>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 28 }}>{j.progress}%</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{j.current_step}</td>
                  <td><Link to={`/job/${j.id}`} className="btn btn-sm btn-outline">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUpload(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Upload Sample</h2>
            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>Sample Name</label>
                <input className="form-control" value={uploadName} onChange={e => setUploadName(e.target.value)} required placeholder="e.g. Patient_001" autoFocus />
              </div>
              <div className="form-group">
                <label>Forward Reads (R1) *</label>
                <input type="file" ref={fileR1Ref} required className="form-control" style={{ padding: 8 }} />
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
                  Accepted: .fastq, .fastq.gz, .fq, .fq.gz, .bam, .vcf, .vcf.gz
                </span>
              </div>
              <div className="form-group">
                <label>Reverse Reads (R2) - optional for paired-end</label>
                <input type="file" ref={fileR2Ref} className="form-control" style={{ padding: 8 }} />
              </div>

              {uploading && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: 'var(--text-muted)' }}>
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="progress-bar" style={{ height: 8 }}>
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => !uploading && setShowUpload(false)} disabled={uploading}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? `Uploading ${uploadProgress}%...` : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pipeline Modal */}
      {showRunPipeline && (
        <div className="modal-overlay" onClick={() => setShowRunPipeline(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Run Analysis Pipeline</h2>
            <form onSubmit={handleRunPipeline}>
              <div className="form-group">
                <label>Job Name</label>
                <input className="form-control" value={pipelineForm.name} onChange={e => setPipelineForm({...pipelineForm, name: e.target.value})} required />
              </div>

              <div className="form-group">
                <label>Analysis Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(analysisTypes).map(([key, info]) => (
                    <div
                      key={key}
                      onClick={() => setPipelineForm({...pipelineForm, analysis_type: key})}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${pipelineForm.analysis_type === key ? 'var(--accent)' : 'var(--border)'}`,
                        background: pipelineForm.analysis_type === key ? 'var(--accent-glow)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{info.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{info.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Run Mode</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(runModes).map(([key, info]) => (
                    <div
                      key={key}
                      onClick={() => setPipelineForm({...pipelineForm, run_mode: key})}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${pipelineForm.run_mode === key ? info.color : 'var(--border)'}`,
                        background: pipelineForm.run_mode === key ? `${info.color}15` : 'var(--bg-surface)',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: pipelineForm.run_mode === key ? info.color : 'var(--text)' }}>{info.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{info.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Threads</label>
                  <input type="number" className="form-control" min={1} max={64} value={pipelineForm.threads} onChange={e => setPipelineForm({...pipelineForm, threads: parseInt(e.target.value) || 1})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Memory (GB)</label>
                  <input type="number" className="form-control" min={1} max={256} value={pipelineForm.memory_gb} onChange={e => setPipelineForm({...pipelineForm, memory_gb: parseInt(e.target.value) || 1})} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowRunPipeline(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Start Analysis</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
