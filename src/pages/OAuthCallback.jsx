import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function OAuthCallback() {
  const [error, setError] = useState(null)
  const { loginWithOAuth, exchangeOAuthCode, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const code = params.get('code')
    const errorParam = params.get('error')

    if (errorParam) {
      setError(params.get('error_description') || 'Authorization was denied')
      return
    }

    // New session-based flow (server-side callback)
    if (sessionId) {
      fetch(`${API_URL}/api/auth/github/session/${sessionId}`)
        .then(async (res) => {
          if (!res.ok) {
            const contentType = res.headers.get('content-type') || ''
            if (contentType.includes('application/json')) {
              const errData = await res.json()
              throw new Error(errData.error || 'Authentication failed')
            }
            throw new Error(`Server returned ${res.status}`)
          }
          return res.json()
        })
        .then(async (data) => {
          if (data.status === 'completed' && data.access_token) {
            const success = await loginWithOAuth(data.access_token)
            if (success) {
              navigate('/app', { replace: true })
            } else {
              setError('Failed to authenticate with GitHub')
            }
          } else {
            setError(data.error || 'Authentication session is invalid or expired')
          }
        })
        .catch((err) => setError(err.message || 'Network error during authentication'))
      return
    }

    // Legacy code-based flow (kept for backward compatibility)
    if (code) {
      exchangeOAuthCode(code).then(({ success, error: exchangeError }) => {
        if (success) {
          navigate('/app', { replace: true })
        } else {
          setError(exchangeError || 'Authentication failed')
        }
      })
      return
    }

    setError('No authorization code or session received')
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/app', { replace: true })
    }
  }, [isAuthenticated, navigate])

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'Barlow, sans-serif',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{
          background: '#ffebe9',
          border: '1px solid #ff8182',
          borderRadius: '10px',
          padding: '20px 28px',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#cf222e', fontSize: '15px' }}>
            Authentication failed
          </p>
          <p style={{ margin: 0, color: '#57606a', fontSize: '13px' }}>{error}</p>
        </div>
        <button
          onClick={() => navigate('/', { replace: true })}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            border: 'none',
            background: '#1f2328',
            color: '#fff',
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'Barlow, sans-serif',
      color: '#656d76',
      fontSize: '14px',
    }}>
      Connecting to GitHub...
    </div>
  )
}
