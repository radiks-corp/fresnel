import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { trackEvent } from '../hooks/useAnalytics'
import '../app.css'

const TOKEN_SCOPES = [
  { key: 'repo', label: 'repo', desc: 'Full control of private repositories' },
  { key: 'repo:status', label: 'repo:status', desc: 'Access commit status', indent: true },
  { key: 'repo_deployment', label: 'repo_deployment', desc: 'Access deployment status', indent: true },
  { key: 'public_repo', label: 'public_repo', desc: 'Access public repositories', indent: true },
  { key: 'repo:invite', label: 'repo:invite', desc: 'Access repository invitations', indent: true },
  { key: 'security_events', label: 'security_events', desc: 'Read and write security events', indent: true },
]

const TOTAL_STEPS = 3

export default function OnboardingModal() {
  const [patInput, setPatInput] = useState('')
  const [patError, setPatError] = useState('')
  const [patLoading, setPatLoading] = useState(false)
  const [patSuccess, setPatSuccess] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [step, setStep] = useState(0)

  const { isAuthenticated, loading, login, validateToken } = useAuth()

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
      setPatError('Invalid token. Make sure it has repo access.')
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

  return (
    <div className={`onboarding-overlay ${dismissing ? 'dismissing' : ''}`}>
      <div className="onboarding-modal">
        <div className="onboarding-body">
          {step === 0 && (
            <div className="onboarding-step">
              <h2 className="onboarding-title">SETUP</h2>
              <p className="onboarding-desc">Create a token</p>
              <p className="onboarding-subdesc">Generate a Personal Access Token (classic) with the <code>repo</code> scope from your GitHub settings.</p>
              <video className="onboarding-video" src="/generate-token.mp4" autoPlay loop muted playsInline />
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-step">
              <h2 className="onboarding-title">SETUP</h2>
              <p className="onboarding-desc">Authorize SSO (optional)</p>
              <p className="onboarding-subdesc">If your organization uses SAML SSO, click "Configure SSO" next to your token and authorize it for your org.</p>
              <img className="onboarding-image" src="/configure-sso.png" alt="Configure SSO" />
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-step">
              <h2 className="onboarding-title">SETUP</h2>
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
                <p className="onboarding-info">Your token is never stored and stays only on your machine.</p>
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
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=Fresnel"
            target="_blank"
            rel="noopener noreferrer"
            className="onboarding-link"
          >
            Create a new token →
          </a>
          <div className="onboarding-dots">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={`onboarding-dot ${i === step ? 'active' : ''}`}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <div className="onboarding-nav">
            {step > 0 && (
              <button className="onboarding-btn back" onClick={() => setStep(s => s - 1)}>
                ‹ Back
              </button>
            )}
            {step < TOTAL_STEPS - 1 && (
              <button className="onboarding-btn next" onClick={() => setStep(s => s + 1)}>
                Next ›
              </button>
            )}
            {step === TOTAL_STEPS - 1 && (
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
