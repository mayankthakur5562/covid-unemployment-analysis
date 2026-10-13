const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)
  const type = response.headers.get('content-type') || ''
  const data = type.includes('application/json') ? await response.json() : response
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
  return data
}

export const getHealth = () => request('/health')
export const getSummary = () => request('/summary')
export const getChart = name => request(`/chart/${name}`)
export const getRecords = (limit = 100) => request(`/records?limit=${limit}`)
export const uploadDataset = file => {
  const form = new FormData()
  form.append('file', file)
  return request('/upload', { method: 'POST', body: form })
}
export const getCleanedCsvUrl = () => `${API_BASE}/download/cleaned`
