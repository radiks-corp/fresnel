import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { trackEvent } from '../hooks/useAnalytics'
import '../app.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const TOKEN_SCOPES = [
  { key: 'repo', label: 'repo', desc: 'Full control of private repositories' },
  { key: 'repo:status', label: 'repo:status', desc: 'Access commit status', indent: true },
  { key: 'repo_deployment', label: 'repo_deployment', desc: 'Access deployment status', indent: true },
  { key: 'public_repo', label: 'public_repo', desc: 'Access public repositories', indent: true },
  { key: 'repo:invite', label: 'repo:invite', desc: 'Access repository invitations', indent: true },
  { key: 'security_events', label: 'security_events', desc: 'Read and write security events', indent: true },
  { key: 'read:org', label: 'read:org', desc: 'Read org/team membership for team review requests' },
]

const PAT_STEPS = 3

const isElectron = () => typeof window !== 'undefined' && window.electronAPI?.isElectron

export default function OnboardingModal() {
  const [authChoice, setAuthChoice] = useState(null) // null = picker, 'oauth', 'pat'
  const [patInput, setPatInput] = useState('')
  const [patError, setPatError] = useState('')
  const [patLoading, setPatLoading] = useState(false)
  const [patSuccess, setPatSuccess] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [patStep, setPatStep] = useState(0)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [oauthError, setOauthError] = useState('')
  const pollingRef = useRef(null)

  const { isAuthenticated, loading, login, loginWithOAuth, validateToken } = useAuth()

  // Clean up polling on unmount or when auth succeeds
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [isAuthenticated])

  const handleOAuthLogin = async () => {
    setOauthLoading(true)
    setOauthError('')
    trackEvent('OAuth Login Started', { source: 'onboarding', flow: isElectron() ? 'desktop' : 'web' })

    try {
      const flow = isElectron() ? 'desktop' : 'web'
      const res = await fetch(`${API_URL}/api/auth/github/authorize?flow=${flow}`)
      const { authUrl, sessionId } = await res.json()

      if (!authUrl || !sessionId) {
        setOauthError('Failed to start OAuth flow. Please try again.')
        setOauthLoading(false)
        return
      }

      if (isElectron()) {
        window.electronAPI.openExternal(authUrl)
        // Poll the backend for session completion
        pollingRef.current = setInterval(async () => {
          try {
            const sessionRes = await fetch(`${API_URL}/api/auth/github/session/${sessionId}`)
            const data = await sessionRes.json()

            if (data.status === 'completed' && data.access_token) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
              await loginWithOAuth(data.access_token)
              setOauthLoading(false)
            } else if (data.status !== 'pending') {
              clearInterval(pollingRef.current)
              pollingRef.current = null
              setOauthError('Authentication session expired or was already used. Please try again.')
              setOauthLoading(false)
            }
          } catch {
            // Network blip — keep polling
          }
        }, 2000)
      } else {
        // Web flow: navigate in the current tab; the backend callback will redirect back
        window.location.href = authUrl
      }
    } catch (error) {
      console.error('Failed to start OAuth flow:', error)
      setOauthError('Could not connect to the server. Please try again.')
      setOauthLoading(false)
    }
  }

  const handlePatChange = async (value) => {
    setPatInput(value)
    setPatError('')
    setPatSuccess(false)

    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 10) return

    setPatLoading(true)
    const valid = await validateToken(trimmed)
    setPatLoading(false)

    if (valid) {
      setPatSuccess(true)
    } else {
      setPatError('Invalid token. Make sure it has repo and read:org access.')
      trackEvent('PAT Submission Failed', { source: 'onboarding' })
    }
  }

  const handlePatSubmit = async (e) => {
    e.preventDefault()
    if (!patInput.trim()) {
      setPatError('Please enter a token')
      return
    }
    if (!patSuccess) return
    setDismissing(true)
    setTimeout(async () => {
      setPatLoading(true)
      await login(patInput.trim())
      setPatLoading(false)
    }, 600)
  }

  if ((isAuthenticated && !dismissing) || loading) return null

  const showPicker = authChoice === null
  const showPat = authChoice === 'pat'
  const totalDots = showPicker ? 1 : PAT_STEPS
  const currentDot = showPicker ? 0 : patStep

  return (
    <div className={`onboarding-overlay ${dismissing ? 'dismissing' : ''}`}>
      <div className="onboarding-modal">
        <div className="onboarding-body">
          {showPicker && (
            <div className="onboarding-step">
              <h2 className="onboarding-title">SETUP</h2>
              <p className="onboarding-desc">Connect to GitHub</p>
              <p className="onboarding-subdesc">
                Choose how you'd like to authenticate. Both options give ReviewGPT the same access to your repositories.
              </p>

              {oauthError && <p className="onboarding-error" style={{ marginBottom: 12 }}>{oauthError}</p>}

              {oauthLoading && isElectron() && (
                <p className="onboarding-subdesc" style={{ marginBottom: 12, fontStyle: 'italic' }}>
                  Waiting for you to authorize in your browser...
                </p>
              )}

              <div className="auth-method-options">
                <button
                  className="auth-method-card recommended"
                  onClick={handleOAuthLogin}
                  disabled={oauthLoading}
                >
                  <div className="auth-method-icon">
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
                    </svg>
                  </div>
                  <div className="auth-method-content">
                    <div className="auth-method-name-row">
                      <span className="auth-method-name">Sign in with GitHub</span>
                      <span className="auth-method-badge">Recommended</span>
                    </div>
                    <span className="auth-method-description">
                      One-click OAuth authentication. Fastest and easiest way to get started.
                    </span>
                  </div>
                  <div className="auth-method-arrow">
                    {oauthLoading ? (
                      <span className="auth-method-spinner" />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    )}
                  </div>
                </button>

                <button
                  className="auth-method-card"
                  onClick={() => {
                    setAuthChoice('pat')
                    trackEvent('PAT Auth Selected', { source: 'onboarding' })
                  }}
                >
                  <div className="auth-method-icon pat-icon">
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                      <path fillRule="evenodd" d="M6.5 5.5a4 4 0 1 1 2.731 3.795L8.1 10.426a.75.75 0 0 1-.942.462L5.5 10.25l-1.5.75-1.5-.75L1 11.5V13h2l1-1 1 1h1.25a.75.75 0 0 0 .53-.22l.5-.5a.75.75 0 0 0 .22-.53V9.688a.75.75 0 0 0-.5-.707L6.5 8.5V5.5Zm4-2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
                    </svg>
                  </div>
                  <div className="auth-method-content">
                    <span className="auth-method-name">Personal Access Token</span>
                    <span className="auth-method-description">
                      Use a classic PAT. Required if your org enforces SAML SSO.
                    </span>
                  </div>
                  <div className="auth-method-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          )}

          {showPat && patStep === 0 && (
            <div className="onboarding-step">
              <h2 className="onboarding-title">PERSONAL ACCESS TOKEN</h2>
              <p className="onboarding-desc">Create a token</p>
              <p className="onboarding-subdesc">Generate a Personal Access Token (classic) with the <code>repo</code> and <code>read:org</code> scopes from your GitHub settings.</p>
              <video className="onboarding-video" src="/generate-token.mp4" autoPlay loop muted playsInline />
            </div>
          )}
          {showPat && patStep === 1 && (
            <div className="onboarding-step">
              <h2 className="onboarding-title">PERSONAL ACCESS TOKEN</h2>
              <p className="onboarding-desc">Authorize SSO (optional)</p>
              <p className="onboarding-subdesc">If your organization uses SAML SSO, click "Configure SSO" next to your token and authorize it for your org.</p>
              <img className="onboarding-image" src="/configure-sso.png" alt="Configure SSO" />
            </div>
          )}
          {showPat && patStep === 2 && (
            <div className="onboarding-step">
              <h2 className="onboarding-title">PERSONAL ACCESS TOKEN</h2>
              <p className="onboarding-desc">Connect to GitHub</p>
              <p className="onboarding-subdesc">Paste your token below. We'll validate it automatically, then click Connect to finish.</p>
              <form id="pat-form" onSubmit={handlePatSubmit}>
                <input
                  type="password"
                  className="onboarding-input"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={patInput}
                  onChange={e => handlePatChange(e.target.value)}
                  autoFocus
                />
                {patError && <p className="onboarding-error">{patError}</p>}
                <p className="onboarding-info">Your token is never stored on our servers and stays only on your machine.</p>
              </form>
              <div className="scope-list">
                {TOKEN_SCOPES.map((scope, i) => (
                  <div key={scope.key} className={`scope-item ${scope.indent ? 'indent' : ''}`}>
                    <span
                      className={`scope-check ${patSuccess ? 'checked' : ''}`}
                      style={patSuccess ? { animationDelay: `${i * 120}ms` } : undefined}
                    >
                      {patSuccess && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path
                            d="M2 5.5L4 7.5L8 3"
                            stroke="#fff"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="check-path"
                            style={{ animationDelay: `${i * 120}ms` }}
                          />
                        </svg>
                      )}
                    </span>
                    <span className="scope-label">{scope.label}</span>
                    <span className="scope-desc">{scope.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="onboarding-footer">
          {showPat && (
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=ReviewGPT"
              target="_blank"
              rel="noopener noreferrer"
              className="onboarding-link"
            >
              Create a new token →
            </a>
          )}
          {showPicker && <div className="onboarding-link" />}
          <div className="onboarding-dots">
            {Array.from({ length: totalDots }).map((_, i) => (
              <span
                key={i}
                className={`onboarding-dot ${i === currentDot ? 'active' : ''}`}
                onClick={() => {
                  if (showPat) setPatStep(i)
                }}
              />
            ))}
          </div>
          <div className="onboarding-nav">
            {showPat && (
              <button
                className="onboarding-btn back"
                onClick={() => {
                  if (patStep === 0) {
                    setAuthChoice(null)
                    setPatInput('')
                    setPatError('')
                    setPatSuccess(false)
                  } else {
                    setPatStep(s => s - 1)
                  }
                }}
              >
                ‹ Back
              </button>
            )}
            {showPat && patStep < PAT_STEPS - 1 && (
              <button className="onboarding-btn next" onClick={() => setPatStep(s => s + 1)}>
                Next ›
              </button>
            )}
            {showPat && patStep === PAT_STEPS - 1 && (
              <button
                type="submit"
                form="pat-form"
                className={`onboarding-btn next ${patSuccess ? 'success' : ''}`}
                disabled={patLoading}
                style={patSuccess ? { animationDelay: `${TOKEN_SCOPES.length * 120 + 200}ms` } : undefined}
              >
                {patLoading ? 'Connecting...' : patSuccess ? 'Connected' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
