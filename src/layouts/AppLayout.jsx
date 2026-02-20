import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { MagnifyingGlass, Folder } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRepos } from '../hooks/useRepos'
import { trackEvent } from '../hooks/useAnalytics'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { useOperationsStore } from '../stores/operationsStore'
import ReviewSidebar from '../components/ReviewSidebar'
import SidebarContext from '../contexts/SidebarContext'
import { StatusBanner } from '../components/StatusBanner'
import { apiFetch } from '../hooks/useGitHubAPI'
import '../app.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function quotaDotColor(left) {
  if (left >= 15) return '#22c55e'  // green
  if (left >= 8)  return '#f59e0b'  // yellow
  return '#ef4444'                   // red
}

const defaultSidebarData = {
  onApplyComment: null,
  viewedCount: 0,
  totalFiles: 0,
  pendingComments: [],
}

export default function AppLayout() {
  const { repoId, prNumber } = useParams()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { data: repos = [] } = useRepos()
  const { isConnected } = useBackendHealth()
  const navigate = useNavigate()
  const [sidebarData, setSidebarDataState] = useState(defaultSidebarData)
  const [inboxRepoId, setInboxRepoId] = useState(null)
  const [repoSearchQuery, setRepoSearchQuery] = useState('')
  const [isOmnibarOpen, setIsOmnibarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [completionsLeft, setCompletionsLeft] = useState(null)
  const profileRef = useRef(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const omnibarRef = useRef(null)
  const inputRef = useRef(null)
  const itemRefs = useRef([])
  const kPressCountRef = useRef(0)
  const isOmnibarOpenRef = useRef(false)
  const highlightedIndexRef = useRef(0)
  const sortedFilteredReposRef = useRef([])
  const handleRepoSelectRef = useRef(null)

  const setSidebarData = useCallback((data) => {
    setSidebarDataState(prev => ({ ...prev, ...data }))
  }, [])

  // Determine selected repo: URL param (AppPage) > local state (InboxPage) > first repo
  const effectiveRepoId = repoId || inboxRepoId
  const selectedRepo = useMemo(() => {
    if (effectiveRepoId) {
      return repos.find(r => r.id.toString() === effectiveRepoId) || null
    }
    return repos[0] || null
  }, [repos, effectiveRepoId])

  // Auto-select first repo when repos load and we're on the inbox
  useEffect(() => {
    if (repos.length > 0 && !inboxRepoId && !repoId) {
      setInboxRepoId(repos[0].id.toString())
    }
  }, [repos, inboxRepoId, repoId])

  // Register a global callback so the operations store can trigger React Query invalidation
  const queryClient = useQueryClient()
  const setOnOperationSuccess = useOperationsStore((s) => s.setOnOperationSuccess)
  useEffect(() => {
    setOnOperationSuccess((operation) => {
      const [owner, repo] = operation.repo.split('/')
      const issueNum = String(operation.issueNumber)
      queryClient.invalidateQueries({ queryKey: ['issueTimeline', owner, repo, issueNum] })
      queryClient.invalidateQueries({ queryKey: ['issueDetails', owner, repo, issueNum] })
      queryClient.invalidateQueries({ queryKey: ['inboxIssues'] })
    })
    return () => setOnOperationSuccess(null)
  }, [queryClient, setOnOperationSuccess])

  // Filter repos for omnibar search, with selected repo pinned to top
  const sortedFilteredRepos = useMemo(() => {
    let filtered = repos
    if (repoSearchQuery.trim()) {
      const q = repoSearchQuery.toLowerCase()
      filtered = repos.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.owner.login.toLowerCase().includes(q) ||
        `${r.owner.login}/${r.name}`.toLowerCase().includes(q)
      )
    }
    if (!selectedRepo) return filtered
    const selected = filtered.find(r => r.id === selectedRepo.id)
    const rest = filtered.filter(r => r.id !== selectedRepo.id)
    return selected ? [selected, ...rest] : rest
  }, [repos, repoSearchQuery, selectedRepo])

  const handleRepoSelect = useCallback((repo) => {
    const id = repo.id.toString()
    if (repoId) {
      navigate(`/app/${id}`)
    } else {
      setInboxRepoId(id)
    }
    setRepoSearchQuery('')
    trackEvent('Repo Selected', { repo: `${repo.owner.login}/${repo.name}` })
  }, [repoId, navigate])

  const openOmnibar = useCallback(() => {
    setRepoSearchQuery('')
    setHighlightedIndex(0)
    setIsOmnibarOpen(true)
  }, [])

  const closeOmnibar = useCallback(() => {
    setIsOmnibarOpen(false)
    setRepoSearchQuery('')
  }, [])

  // Focus input when omnibar opens
  useEffect(() => {
    if (isOmnibarOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOmnibarOpen])

  // Reset highlighted index when search query changes
  useEffect(() => {
    setHighlightedIndex(0)
  }, [repoSearchQuery])

  // Scroll highlighted item into view
  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  // Keep refs in sync with state for use in global event handlers
  useEffect(() => { isOmnibarOpenRef.current = isOmnibarOpen }, [isOmnibarOpen])
  useEffect(() => { highlightedIndexRef.current = highlightedIndex }, [highlightedIndex])
  useEffect(() => { sortedFilteredReposRef.current = sortedFilteredRepos }, [sortedFilteredRepos])
  useEffect(() => { handleRepoSelectRef.current = handleRepoSelect }, [handleRepoSelect])

  // Global Cmd+K: tap-to-open, hold+repeat to quick-switch (like Cmd+Tab)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target
      const isEditable = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )

      if (isEditable) return

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        kPressCountRef.current++

        if (!isOmnibarOpenRef.current) {
          setRepoSearchQuery('')
          setHighlightedIndex(0)
          setIsOmnibarOpen(true)
        } else {
          const count = sortedFilteredReposRef.current.length
          if (count > 0) {
            setHighlightedIndex(prev => (prev + 1) % count)
          }
        }
      }
    }

    const handleKeyUp = (e) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        if (kPressCountRef.current > 1 && isOmnibarOpenRef.current) {
          const repos = sortedFilteredReposRef.current
          const idx = highlightedIndexRef.current
          if (repos[idx]) {
            handleRepoSelectRef.current(repos[idx])
            setIsOmnibarOpen(false)
            setRepoSearchQuery('')
          }
        }
        kPressCountRef.current = 0
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [location.pathname])

  // Click outside to close omnibar
  useEffect(() => {
    if (!isOmnibarOpen) return
    const handleMouseDown = (e) => {
      if (omnibarRef.current && !omnibarRef.current.contains(e.target)) {
        closeOmnibar()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOmnibarOpen, closeOmnibar])

  // Click outside to close profile dropdown
  useEffect(() => {
    if (!profileOpen) return
    const handleMouseDown = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [profileOpen])

  // Fetch quota when profile opens (or on mount if user is available)
  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('github_token') || localStorage.getItem('github_pat')
    if (!token) return
    fetch(`${API_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.completionsLeft != null) setCompletionsLeft(data.completionsLeft) })
      .catch(() => {})
  }, [user, profileOpen])

  // Keyboard navigation for omnibar input
  const handleOmnibarKeyDown = useCallback((e) => {
    const count = sortedFilteredRepos.length

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (count > 0) setHighlightedIndex(prev => (prev + 1) % count)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (count > 0) setHighlightedIndex(prev => (prev - 1 + count) % count)
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < count) {
          handleRepoSelect(sortedFilteredRepos[highlightedIndex])
          closeOmnibar()
        }
        break
      case 'Escape':
        e.preventDefault()
        closeOmnibar()
        break
    }
  }, [sortedFilteredRepos, highlightedIndex, handleRepoSelect, closeOmnibar])

  return (
    <SidebarContext.Provider value={{ ...sidebarData, setSidebarData, selectedRepo }}>
      <StatusBanner 
        message={!isConnected ? 'Unable to connect to backend server. Some features may be unavailable.' : ''}
        onDismiss={() => console.log('Status banner dismissed')}
      />
      <div className="app-shell">
        <ReviewSidebar
          owner={selectedRepo?.owner?.login}
          repo={selectedRepo?.name}
          repoId={repoId || inboxRepoId}
          prNumber={prNumber ? parseInt(prNumber) : undefined}
          chatKey={`${repoId || inboxRepoId}-${prNumber}`}
          userAvatar={user?.avatar_url}
          userName={user?.name || user?.login}
        />
        <div className="app-shell-content">
          <header className="shared-header">
            <div className="shared-header-left" />

            <div className="omnibar" ref={omnibarRef}>
              <button className="omnibar-trigger" onClick={openOmnibar}>
                <MagnifyingGlass size={16} className="omnibar-search-icon" />
                <span className="omnibar-text">
                  {selectedRepo
                    ? `${selectedRepo.owner.login}/${selectedRepo.name}`
                    : 'Search repositories...'}
                </span>
                <kbd className="omnibar-shortcut">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl '}K</kbd>
              </button>

              {isOmnibarOpen && (
                <div className="omnibar-panel">
                  <div className="omnibar-input-row">
                    <MagnifyingGlass size={14} className="omnibar-input-icon" />
                    <input
                      ref={inputRef}
                      type="text"
                      className="omnibar-input"
                      placeholder="Search repositories..."
                      value={repoSearchQuery}
                      onChange={(e) => setRepoSearchQuery(e.target.value)}
                      onKeyDown={handleOmnibarKeyDown}
                    />
                  </div>
                  <div className="omnibar-results">
                    {sortedFilteredRepos.length > 0 ? (
                      sortedFilteredRepos.map((repo, index) => (
                        <div
                          key={repo.id}
                          ref={el => itemRefs.current[index] = el}
                          className={`omnibar-item ${highlightedIndex === index ? 'highlighted' : ''}`}
                          onClick={() => {
                            handleRepoSelect(repo)
                            closeOmnibar()
                          }}
                          onMouseEnter={() => setHighlightedIndex(index)}
                        >
                          <Folder size={16} className="omnibar-item-icon" />
                          <span className="omnibar-item-name">
                            {repo.owner.login}/{repo.name}
                          </span>
                          {repo.private && (
                            <span className="omnibar-item-badge">Private</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="omnibar-empty">No repositories found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="shared-header-right">
              {user && (
                <div className="profile-menu" ref={profileRef}>
                  <button
                    className="profile-menu-trigger"
                    onClick={() => setProfileOpen(o => !o)}
                    aria-label="Account menu"
                  >
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="shared-header-avatar"
                    />
                  </button>

                  {profileOpen && (
                    <div className="profile-dropdown">
                      <div className="profile-dropdown-user">
                        <img src={user.avatar_url} alt={user.login} className="profile-dropdown-avatar" />
                        <div className="profile-dropdown-info">
                          <span className="profile-dropdown-name">{user.name || user.login}</span>
                          <span className="profile-dropdown-login">@{user.login}</span>
                        </div>
                      </div>

                      <div className="profile-dropdown-divider" />

                      <div className="profile-dropdown-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="profile-dropdown-icon">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                        <span className="profile-dropdown-label">Signed in with GitHub</span>
                      </div>

                      <div className="profile-dropdown-row">
                        <span
                          className="profile-quota-dot"
                          style={{ background: completionsLeft != null ? quotaDotColor(completionsLeft) : '#d1d5db' }}
                        />
                        <span className="profile-dropdown-label">
                          {completionsLeft != null
                            ? <><strong>{completionsLeft}</strong> AI completions left</>
                            : 'Loading quota…'}
                        </span>
                      </div>

                      <div className="profile-dropdown-divider" />

                      <button
                        className="profile-dropdown-logout"
                        onClick={() => { setProfileOpen(false); logout(); trackEvent('User Logged Out via Menu') }}
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>
          <Outlet />
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
