import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { jobs } from '../api/client'

export default function JobsPage() {
  const [jobList, setJobList] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await jobs.list()
      setJobList(res.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleCancel = async (id) => {
    if (!confirm('Cancel this job?')) return
    try { await jobs.cancel(id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Failed to cancel') }
  }

  if (loading) return <div className="loading-state"><div className="spinner"></div><span>Loading jobs...</span></div>

  const running = jobList.filter(j => j.status === 'running').length
  const completed = jobList.filter(j => j.status === 'completed').length
  const failed = jobList.filter(j => j.status === 'failed').length

  return (
    <div>
      <div className="section-header">
        <h2>All Jobs</h2>
      </div>

      {jobList.length > 0 && (
        <div className="grid grid-3" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--blue)' }}>{running}</div>
            <div className="stat-label">Running</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--green)', background: 'none', WebkitTextFillColor: 'var(--green)' }}>{completed}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--red)', background: 'none', WebkitTextFillColor: 'var(--red)' }}>{failed}</div>
            <div className="stat-label">Failed</div>
          </div>
        </div>
      )}

      {jobList.length === 0 ? (
        <div className="card empty-state">
          <h3>No jobs yet</h3>
          <p>Go to a project and run an analysis pipeline</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Go to Dashboard</Link>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Mode</th><th>Status</th><th>Progress</th><th>Step</th><th>Created</th><th></th></tr>
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
                  <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{new Date(j.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Link to={`/job/${j.id}`} className="btn btn-sm btn-outline">View</Link>
                      {(j.status === 'pending' || j.status === 'running') && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleCancel(j.id)}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
