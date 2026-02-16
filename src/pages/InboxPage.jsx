import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { trackEvent } from '../hooks/useAnalytics'
import { useRepos } from '../hooks/useRepos'
import { useInboxIssues, useInboxPulls } from '../hooks/useInboxItems'
import { useSidebarContext } from '../contexts/SidebarContext'
import { MagnifyingGlass, GitPullRequest, CircleDashed } from '@phosphor-icons/react'
import OnboardingModal from '../components/OnboardingModal'
import './InboxPage.css'

function formatTimeAgo(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function labelColor(color) {
  if (!color) return {}
  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return {
    backgroundColor: `#${color}`,
    color: luminance > 0.5 ? '#24292f' : '#fff',
  }
}

export default function InboxPage() {
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('inboxActiveTab')
    return saved || 'pulls'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Debounce search query so we don't fire a request on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { selectedRepo } = useSidebarContext()

  // Data fetching via react-query hooks (search is handled server-side)
  const { data: repos = [], isLoading: loadingRepos } = useRepos()

  const activeRepos = selectedRepo ? [selectedRepo] : []
  const { data: issues = [], isLoading: loadingIssues } = useInboxIssues(activeRepos, debouncedQuery)
  const { data: pulls = [], isLoading: loadingPulls } = useInboxPulls(activeRepos, user?.login, debouncedQuery)

  const loadingItems = loadingIssues || loadingPulls

  const handlePRClick = (pr) => {
    if (!selectedRepo) return
    trackEvent('Inbox PR Clicked', {
      repo: `${selectedRepo.owner.login}/${selectedRepo.name}`,
      pr_number: pr.number,
    })
    navigate(`/app/${selectedRepo.id}/${pr.number}`)
  }

  const handleIssueClick = (issue) => {
    if (!selectedRepo) return
    trackEvent('Inbox Issue Clicked', {
      repo: `${selectedRepo.owner.login}/${selectedRepo.name}`,
      issue_number: issue.number,
    })
    navigate(`/app/${selectedRepo.id}/issues/${issue.number}`)
  }

  // Items are already filtered server-side via GitHub Search API
  const items = activeTab === 'issues' ? issues : pulls

  if (loading) return null

  return (
    <div className="inbox-layout">
      <div className="inbox-container">
        <div className="inbox-tabs-bar">
          <button
            className={`tab ${activeTab === 'pulls' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('pulls')
              localStorage.setItem('inboxActiveTab', 'pulls')
              trackEvent('Inbox Tab Changed', { tab: 'pulls' })
            }}
          >
            Pull requests <span className="tab-count">{pulls.length}</span>
          </button>
          <button
            className={`tab ${activeTab === 'issues' ? 'active' : ''}`}
            onClick={() => { 
              setActiveTab('issues')
              localStorage.setItem('inboxActiveTab', 'issues')
              trackEvent('Inbox Tab Changed', { tab: 'issues' })
            }}
          >
            Issues <span className="tab-count">{issues.length}</span>
          </button>
        </div>

        <div className="inbox-toolbar">
          <div className="inbox-search">
            <MagnifyingGlass size={14} className="inbox-search-icon" />
            <input
              type="text"
              placeholder={`Filter ${activeTab === 'issues' ? 'issues' : 'pull requests'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="inbox-search-input"
            />
          </div>
          <span className="inbox-result-count">
            {items.length} {activeTab === 'issues' ? 'issue' : 'pull request'}{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="inbox-list">
          {loadingRepos || loadingItems ? (
            <div className="inbox-empty">Loading...</div>
          ) : items.length === 0 ? (
            <div className="inbox-empty">
              {searchQuery
                ? `No ${activeTab === 'issues' ? 'issues' : 'pull requests'} matching "${searchQuery}"`
                : `No open ${activeTab === 'issues' ? 'issues' : 'pull requests'}`}
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="inbox-row"
                onClick={() => activeTab === 'pulls' ? handlePRClick(item) : handleIssueClick(item)}
              >
                <div className="inbox-row-icon">
                  {activeTab === 'pulls' ? (
                    item.draft
                      ? <GitPullRequest size={16} className="inbox-icon draft" />
                      : <GitPullRequest size={16} className="inbox-icon open" />
                  ) : (
                    <CircleDashed size={16} className="inbox-icon issue-open" />
                  )}
                </div>

                <div className="inbox-row-content">
                  <div className="inbox-row-title-line">
                    <span className="inbox-row-title">{item.title}</span>
                    {item.labels?.map((label) => (
                      <span key={label.id} className="inbox-label" style={labelColor(label.color)}>
                        {label.name}
                      </span>
                    ))}
                  </div>
                  <div className="inbox-row-meta">
                    <span className="inbox-row-number">#{item.number}</span>
                    <span className="inbox-row-sep">·</span>
                    <span>{item.user?.login}</span>
                    <span className="inbox-row-sep">·</span>
                    <span>{formatTimeAgo(item.updated_at)}</span>
                    {item.comments > 0 && (
                      <>
                        <span className="inbox-row-sep">·</span>
                        <span className="inbox-row-comments">
                          {item.comments} comment{item.comments !== 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="inbox-row-right">
                  {item.assignees?.length > 0 && (
                    <div className="inbox-row-assignees">
                      {item.assignees.slice(0, 3).map((a) => (
                        <img key={a.id} src={a.avatar_url} alt={a.login} className="inbox-row-assignee" title={a.login} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <OnboardingModal />
    </div>
  )
}
