const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const MAX_RETRIES = 3

export function getToken() {
  return localStorage.getItem('github_token') || localStorage.getItem('github_pat')
}

function getRateLimitDelay(res, attempt) {
  const retryAfter = res.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (!Number.isNaN(seconds)) return seconds * 1000
  }

  const resetAt = res.headers.get('x-ratelimit-reset')
  if (resetAt) {
    const resetMs = Number(resetAt) * 1000
    const now = Date.now()
    if (resetMs > now) return Math.min(resetMs - now, 120_000)
  }

  return Math.min(1000 * 2 ** attempt, 60_000)
}

async function fetchWithRateLimitRetry(url, options, attempt = 0) {
  const res = await fetch(url, options)

  if (res.status === 429 || (res.status === 403 && isSecondaryRateLimit(res))) {
    if (attempt >= MAX_RETRIES) {
      const remaining = res.headers.get('x-ratelimit-remaining')
      const resetAt = res.headers.get('x-ratelimit-reset')
      throw new RateLimitError(res.status, remaining, resetAt)
    }

    const delay = getRateLimitDelay(res, attempt)
    console.warn(
      `[API] Rate limited (${res.status}), retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`
    )
    await sleep(delay)
    return fetchWithRateLimitRetry(url, options, attempt + 1)
  }

  return res
}

function isSecondaryRateLimit(res) {
  const retryAfter = res.headers.get('retry-after')
  return !!retryAfter
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class RateLimitError extends Error {
  constructor(status, remaining, resetAt) {
    const resetDate = resetAt ? new Date(Number(resetAt) * 1000).toLocaleTimeString() : 'unknown'
    super(`Rate limited (${status}). Resets at ${resetDate}.`)
    this.name = 'RateLimitError'
    this.status = status
    this.remaining = remaining
    this.resetAt = resetAt
  }
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  if (!token) throw new Error('No auth token')

  const res = await fetchWithRateLimitRetry(`${API_URL}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...options.headers },
  })

  if (!res.ok) {
    if (res.status === 429) throw new RateLimitError(res.status)
    throw new Error(`API error ${res.status}`)
  }
  return res
}
