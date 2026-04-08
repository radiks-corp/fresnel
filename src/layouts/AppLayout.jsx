import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRepos } from '../hooks/useRepos'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { useOperationsStore } from '../stores/operationsStore'
import ReviewSidebar from '../components/ReviewSidebar'
import SidebarContext from '../contexts/SidebarContext'
import { StatusBanner } from '../components/StatusBanner'
import UpdateNotification from '../components/UpdateNotification'
import '../app.css'

const defaultSidebarData = {
  onApplyComment: null,
  viewedCount: 0,
  totalFiles: 0,
  pendingComments: [],
}

export default function AppLayout() {
  const { repoId, prNumber } = useParams()
  const { user } = useAuth()
  const { data: repos = [] } = useRepos()
  const { isConnected } = useBackendHealth()
  const [sidebarData, setSidebarDataState] = useState(defaultSidebarData)
  const [inboxRepoId, setInboxRepoId] = useState(null)

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


  return (
    <SidebarContext.Provider value={{ ...sidebarData, setSidebarData, selectedRepo }}>
      <StatusBanner 
        message={!isConnected ? 'Unable to connect to backend server. Some features may be unavailable.' : ''}
        onDismiss={() => {}}
      />
      <UpdateNotification />
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
          <Outlet />
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
