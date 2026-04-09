import axios from 'axios'

const API_BASE = '/api'

const client = axios.create({ baseURL: API_BASE })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const auth = {
  register: (data) => client.post('/auth/register', data),
  login: (data) => client.post('/auth/login', data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }),
  me: () => client.get('/auth/me'),
}

export const projects = {
  list: () => client.get('/projects/'),
  get: (id) => client.get(`/projects/${id}`),
  create: (data) => client.post('/projects/', data),
  delete: (id) => client.delete(`/projects/${id}`),
}

export const samples = {
  list: (projectId) => client.get(`/projects/${projectId}/samples/`),
  upload: (projectId, formData) =>
    client.post(`/projects/${projectId}/samples/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (projectId, sampleId) =>
    client.delete(`/projects/${projectId}/samples/${sampleId}`),
}

export const jobs = {
  list: (projectId) => client.get('/jobs/', { params: { project_id: projectId } }),
  get: (id) => client.get(`/jobs/${id}`),
  create: (data) => client.post('/jobs/', data),
  cancel: (id) => client.post(`/jobs/${id}/cancel`),
  resume: (id) => client.post(`/jobs/${id}/resume`),
  log: (id) => client.get(`/jobs/${id}/log`),
  qcReport: (id, reportType = 'raw') => client.get(`/jobs/${id}/qc-report`, { params: { report_type: reportType } }),
  qcReportFile: (id, filename, reportType = 'raw') => client.get(`/jobs/${id}/qc-report-file/${filename}`, { params: { report_type: reportType } }),
  qcSummary: (id) => client.get(`/jobs/${id}/qc-summary`),
  setTrimParams: (id, params) => client.post(`/jobs/${id}/set-trim-params`, params),
  continue: (id) => client.post(`/jobs/${id}/continue`),
}

export const reports = {
  files: (jobId) => client.get(`/reports/${jobId}/files`),
  summary: (jobId) => client.get(`/reports/${jobId}/summary`),
  downloadUrl: (jobId, filePath) => `${API_BASE}/reports/${jobId}/download/${filePath}`,
  viewFile: (jobId, filePath) => client.get(`/reports/${jobId}/download/${filePath}`, { transformResponse: [(data) => data] }),
}

export const references = {
  status: () => client.get('/references/status'),
  available: (build) => client.get(`/references/available/${build}`),
  download: (data) => client.post('/references/download', data),
  downloadStatus: () => client.get('/references/download/status'),
}

export const system = {
  health: () => client.get('/system/health'),
  resources: () => client.get('/system/resources'),
  tools: () => client.get('/system/tools'),
}

export default client
