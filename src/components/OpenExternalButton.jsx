import { useState, useEffect, useRef, useCallback } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import './OpenExternalButton.css'

const PREF_KEY = 'openExternal_preferred'

function GitHubLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function GraphiteLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="m20.704 7.123-9.27-2.484-6.788 6.793 2.482 9.276 9.27 2.484 6.788-6.793-2.482-9.276Z" />
      <path d="M17.644 0 3.73 3.729 0 17.644l10.187 10.187 13.915-3.729 3.73-13.915L17.643 0Zm2.27 24.312H7.917L1.92 13.915 7.917 3.518h11.997l5.998 10.397-5.998 10.397Z" />
    </svg>
  )
}

function getGitHubUrl(owner, repo, number, type) {
  if (type === 'issue') {
    return `https://github.com/${owner}/${repo}/issues/${number}`
  }
  return `https://github.com/${owner}/${repo}/pull/${number}`
}

function getGraphiteUrl(owner, repo, number) {
  return `https://app.graphite.com/github/pr/${owner}/${repo}/${number}`
}

function openInBrowser(url) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export default function OpenExternalButton({ type, owner, repo, number }) {
  const [preferred, setPreferred] = useState(() => {
    if (type === 'issue') return 'github'
    return localStorage.getItem(PREF_KEY) || 'github'
  })
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef(null)

  const isPR = type === 'pr'

  useEffect(() => {
    if (isPR) {
      const saved = localStorage.getItem(PREF_KEY)
      if (saved) setPreferred(saved)
    }
  }, [isPR])

  const setPreference = useCallback((service) => {
    setPreferred(service)
    localStorage.setItem(PREF_KEY, service)
    setDropdownOpen(false)
  }, [])

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const getUrl = useCallback((service) => {
    if (service === 'graphite' && isPR) {
      return getGraphiteUrl(owner, repo, number)
    }
    return getGitHubUrl(owner, repo, number, type)
  }, [owner, repo, number, type, isPR])

  const currentUrl = getUrl(isPR ? preferred : 'github')

  const handleOpen = useCallback(() => {
    openInBrowser(currentUrl)
  }, [currentUrl])

  // Cmd+G shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && !e.shiftKey) {
        const target = e.target
        const isEditable = target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        )
        if (isEditable) return

        e.preventDefault()
        openInBrowser(currentUrl)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [currentUrl])

  if (!owner || !repo || !number) return null

  const activeService = isPR ? preferred : 'github'
  const label = activeService === 'graphite' ? 'Open in Graphite' : 'Open in GitHub'
  const logo = activeService === 'graphite' ? <GraphiteLogo size={15} /> : <GitHubLogo size={15} />

  return (
    <div className="open-external" ref={containerRef}>
      <button
        type="button"
        className="open-external-btn"
        onClick={handleOpen}
        title={`${label} (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'}G)`}
      >
        {logo}
        <span className="open-external-label">{label}</span>
      </button>

      {isPR && (
        <>
          <button
            type="button"
            className="open-external-dropdown-toggle"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-label="Choose service"
          >
            <CaretDown size={12} weight="bold" />
          </button>

          {dropdownOpen && (
            <div className="open-external-dropdown">
              <button
                type="button"
                className={`open-external-dropdown-item ${preferred === 'github' ? 'active' : ''}`}
                onClick={() => setPreference('github')}
              >
                <GitHubLogo size={15} />
                <span>Open in GitHub</span>
                {preferred === 'github' && (
                  <svg className="open-external-check" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className={`open-external-dropdown-item ${preferred === 'graphite' ? 'active' : ''}`}
                onClick={() => setPreference('graphite')}
              >
                <GraphiteLogo size={15} />
                <span>Open in Graphite</span>
                {preferred === 'graphite' && (
                  <svg className="open-external-check" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
