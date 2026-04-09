import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { projects, jobs } from '../api/client'

export default function DashboardPage() {
  const [projectList, setProjectList] = useState([])
  const [recentJobs, setRecentJobs] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', organism: 'Homo sapiens', genome_build: 'GRCh38' })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [pRes, jRes] = await Promise.all([projects.list(), jobs.list()])
      setProjectList(pRes.data)
      setRecentJobs(jRes.data.slice(0, 5))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await projects.create(form)
      setShowCreate(false)
      setForm({ name: '', description: '', organism: 'Homo sapiens', genome_build: 'GRCh38' })
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create project')
    }
  }

  const handleDelete = async (e, id) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this project and all its data?')) return
    await projects.delete(id)
    load()
  }

  const totalSamples = projectList.reduce((s, p) => s + (p.sample_count || 0), 0)
  const runningJobs = recentJobs.filter(j => j.status === 'running').length
  const completedJobs = recentJobs.filter(j => j.status === 'completed').length

  if (loading) {
    return <div className="loading-state"><div className="spinner"></div><span>Loading dashboard...</span></div>
  }

  return (
    <div>
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Project</button>
        </div>
        <h2 className="dashboard-title">Dashboard</h2>
        <div className="dashboard-header-right"></div>
      </div>

      <div className="stats-row">
        {[
          { value: projectList.length, label: 'Projects' },
          { value: totalSamples, label: 'Total Samples' },
          { value: runningJobs, label: 'Running Jobs' },
          { value: completedJobs, label: 'Completed' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="section-header">
        <h2 style={{ fontSize: 18 }}>Projects</h2>
      </div>

      {projectList.length === 0 ? (
        <div className="card empty-state">
          <h3>No projects yet</h3>
          <p style={{ marginBottom: 16 }}>Create your first project to start analyzing NGS data</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create First Project</button>
        </div>
      ) : (
        <div className="grid grid-2">
          {projectList.map((p, i) => (
            <Link key={p.id} to={`/project/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="project-card" style={{ animationDelay: `${i * 0.06}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{p.name}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      {p.description || 'No description'}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(e) => handleDelete(e, p.id)}
                    style={{ flexShrink: 0 }}
                  >Delete</button>
                </div>
                <div className="project-meta">
                  <span>{p.organism}</span>
                  <span>{p.genome_build}</span>
                  <span>{p.sample_count} samples</span>
                  <span>{p.job_count} jobs</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {recentJobs.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="section-header">
            <h2 style={{ fontSize: 18 }}>Recent Jobs</h2>
            <Link to="/jobs" className="btn btn-sm btn-outline">View All</Link>
          </div>
          <div className="card">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Type</th><th>Status</th><th>Progress</th><th>Step</th></tr>
              </thead>
              <tbody>
                {recentJobs.map(j => (
                  <tr key={j.id}>
                    <td><Link to={`/job/${j.id}`} style={{ fontWeight: 500 }}>{j.name}</Link></td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{j.analysis_type.toUpperCase()}</td>
                    <td><span className={`badge badge-${j.status}`}>{j.status}</span></td>
                    <td style={{ minWidth: 120 }}>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${j.progress}%` }}></div></div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{j.current_step}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Project</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Project Name</label>
                <input className="form-control" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. WGS Cohort 2024" required autoFocus />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="form-control" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Brief description of this project..." />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Organism</label>
                  <select className="form-control" value={form.organism} onChange={e => setForm({...form, organism: e.target.value})}>
                    <option>Homo sapiens</option>
                    <option>Mus musculus</option>
                    <option>Rattus norvegicus</option>
                    <option>Drosophila melanogaster</option>
                    <option>Caenorhabditis elegans</option>
                    <option>Danio rerio</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Genome Build</label>
                  <select className="form-control" value={form.genome_build} onChange={e => setForm({...form, genome_build: e.target.value})}>
                    <option value="GRCh38">GRCh38 / hg38</option>
                    <option value="GRCh37">GRCh37 / hg19</option>
                    <option value="GRCm39">GRCm39 / mm39</option>
                    <option value="GRCm38">GRCm38 / mm10</option>
                    <option value="T2T-CHM13">T2T-CHM13</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
