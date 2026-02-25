import { useState, useEffect, useRef } from 'react'
import { useProviderStore } from '../stores/providerStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function ProviderSettings({ open, onClose }) {
  const { source, provider, model, apiKey, setSource, setProvider, setModel, setApiKey, reset } = useProviderStore()
  const [providers, setProviders] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!open) return
    fetch(`${API_URL}/api/providers`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.providers) setProviders(data.providers) })
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const selectedProviderData = providers?.find(p => p.id === provider)
  const models = selectedProviderData?.models || []

  const handleSourceChange = (newSource) => {
    setSource(newSource)
    if (newSource === 'default') {
      reset()
    }
    setKeyError('')
  }

  const handleProviderChange = (e) => {
    setProvider(e.target.value)
    setKeyError('')
    setShowKey(false)
  }

  const handleKeyChange = (e) => {
    const val = e.target.value.trim()
    setApiKey(val)
    setKeyError('')

    if (val && provider === 'anthropic' && !val.startsWith('sk-ant-')) {
      setKeyError('Anthropic keys typically start with sk-ant-')
    }
    if (val && provider === 'openai' && !val.startsWith('sk-')) {
      setKeyError('OpenAI keys typically start with sk-')
    }
  }

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="provider-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="provider-modal">
        <div className="provider-modal-header">
          <h3 className="provider-modal-title">AI Provider Settings</h3>
          <button className="provider-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
        </div>

        <div className="provider-modal-body">
          <div className="provider-source-cards">
            <button
              className={`provider-source-card ${source === 'default' ? 'active' : ''}`}
              onClick={() => handleSourceChange('default')}
            >
              <div className="provider-source-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div className="provider-source-card-text">
                <span className="provider-source-card-title">Fresnel Default</span>
                <span className="provider-source-card-desc">Uses shared quota (25 completions)</span>
              </div>
            </button>

            <button
              className={`provider-source-card ${source === 'byok' ? 'active' : ''}`}
              onClick={() => handleSourceChange('byok')}
            >
              <div className="provider-source-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </div>
              <div className="provider-source-card-text">
                <span className="provider-source-card-title">Bring Your Own Key</span>
                <span className="provider-source-card-desc">Unlimited usage, billed to your account</span>
              </div>
            </button>
          </div>

          {source === 'byok' && (
            <div className="provider-byok-config">
              <label className="provider-field-label">Provider</label>
              <select
                className="provider-select"
                value={provider}
                onChange={handleProviderChange}
              >
                {providers ? providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                )) : (
                  <>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                  </>
                )}
              </select>

              <label className="provider-field-label">
                API Key
                {selectedProviderData?.keyUrl && (
                  <a
                    href={selectedProviderData.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="provider-key-link"
                  >
                    Get a key
                  </a>
                )}
              </label>
              <div className="provider-key-wrapper">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="provider-key-input"
                  value={apiKey}
                  onChange={handleKeyChange}
                  placeholder={selectedProviderData?.keyPlaceholder || 'Paste your API key'}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className="provider-key-toggle"
                  onClick={() => setShowKey(v => !v)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  type="button"
                >
                  {showKey ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {keyError && <p className="provider-key-error">{keyError}</p>}

              <label className="provider-field-label">Model (optional)</label>
              <select
                className="provider-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="">Default ({selectedProviderData?.defaultModel || 'auto'})</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <p className="provider-info-note">
                Your API key is stored locally in this browser only and sent directly to {provider === 'openai' ? 'OpenAI' : 'Anthropic'} per-request. It is never saved on our servers.
              </p>
            </div>
          )}
        </div>

        <div className="provider-modal-footer">
          <button className="provider-modal-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
