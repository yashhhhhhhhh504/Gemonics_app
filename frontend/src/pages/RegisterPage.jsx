import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../api/client'

export default function RegisterPage({ onLogin }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', full_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await auth.register(form)
      const params = new URLSearchParams()
      params.append('username', form.username)
      params.append('password', form.password)
      const res = await auth.login(params)
      onLogin(res.data.user, res.data.access_token)
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 style={{ textAlign: 'center' }}>Create Account</h1>
        <p style={{ textAlign: 'center' }}>Join the platform and start analyzing NGS data</p>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input className="form-control" value={form.full_name} onChange={update('full_name')} placeholder="Your full name" />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input className="form-control" value={form.username} onChange={update('username')} placeholder="Choose a username" required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input className="form-control" type="email" value={form.email} onChange={update('email')} placeholder="your@email.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input className="form-control" type="password" value={form.password} onChange={update('password')} placeholder="Minimum 6 characters" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Creating...</>
            ) : 'Create Account'}
          </button>
        </form>
        <div className="footer-link">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
