const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function getToken() {
  return localStorage.getItem('github_pat')
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  if (!token) throw new Error('No auth token')

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...options.headers },
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res
}

export async function githubFetch(url, options = {}) {
  const token = getToken()
  if (!token) throw new Error('No auth token')

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      ...options.headers,
    },
  })

  if (!res.ok) throw new Error(`GitHub API error ${res.status}`)
  return res
}
