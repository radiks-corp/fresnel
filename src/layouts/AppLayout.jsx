import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { MagnifyingGlass, Folder, Bug } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRepos } from '../hooks/useRepos'
import { trackEvent } from '../hooks/useAnalytics'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { useOperationsStore } from '../stores/operationsStore'
import { useDiagnostics, useDiagnosticTrackers } from '../hooks/useDiagnostics'
import ReviewSidebar from '../components/ReviewSidebar'
import DiagnosticsPanel from '../components/DiagnosticsPanel'
import SidebarContext from '../contexts/SidebarContext'
import { StatusBanner } from '../components/StatusBanner'
import '../app.css'

const defaultSidebarData = {
  onApplyComment: null,
  viewedCount: 0,
  totalFiles: 0,
  pendingComments: [],
}

export default function AppLayout() {
  const { repoId, prNumber } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const { data: repos = [] } = useRepos()
  const { isConnected } = useBackendHealth()
  const navigate = useNavigate()
  const [sidebarData, setSidebarDataState] = useState(defaultSidebarData)
  const [inboxRepoId, setInboxRepoId] = useState(null)
  const [repoSearchQuery, setRepoSearchQuery] = useState('')
  const [isOmnibarOpen, setIsOmnibarOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const omnibarRef = useRef(null)
  const inputRef = useRef(null)
  const itemRefs = useRef([])
  const kPressCountRef = useRef(0)
  const isOmnibarOpenRef = useRef(false)
  const highlightedIndexRef = useRef(0)
  const sortedFilteredReposRef = useRef([])
  const handleRepoSelectRef = useRef(null)
  const { enabled: diagnosticsEnabled, togglePanel, isPanelOpen } = useDiagnostics()
  const { record, startSpan, endSpan } = useDiagnosticTrackers()

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

  useEffect(() => {
    const spanId = startSpan('route-navigation', {
      category: 'navigation',
      tags: { path: location.pathname },
      context: { search: location.search },
    })

    const timer = window.setTimeout(() => {
      endSpan(spanId, {
        category: 'navigation',
        message: 'Route transition settled',
        tags: { path: location.pathname, panelOpen: isPanelOpen },
      })
    }, 50)

    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search, startSpan, endSpan, isPanelOpen])

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

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        togglePanel()
        record({
          category: 'diagnostics',
          level: 'info',
          action: 'panel-toggle-shortcut',
          message: 'Diagnostics panel toggled from keyboard shortcut',
          tags: { path: location.pathname },
        })
        return
      }

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
  }, [location.pathname, record, togglePanel])

  // Click outside to close
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
              <button
                type="button"
                className={`diagnostics-toggle-btn ${diagnosticsEnabled ? 'enabled' : ''}`}
                onClick={togglePanel}
                title="Toggle diagnostics panel (Cmd/Ctrl + Shift + D)"
              >
                <Bug size={14} />
                <span>Diagnostics</span>
              </button>
              {user && (
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="shared-header-avatar"
                />
              )}
            </div>
          </header>
          <Outlet />
          <DiagnosticsPanel />
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
