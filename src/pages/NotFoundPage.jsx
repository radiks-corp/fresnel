import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './NotFoundPage.css'

const REDIRECT_SECONDS = 8

function NotFoundPage() {
  const navigate = useNavigate()
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate('/app', { replace: true })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [navigate])

  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <div className="not-found-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9.4" stroke="currentColor" strokeWidth="1.33" />
            <circle cx="12" cy="12" r="6.6" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
          </svg>
        </div>

        <h1 className="not-found-code">404</h1>
        <p className="not-found-title">Page not found</p>
        <p className="not-found-desc">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <button
          type="button"
          className="not-found-btn"
          onClick={() => navigate('/app', { replace: true })}
        >
          Go to Inbox
        </button>

        <p className="not-found-countdown">
          Redirecting in {countdown}s
        </p>
      </div>
    </div>
  )
}

export default NotFoundPage
