import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { trackEvent } from '../hooks/useAnalytics'
import { useRepos } from '../hooks/useRepos'
import { useInboxPulls } from '../hooks/useInboxItems'
import { useSidebarContext } from '../contexts/SidebarContext'
import { MagnifyingGlass, CaretDown, CaretLineLeft, CaretLineRight, ArrowUp } from '@phosphor-icons/react'
import OnboardingModal from '../components/OnboardingModal'
import './InboxPage.css'

const REVIEW_FILTERS = [
  { label: 'Awaiting review from you', value: 'awaiting_review_from_you' },
  { label: 'Review required', value: 'review_required' },
  { label: 'Approved', value: 'approved' },
  { label: 'Changes requested', value: 'changes_requested' },
  { label: 'Reviewed by you', value: 'reviewed_by_you' },
  { label: 'Not reviewed by you', value: 'not_reviewed_by_you' },
]

export default function InboxPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [reviewFilter, setReviewFilter] = useState(() => {
    return localStorage.getItem('inboxReviewFilter') ?? 'awaiting_review_from_you'
  })
  const [showClosed, setShowClosed] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { selectedRepo } = useSidebarContext()
  const { repoBarProps } = useOutletContext() || {}

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: repos = [], isLoading: loadingRepos } = useRepos()
  const activeRepos = selectedRepo ? [selectedRepo] : []
  const {
    data: pullsData,
    isLoading: loadingPulls,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInboxPulls(activeRepos, user?.login, debouncedQuery, reviewFilter)
  const pulls = pullsData?.pulls ?? []
  const pullsTotalCount = pullsData?.totalCount ?? 0

  useEffect(() => {
    if (!filterOpen) return
    const handleMouseDown = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [filterOpen])

  const handlePRClick = useCallback((pr, e) => {
    if (!selectedRepo) return
    const row = e.currentTarget
    const titleEl = row.querySelector('.inbox-pr-title')
    let titleRect = null
    if (titleEl) {
      titleRect = titleEl.getBoundingClientRect()
    }
    trackEvent('Inbox PR Clicked', {
      repo: `${selectedRepo.owner.login}/${selectedRepo.name}`,
      pr_number: pr.number,
    })
    navigate(`/app/${selectedRepo.id}/${pr.number}`, {
      state: {
        fromInbox: true,
        prTitle: pr.title,
        prNumber: pr.number,
        titleRect: titleRect ? {
          top: titleRect.top,
          left: titleRect.left,
          width: titleRect.width,
          height: titleRect.height,
        } : null,
      },
    })
  }, [selectedRepo, navigate])

  const navigateToChat = useCallback(() => {
    if (!selectedRepo) return
    trackEvent('Inbox Chat Clicked', {
      repo: `${selectedRepo.owner.login}/${selectedRepo.name}`,
    })
    navigate(`/app/${selectedRepo.id}`)
  }, [selectedRepo, navigate])

  if (loading) return null

  const activeFilterLabel = REVIEW_FILTERS.find(f => f.value === reviewFilter)?.label || 'All'

  return (
    <div className="inbox-layout">
      <div className="inbox-container">
        {/* Repo selector */}
        {repoBarProps && (
          <div className="inbox-repo-bar" ref={repoBarProps.omnibarRef}>
            <button className="repo-bar-trigger" onClick={() => repoBarProps.setIsOmnibarOpen(o => !o)}>
              <span className="repo-bar-name">
                {repoBarProps.selectedRepo
                  ? `${repoBarProps.selectedRepo.owner.login}/${repoBarProps.selectedRepo.name}`
                  : 'Select repository'}
              </span>
              <CaretDown size={14} className="repo-bar-caret" />
            </button>

            {repoBarProps.isOmnibarOpen && (
              <div className="repo-bar-dropdown">
                <div className="repo-bar-search-row">
                  <MagnifyingGlass size={14} className="omnibar-input-icon" />
                  <input
                    ref={repoBarProps.inputRef}
                    type="text"
                    className="omnibar-input"
                    placeholder="Search repositories..."
                    value={repoBarProps.repoSearchQuery}
                    onChange={(e) => repoBarProps.setRepoSearchQuery(e.target.value)}
                    onKeyDown={repoBarProps.handleOmnibarKeyDown}
                  />
                </div>
                <div className="repo-bar-results">
                  {repoBarProps.sortedFilteredRepos.map((repo, index) => (
                    <div
                      key={repo.id}
                      ref={el => repoBarProps.itemRefs.current[index] = el}
                      className={`repo-bar-item ${repoBarProps.highlightedIndex === index ? 'highlighted' : ''} ${repoBarProps.selectedRepo?.id === repo.id ? 'active' : ''}`}
                      onClick={() => { repoBarProps.handleRepoSelect(repo); repoBarProps.closeOmnibar() }}
                      onMouseEnter={() => repoBarProps.setHighlightedIndex(index)}
                    >
                      {repo.owner.login}/{repo.name}
                    </div>
                  ))}
                  {repoBarProps.sortedFilteredRepos.length === 0 && (
                    <div className="repo-bar-empty">No repositories found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat prompt — navigates to chat screen */}
        <div className="inbox-chat-area">
          <div className="inbox-chat-box" onClick={navigateToChat} role="button" tabIndex={0}>
            <div className="inbox-chat-input-fake">
              Ask ReviewGPT to spot issues, review and search code
            </div>
            <button className="inbox-chat-send" onClick={(e) => { e.stopPropagation(); navigateToChat() }}>
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* PR section header */}
        <div className="inbox-section-header">
          <div className="inbox-section-left">
            <span className="inbox-section-title">Pull Requests</span>
            <span className="inbox-section-count">{pullsTotalCount || pulls.length} open</span>
          </div>
          <div className="inbox-section-right">
            <div className="inbox-filter-wrapper" ref={filterRef}>
              <button
                className="inbox-filter-btn"
                onClick={() => setFilterOpen(o => !o)}
              >
                {activeFilterLabel}
                <CaretDown size={12} />
              </button>
              {filterOpen && (
                <div className="inbox-filter-dropdown">
                  {REVIEW_FILTERS.map((f) => (
                    <div
                      key={f.value}
                      className={`inbox-filter-item${reviewFilter === f.value ? ' active' : ''}`}
                      onClick={() => {
                        setReviewFilter(f.value)
                        localStorage.setItem('inboxReviewFilter', f.value)
                        setFilterOpen(false)
                      }}
                    >
                      {f.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="inbox-closed-toggle">
              <span>Closed</span>
              <div className={`toggle-track${showClosed ? ' on' : ''}`} onClick={() => setShowClosed(c => !c)}>
                <div className="toggle-thumb" />
              </div>
            </label>
          </div>
        </div>

        {/* Search bar */}
        <div className="inbox-search-bar">
          <MagnifyingGlass size={16} className="inbox-search-icon" />
          <input
            type="text"
            placeholder="Search pull requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="inbox-search-input"
          />
          <div className="inbox-search-nav">
            <button className="inbox-nav-btn" title="First page">
              <CaretLineLeft size={14} />
            </button>
            <button className="inbox-nav-btn" title="Last page">
              <CaretLineRight size={14} />
            </button>
          </div>
        </div>

        {/* PR list */}
        <div className="inbox-list">
          {loadingRepos || loadingPulls ? (
            <div className="inbox-empty">Loading...</div>
          ) : pulls.length === 0 ? (
            <div className="inbox-empty">
              {searchQuery
                ? `No pull requests matching "${searchQuery}"`
                : 'No open pull requests'}
            </div>
          ) : (
            pulls.map((pr) => (
              <div
                key={pr.id}
                className="inbox-pr-row"
                onClick={(e) => handlePRClick(pr, e)}
              >
                {pr.user?.avatar_url && (
                  <img
                    src={pr.user.avatar_url}
                    alt={pr.user.login}
                    className="inbox-pr-avatar"
                  />
                )}
                <span className="inbox-pr-title">{pr.title}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <OnboardingModal />
    </div>
  )
}
