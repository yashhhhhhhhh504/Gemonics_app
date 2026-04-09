import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { jobs, reports } from '../api/client'

const STEP_CONFIGS = {
  wgs: [
    { id: 'qc', name: 'Quality Control', icon: 'QC', desc: 'FastQC analysis on raw reads' },
    { id: 'trim', name: 'Read Trimming', icon: 'TR', desc: 'Adapter removal and quality trimming' },
    { id: 'post_trim_qc', name: 'Post-Trim QC', icon: 'PQ', desc: 'Quality check on trimmed reads' },
    { id: 'align', name: 'Alignment', icon: 'AL', desc: 'BWA-MEM alignment to reference genome' },
    { id: 'post_align', name: 'Post-Alignment', icon: 'PA', desc: 'Sort, mark duplicates, BQSR' },
    { id: 'variant_call', name: 'Variant Calling', icon: 'VC', desc: 'GATK HaplotypeCaller / bcftools' },
    { id: 'annotate', name: 'Annotation', icon: 'AN', desc: 'Variant annotation and classification' },
    { id: 'report', name: 'Report', icon: 'RP', desc: 'Generate summary report' },
  ],
  wes: [
    { id: 'qc', name: 'Quality Control', icon: 'QC', desc: 'FastQC analysis on raw reads' },
    { id: 'trim', name: 'Read Trimming', icon: 'TR', desc: 'Adapter removal and quality trimming' },
    { id: 'post_trim_qc', name: 'Post-Trim QC', icon: 'PQ', desc: 'Quality check on trimmed reads' },
    { id: 'align', name: 'Alignment', icon: 'AL', desc: 'BWA-MEM alignment to reference genome' },
    { id: 'post_align', name: 'Post-Alignment', icon: 'PA', desc: 'Sort, mark duplicates, BQSR' },
    { id: 'variant_call', name: 'Variant Calling', icon: 'VC', desc: 'GATK HaplotypeCaller / bcftools' },
    { id: 'annotate', name: 'Annotation', icon: 'AN', desc: 'Variant annotation and classification' },
    { id: 'report', name: 'Report', icon: 'RP', desc: 'Generate summary report' },
  ],
  gene_panel: [
    { id: 'qc', name: 'Quality Control', icon: 'QC', desc: 'FastQC analysis on raw reads' },
    { id: 'trim', name: 'Read Trimming', icon: 'TR', desc: 'Adapter removal and quality trimming' },
    { id: 'post_trim_qc', name: 'Post-Trim QC', icon: 'PQ', desc: 'Quality check on trimmed reads' },
    { id: 'align', name: 'Alignment', icon: 'AL', desc: 'BWA-MEM alignment to reference genome' },
    { id: 'variant_call', name: 'Variant Calling', icon: 'VC', desc: 'GATK HaplotypeCaller / bcftools' },
    { id: 'annotate', name: 'Annotation', icon: 'AN', desc: 'Variant annotation and classification' },
    { id: 'report', name: 'Report', icon: 'RP', desc: 'Generate summary report' },
  ],
  rna_seq: [
    { id: 'qc', name: 'Quality Control', icon: 'QC', desc: 'FastQC analysis on raw reads' },
    { id: 'trim', name: 'Read Trimming', icon: 'TR', desc: 'Adapter removal and quality trimming' },
    { id: 'post_trim_qc', name: 'Post-Trim QC', icon: 'PQ', desc: 'Quality check on trimmed reads' },
    { id: 'align', name: 'Alignment', icon: 'AL', desc: 'STAR / HISAT2 splice-aware alignment' },
    { id: 'quantify', name: 'Quantification', icon: 'QN', desc: 'Gene expression quantification' },
    { id: 'report', name: 'Report', icon: 'RP', desc: 'Generate summary report' },
  ],
}

const STEP_NAME_MAP = {
  'Quality Control': 'qc',
  'Read Trimming': 'trim',
  'Post-Trim QC': 'post_trim_qc',
  'Alignment': 'align',
  'Post-Alignment Processing': 'post_align',
  'Variant Calling': 'variant_call',
  'Variant Annotation': 'annotate',
  'Report Generation': 'report',
  'Quantification': 'quantify',
  'Completed': '__completed__',
  'Review: Quality Control': 'qc',
  'Review: Post-Trim QC': 'post_trim_qc',
}

export default function JobDetailPage() {
  const { id } = useParams()
  const [job, setJob] = useState(null)
  const [log, setLog] = useState('')
  const [files, setFiles] = useState([])
  const [summary, setSummary] = useState(null)
  const [activeTab, setActiveTab] = useState('pipeline')
  const [elapsed, setElapsed] = useState(null)
  const logEndRef = useRef(null)

  // QC review state
  const [qcSummary, setQcSummary] = useState(null)
  const [qcReportHtml, setQcReportHtml] = useState(null)
  const [qcReportType, setQcReportType] = useState('raw')
  const [showQcReport, setShowQcReport] = useState(false)

  // Trim params state
  const [trimParams, setTrimParams] = useState({
    quality: 20,
    min_length: 36,
    trim_front: 0,
    trim_tail: 0,
    adapter_r1: '',
    adapter_r2: '',
  })

  const load = async () => {
    try {
      const res = await jobs.get(id)
      setJob(res.data)
      if (res.data.status === 'completed') {
        const [fRes, sRes] = await Promise.all([
          reports.files(id).catch(() => ({ data: { files: [] } })),
          reports.summary(id).catch(() => ({ data: null })),
        ])
        setFiles(fRes.data.files || [])
        setSummary(sRes.data)
      }
      // Load QC summary when awaiting input or when QC steps are done
      if (res.data.status === 'awaiting_input' || res.data.progress >= 10) {
        jobs.qcSummary(id).then(r => setQcSummary(r.data)).catch(() => {})
      }
    } catch (err) { console.error(err) }
  }

  const loadLog = async () => {
    try {
      const res = await jobs.log(id)
      setLog(res.data.log || 'No log available')
    } catch (err) { setLog('Failed to load log') }
  }

  const loadQcReport = async (reportType) => {
    try {
      const res = await jobs.qcReport(id, reportType)
      if (typeof res.data === 'string') {
        setQcReportHtml(res.data)
      } else {
        setQcReportHtml(null)
      }
      setQcReportType(reportType)
      setShowQcReport(true)
    } catch (err) {
      alert('QC report not available yet')
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [id])

  useEffect(() => {
    if (activeTab === 'log') loadLog()
  }, [activeTab, id])

  useEffect(() => {
    if (activeTab === 'log' && job && (job.status === 'running' || job.status === 'pending')) {
      const interval = setInterval(loadLog, 4000)
      return () => clearInterval(interval)
    }
  }, [activeTab, job?.status])

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // Elapsed time counter
  useEffect(() => {
    if (!job) return
    if ((job.status === 'running' || job.status === 'awaiting_input') && job.started_at) {
      const tick = () => {
        const start = new Date(job.started_at).getTime()
        const now = Date.now()
        const diff = Math.floor((now - start) / 1000)
        const h = Math.floor(diff / 3600)
        const m = Math.floor((diff % 3600) / 60)
        const s = diff % 60
        setElapsed(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`)
      }
      tick()
      const interval = setInterval(tick, 1000)
      return () => clearInterval(interval)
    } else if (job.started_at && job.completed_at) {
      const diff = Math.floor((new Date(job.completed_at) - new Date(job.started_at)) / 1000)
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`)
    }
  }, [job?.status, job?.started_at, job?.completed_at])

  const handleCancel = async () => {
    if (!confirm('Cancel this job?')) return
    await jobs.cancel(id)
    load()
  }

  const handleResume = async () => {
    if (!confirm('Resume this job from the last checkpoint?')) return
    try {
      await jobs.resume(id)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to resume')
    }
  }

  const handleSetTrimAndContinue = async () => {
    try {
      await jobs.setTrimParams(id, trimParams)
      setShowQcReport(false)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to set trim params')
    }
  }

  const handleContinue = async () => {
    try {
      await jobs.continue(id)
      setShowQcReport(false)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to continue')
    }
  }

  if (!job) return <div className="loading-state"><div className="spinner"></div><span>Loading job...</span></div>

  const steps = STEP_CONFIGS[job.analysis_type] || STEP_CONFIGS.wgs
  const cleanCurrentStep = job.current_step?.replace(' (cached)', '') || ''
  const currentStepId = STEP_NAME_MAP[cleanCurrentStep] || null
  const currentStepIdx = steps.findIndex(s => s.id === currentStepId)

  // Determine which review stage we're at
  const isAwaitingQcReview = job.status === 'awaiting_input' && job.current_step?.includes('Quality Control')
  const isAwaitingPostTrimReview = job.status === 'awaiting_input' && job.current_step?.includes('Post-Trim')

  const statusColors = {
    done: { bg: 'var(--green-bg)', border: 'rgba(16,185,129,0.4)', text: 'var(--green)', nodeBg: 'var(--green)' },
    active: { bg: 'var(--accent-glow)', border: 'var(--accent)', text: 'var(--accent-hover)', nodeBg: 'var(--accent)' },
    review: { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.4)', text: '#a855f7', nodeBg: '#a855f7' },
    failed: { bg: 'var(--red-bg)', border: 'rgba(239,68,68,0.4)', text: 'var(--red)', nodeBg: 'var(--red)' },
    waiting: { bg: 'var(--bg-surface)', border: 'var(--border-light)', text: 'var(--text-dim)', nodeBg: 'var(--border)' },
  }

  const getStepStatus = (step, idx) => {
    const effectiveIdx = currentStepIdx >= 0 ? currentStepIdx : -1
    if (job.status === 'completed') return 'done'
    if (job.status === 'pending' && effectiveIdx < 0) return 'waiting'
    if (job.status === 'cancelled') return idx <= effectiveIdx ? 'done' : 'waiting'
    if (job.status === 'failed') {
      if (idx < effectiveIdx) return 'done'
      if (idx === effectiveIdx) return 'failed'
      return 'waiting'
    }
    if (job.status === 'awaiting_input') {
      if (idx < effectiveIdx) return 'done'
      if (idx === effectiveIdx) return 'review'
      return 'waiting'
    }
    // running
    if (idx < effectiveIdx) return 'done'
    if (idx === effectiveIdx) return 'active'
    return 'waiting'
  }

  const statusLabels = {
    done: 'Completed', active: 'Running', review: 'Review', failed: 'Failed', waiting: 'Pending',
  }

  // Format large numbers
  const fmtNum = (n) => {
    if (!n && n !== 0) return '-'
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
    return n.toString()
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/jobs">Jobs</Link>
        <span className="sep">/</span>
        <span style={{ color: 'var(--text)' }}>{job.name}</span>
      </div>

      {/* Header Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(99,102,241,0.05) 100%)' }}>
        <div className="job-header">
          <div className="job-header-info">
            <h2>{job.name}</h2>
            <div className="job-header-meta">
              <span className="job-meta-tag">{job.analysis_type.toUpperCase()}</span>
              <span className="job-meta-tag">{job.run_mode}</span>
              <span className="job-meta-tag">{job.threads} threads</span>
              <span className="job-meta-tag">{job.memory_gb} GB RAM</span>
              {elapsed && <span className="job-meta-tag">{elapsed}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`badge badge-${job.status}`}>{job.status === 'awaiting_input' ? 'Awaiting Review' : job.status}</span>
            {(job.status === 'pending' || job.status === 'running') && (
              <button className="btn btn-sm btn-danger" onClick={handleCancel}>Cancel</button>
            )}
            {job.status === 'failed' && (
              <button className="btn btn-sm btn-success" onClick={handleResume}>Resume</button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: 'var(--text-muted)' }}>
            <span>{job.current_step}</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-hover)' }}>{job.progress}%</span>
          </div>
          <div className="progress-bar" style={{ height: 10 }}>
            <div className="progress-fill" style={{ width: `${job.progress}%` }}></div>
          </div>
        </div>

        {job.error_message && job.status !== 'awaiting_input' && (
          <div className="error-msg" style={{ marginTop: 16 }}>{job.error_message}</div>
        )}
      </div>

      {/* QC Review Panel - shown when pipeline is paused for user review */}
      {job.status === 'awaiting_input' && (
        <div className="qc-review-panel">
          {isAwaitingQcReview && (
            <>
              <h3>Quality Control Review - Configure Trimming</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
                QC analysis is complete. Review the quality reports below, then configure trimming parameters and continue.
              </p>

              {/* QC Report buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className="btn btn-sm btn-outline" onClick={() => loadQcReport('raw')}>
                  View MultiQC Report
                </button>
                {qcSummary?.raw?.fastqc_reports?.map(fn => (
                  <button key={fn} className="btn btn-sm btn-outline" onClick={() => {
                    const url = `/api/jobs/${id}/qc-report-file/${fn}?report_type=raw`
                    window.open(url, '_blank')
                  }}>
                    {fn.replace('_fastqc.html', '')}
                  </button>
                ))}
              </div>

              {/* Embedded QC Report */}
              {showQcReport && qcReportHtml && (
                <div className="qc-iframe-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {qcReportType === 'raw' ? 'Raw Reads QC' : qcReportType === 'post_trim' ? 'Post-Trim QC' : 'Pre vs Post Comparison'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => {
                        const w = window.open('', '_blank')
                        w.document.write(qcReportHtml)
                      }}>Open in New Tab</button>
                      <button className="btn btn-sm btn-outline" onClick={() => setShowQcReport(false)}>Close</button>
                    </div>
                  </div>
                  <iframe srcDoc={qcReportHtml} title="QC Report" />
                </div>
              )}

              {/* Trimming Parameters */}
              <h3 style={{ marginTop: 20 }}>Trimming Parameters</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>
                Adjust parameters based on the QC results. Lower quality threshold keeps more reads but may include low-quality bases.
              </p>
              <div className="trim-params-grid">
                <div className="trim-param-card">
                  <label>Quality Threshold (Phred)</label>
                  <input type="number" min={1} max={40} value={trimParams.quality}
                    onChange={e => setTrimParams({...trimParams, quality: parseInt(e.target.value) || 20})} />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Bases below this quality are trimmed (default: 20)
                  </div>
                </div>
                <div className="trim-param-card">
                  <label>Min Read Length</label>
                  <input type="number" min={1} max={500} value={trimParams.min_length}
                    onChange={e => setTrimParams({...trimParams, min_length: parseInt(e.target.value) || 36})} />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Reads shorter than this are discarded (default: 36)
                  </div>
                </div>
                <div className="trim-param-card">
                  <label>Trim Front (bases)</label>
                  <input type="number" min={0} max={100} value={trimParams.trim_front}
                    onChange={e => setTrimParams({...trimParams, trim_front: parseInt(e.target.value) || 0})} />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Remove N bases from the start of each read
                  </div>
                </div>
                <div className="trim-param-card">
                  <label>Trim Tail (bases)</label>
                  <input type="number" min={0} max={100} value={trimParams.trim_tail}
                    onChange={e => setTrimParams({...trimParams, trim_tail: parseInt(e.target.value) || 0})} />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Remove N bases from the end of each read
                  </div>
                </div>
                <div className="trim-param-card" style={{ gridColumn: 'span 2' }}>
                  <label>Custom Adapter R1 (optional)</label>
                  <input type="text" value={trimParams.adapter_r1} placeholder="Leave blank for auto-detect"
                    onChange={e => setTrimParams({...trimParams, adapter_r1: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleSetTrimAndContinue} style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}>
                  Apply Trim Settings and Continue
                </button>
                <button className="btn btn-outline" onClick={handleContinue}>
                  Skip Trimming Review (Use Defaults)
                </button>
              </div>
            </>
          )}

          {isAwaitingPostTrimReview && (
            <>
              <h3>Post-Trim Quality Review</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
                Trimming is complete. Review the quality of trimmed reads below. If satisfied, continue to alignment.
              </p>

              {/* Fastp stats summary */}
              {qcSummary?.fastp?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Trimming Statistics</h3>
                  {qcSummary.fastp.map((f, i) => (
                    <div key={i} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                        {f.filename.replace('_fastp.json', '')}
                      </div>
                      <div className="fastp-stats">
                        <div className="fastp-stat">
                          <div className="fastp-stat-value">{fmtNum(f.before_filtering?.total_reads)}</div>
                          <div className="fastp-stat-label">Reads Before</div>
                        </div>
                        <div className="fastp-stat">
                          <div className="fastp-stat-value">{fmtNum(f.after_filtering?.total_reads)}</div>
                          <div className="fastp-stat-label">Reads After</div>
                        </div>
                        <div className="fastp-stat">
                          <div className="fastp-stat-value" style={{ color: 'var(--green)' }}>
                            {f.before_filtering?.total_reads > 0
                              ? ((f.after_filtering?.total_reads / f.before_filtering?.total_reads) * 100).toFixed(1) + '%'
                              : '-'}
                          </div>
                          <div className="fastp-stat-label">Reads Passed</div>
                        </div>
                        <div className="fastp-stat">
                          <div className="fastp-stat-value">Q{f.after_filtering?.q30_rate ? (f.after_filtering.q30_rate * 100).toFixed(1) : '-'}</div>
                          <div className="fastp-stat-label">Q30 After</div>
                        </div>
                        <div className="fastp-stat">
                          <div className="fastp-stat-value">{fmtNum(f.before_filtering?.total_bases)}</div>
                          <div className="fastp-stat-label">Bases Before</div>
                        </div>
                        <div className="fastp-stat">
                          <div className="fastp-stat-value">{fmtNum(f.after_filtering?.total_bases)}</div>
                          <div className="fastp-stat-label">Bases After</div>
                        </div>
                        {f.filtering_result && (
                          <>
                            <div className="fastp-stat">
                              <div className="fastp-stat-value" style={{ color: 'var(--yellow)' }}>{fmtNum(f.filtering_result.low_quality_reads)}</div>
                              <div className="fastp-stat-label">Low Quality</div>
                            </div>
                            <div className="fastp-stat">
                              <div className="fastp-stat-value" style={{ color: 'var(--yellow)' }}>{fmtNum(f.filtering_result.too_short_reads)}</div>
                              <div className="fastp-stat-label">Too Short</div>
                            </div>
                          </>
                        )}
                        {f.adapter_cutting?.adapter_trimmed_reads > 0 && (
                          <div className="fastp-stat">
                            <div className="fastp-stat-value" style={{ color: 'var(--cyan)' }}>{fmtNum(f.adapter_cutting.adapter_trimmed_reads)}</div>
                            <div className="fastp-stat-label">Adapter Trimmed</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Report buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-outline" onClick={() => loadQcReport('post_trim')}>
                  View Post-Trim MultiQC
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => loadQcReport('comparison')}>
                  View Pre vs Post Comparison
                </button>
                {qcSummary?.post_trim?.fastqc_reports?.map(fn => (
                  <button key={fn} className="btn btn-sm btn-outline" onClick={() => {
                    const url = `/api/jobs/${id}/qc-report-file/${fn}?report_type=post_trim`
                    window.open(url, '_blank')
                  }}>
                    {fn.replace('_fastqc.html', '')}
                  </button>
                ))}
              </div>

              {/* Embedded QC Report */}
              {showQcReport && qcReportHtml && (
                <div className="qc-iframe-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {qcReportType === 'post_trim' ? 'Post-Trim QC' : qcReportType === 'comparison' ? 'Pre vs Post Comparison' : 'QC Report'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => {
                        const w = window.open('', '_blank')
                        w.document.write(qcReportHtml)
                      }}>Open in New Tab</button>
                      <button className="btn btn-sm btn-outline" onClick={() => setShowQcReport(false)}>Close</button>
                    </div>
                  </div>
                  <iframe srcDoc={qcReportHtml} title="QC Report" />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-success" onClick={handleContinue}>
                  Satisfied - Continue to Alignment
                </button>
                <button className="btn btn-outline" onClick={() => {
                  // Go back and re-trim: user needs to set new params
                  // We reset the trim and post_trim_qc steps
                  if (confirm('This will re-run trimming with new parameters. Continue?')) {
                    // Remove trim and post_trim_qc from completed steps and re-trigger
                    handleSetTrimAndContinue()
                  }
                }} style={{ color: 'var(--yellow)', borderColor: 'rgba(245,158,11,0.3)' }}>
                  Re-trim with Different Parameters
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {['pipeline', 'overview', 'log', 'results'].map(tab => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Pipeline Visualization Tab */}
      {activeTab === 'pipeline' && (
        <div className="card" style={{ padding: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Pipeline Progress</h3>

          <div style={{ position: 'relative', paddingLeft: 48 }}>
            {/* Connector line */}
            <div style={{
              position: 'absolute',
              left: 19,
              top: 20,
              bottom: 20,
              width: 2,
              background: job.status === 'completed' ? 'var(--green)' : 'var(--border)',
              borderRadius: 2,
            }} />

            {steps.map((step, idx) => {
              const status = getStepStatus(step, idx)
              const colors = statusColors[status]
              const isActive = status === 'active'
              const isReview = status === 'review'

              return (
                <div key={step.id} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 20,
                  marginBottom: idx < steps.length - 1 ? 8 : 0,
                  position: 'relative',
                  animation: `fadeUp 0.4s ease ${idx * 0.08}s both`,
                }}>
                  {/* Node circle */}
                  <div style={{
                    position: 'absolute',
                    left: -48 + 8,
                    top: 12,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: colors.nodeBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color: status === 'waiting' ? 'var(--text-dim)' : '#fff',
                    zIndex: 2,
                    boxShadow: (isActive || isReview) ? `0 0 16px ${colors.nodeBg}` : 'none',
                    animation: (isActive || isReview) ? 'pulse-badge 2s ease-in-out infinite' : 'none',
                    transition: 'all 0.5s ease',
                  }}>
                    {status === 'done' ? '\u2713' : status === 'failed' ? '\u2717' : status === 'review' ? '?' : idx + 1}
                  </div>

                  {/* Step card */}
                  <div style={{
                    flex: 1,
                    padding: '14px 20px',
                    borderRadius: 'var(--radius-sm)',
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    transition: 'all 0.4s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {(isActive || isReview) && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: isReview
                          ? 'linear-gradient(90deg, transparent, rgba(168,85,247,0.08), transparent)'
                          : 'linear-gradient(90deg, transparent, rgba(99,102,241,0.08), transparent)',
                        animation: 'shimmer 2.5s infinite',
                      }} />
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: colors.text, marginBottom: 3 }}>
                          {step.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                          {isReview ? 'Waiting for your review' : step.desc}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          background: colors.bg,
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                        }}>
                          {statusLabels[status]}
                        </span>
                      </div>
                    </div>

                    {isActive && (
                      <div style={{ marginTop: 10 }}>
                        <div className="progress-bar" style={{ height: 4 }}>
                          <div className="progress-fill" style={{ width: '60%' }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginTop: 32,
            paddingTop: 24,
            borderTop: '1px solid var(--border-light)',
          }}>
            {[
              { label: 'Completed', color: 'var(--green)', count: steps.filter((_, i) => getStepStatus(_, i) === 'done').length },
              { label: 'Running', color: 'var(--accent-hover)', count: steps.filter((_, i) => getStepStatus(_, i) === 'active').length },
              { label: 'Review', color: '#a855f7', count: steps.filter((_, i) => getStepStatus(_, i) === 'review').length },
              { label: 'Pending', color: 'var(--text-dim)', count: steps.filter((_, i) => getStepStatus(_, i) === 'waiting').length },
              { label: 'Failed', color: 'var(--red)', count: steps.filter((_, i) => getStepStatus(_, i) === 'failed').length },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-3">
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 22 }}>{job.status === 'awaiting_input' ? 'REVIEW' : job.status.toUpperCase()}</div>
            <div className="stat-label">Status</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{job.progress}%</div>
            <div className="stat-label">Progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 18 }}>{job.current_step}</div>
            <div className="stat-label">Current Step</div>
          </div>
          {elapsed && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 22 }}>{elapsed}</div>
              <div className="stat-label">Duration</div>
            </div>
          )}
          {job.started_at && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 16 }}>{new Date(job.started_at).toLocaleString()}</div>
              <div className="stat-label">Started</div>
            </div>
          )}
          {job.completed_at && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 16 }}>{new Date(job.completed_at).toLocaleString()}</div>
              <div className="stat-label">Completed</div>
            </div>
          )}
        </div>
      )}

      {/* Log Tab */}
      {activeTab === 'log' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Pipeline Log</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {(job.status === 'running' || job.status === 'pending') && (
                <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-badge 1.5s ease-in-out infinite' }}></span>
                  Live
                </span>
              )}
              <button className="btn btn-sm btn-outline" onClick={loadLog}>Refresh</button>
            </div>
          </div>
          <div className="log-viewer" style={{ maxHeight: 600 }}>
            {log || 'No log output yet...'}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <div className="card">
          {job.status !== 'completed' ? (
            <div className="empty-state"><p>Results will be available after the analysis completes.</p></div>
          ) : files.length === 0 ? (
            <div className="empty-state"><p>No result files found.</p></div>
          ) : (
            <div>
              <div className="card-header"><h3>Output Files ({files.length})</h3></div>
              {files.map((f, i) => (
                <div key={i} className="download-row">
                  <div>
                    <span className="download-filename">{f.name}</span>
                    <span className="download-size">{f.size_mb} MB</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {f.name.endsWith('.html') && (
                      <button className="btn btn-sm btn-outline" onClick={async () => {
                        try {
                          const res = await reports.viewFile(id, f.name)
                          const w = window.open('', '_blank')
                          w.document.write(res.data)
                        } catch { alert('Could not load report') }
                      }}>View</button>
                    )}
                    <button className="btn btn-sm btn-primary" onClick={async () => {
                      try {
                        const res = await reports.viewFile(id, f.name)
                        const blob = new Blob([res.data], { type: 'application/octet-stream' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = f.name.split('/').pop()
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch { alert('Could not download file') }
                    }}>Download</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
