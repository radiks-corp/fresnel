import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { MagnifyingGlass, Folder, CaretDown } from '@phosphor-icons/react'
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
        onDismiss={() => {}}
      />
      <div className={`app-shell${repoId ? '' : ' no-sidebar'}`}>
        {repoId && (
          <ReviewSidebar
            owner={selectedRepo?.owner?.login}
            repo={selectedRepo?.name}
            repoId={repoId || inboxRepoId}
            prNumber={prNumber ? parseInt(prNumber) : undefined}
            chatKey={`${repoId || inboxRepoId}-${prNumber}`}
            userAvatar={user?.avatar_url}
            userName={user?.name || user?.login}
          />
        )}
        <div className="app-shell-content">
          <Outlet context={{
            repoBarProps: !repoId ? {
              omnibarRef,
              isOmnibarOpen,
              setIsOmnibarOpen,
              selectedRepo,
              inputRef,
              repoSearchQuery,
              setRepoSearchQuery,
              handleOmnibarKeyDown,
              sortedFilteredRepos,
              highlightedIndex,
              setHighlightedIndex,
              handleRepoSelect,
              closeOmnibar,
              itemRefs,
            } : null,
          }} />
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
