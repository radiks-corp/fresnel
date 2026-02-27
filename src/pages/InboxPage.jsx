import { useState, useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { trackEvent } from '../hooks/useAnalytics'
import { useRepos } from '../hooks/useRepos'
import { useInboxPulls } from '../hooks/useInboxItems'
import { MagnifyingGlass, CaretDown, ArrowUp, Check, X, CaretLeft, CaretRight, CaretLineLeft, CaretLineRight } from '@phosphor-icons/react'
import { jelly } from 'ldrs'
import OnboardingModal from '../components/OnboardingModal'
import './InboxPage.css'

jelly.register()

const REVIEW_FILTERS = [
  { label: 'Awaiting review from you', value: 'awaiting_review_from_you' },
  { label: 'No reviews', value: 'no_reviews' },
  { label: 'Review required', value: 'review_required' },
  { label: 'Approved review', value: 'approved' },
  { label: 'Changes requested', value: 'changes_requested' },
  { label: 'Reviewed by you', value: 'reviewed_by_you' },
  { label: 'Not reviewed by you', value: 'not_reviewed_by_you' },
  { label: 'Awaiting review from you or your team', value: 'awaiting_review_from_you_or_team' },
]

export default function InboxPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [reviewFilter, setReviewFilter] = useState(() => {
    return localStorage.getItem('inboxReviewFilter') ?? 'awaiting_review_from_you'
  })
  const [selectedRepoId, setSelectedRepoId] = useState(() => {
    return localStorage.getItem('inboxSelectedRepo') || null
  })
  const [orgOpen, setOrgOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [transitioningPRId, setTransitioningPRId] = useState(null)
  const [promptText, setPromptText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const orgRef = useRef(null)
  const filterRef = useRef(null)
  const promptRef = useRef(null)

  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { data: repos = [], isLoading: loadingRepos } = useRepos()

  const selectedRepo = useMemo(() => {
    if (selectedRepoId) {
      return repos.find(r => r.id.toString() === selectedRepoId) || repos[0] || null
    }
    return repos[0] || null
  }, [repos, selectedRepoId])

  useEffect(() => {
    if (repos.length > 0 && !selectedRepoId) {
      setSelectedRepoId(repos[0].id.toString())
    }
  }, [repos, selectedRepoId])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => { setCurrentPage(1) }, [debouncedQuery, reviewFilter, showClosed, selectedRepoId])

  const activeRepos = selectedRepo ? [selectedRepo] : []
  const {
    data: pullsData,
    isLoading: loadingPulls,
    isFetching: fetchingPulls,
    fetchNextPage,
    isFetchingNextPage,
  } = useInboxPulls(activeRepos, user?.login, debouncedQuery, reviewFilter, showClosed ? 'closed' : 'open')
  const allPulls = pullsData?.pulls ?? []
  const pullsTotalCount = pullsData?.totalCount ?? 0
  const pullsHasMore = pullsData?.hasMore ?? false

  const totalPages = Math.max(1, Math.ceil(pullsTotalCount / pageSize))
  const startIdx = (currentPage - 1) * pageSize
  const pulls = allPulls.slice(startIdx, startIdx + pageSize)

  useEffect(() => {
    if (startIdx + pageSize > allPulls.length && pullsHasMore && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [currentPage, allPulls.length, pullsHasMore, isFetchingNextPage, fetchNextPage, startIdx])

  const handlePromptSubmit = () => {
    if (!promptText.trim() || !selectedRepo) return
    const encoded = encodeURIComponent(promptText.trim())
    navigate(`/app/${selectedRepo.id}/chat?q=${encoded}`)
  }

  const handlePRClick = (pr) => {
    if (!selectedRepo) return
    trackEvent('Inbox PR Clicked', {
      repo: `${selectedRepo.owner.login}/${selectedRepo.name}`,
      pr_number: pr.number,
    })
    const doNavigate = () => {
      navigate(`/app/${selectedRepo.id}/${pr.number}`, {
        state: { prTitle: pr.title, prNumber: pr.number },
      })
    }
    if (typeof document.startViewTransition === 'function') {
      // flushSync forces a synchronous DOM update so the view-transition-name
      // is present on the element when the browser takes its "old" snapshot
      flushSync(() => setTransitioningPRId(pr.id))
      document.startViewTransition(() => {
        flushSync(() => doNavigate())
      })
    } else {
      doNavigate()
    }
  }

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (orgRef.current && !orgRef.current.contains(e.target)) setOrgOpen(false)
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  if (loading) return null

  const orgName = selectedRepo?.owner?.login || 'Select repository'
  const activeFilterLabel = REVIEW_FILTERS.find(f => f.value === reviewFilter)?.label || 'Filter'

  return (
    <div className="home-page">
      <div className="home-content">
        {/* Org / repo selector */}
        <div className="home-org-selector" ref={orgRef}>
          <button className="home-org-trigger" onClick={() => setOrgOpen(o => !o)}>
            {selectedRepo?.owner?.avatar_url && (
              <img src={selectedRepo.owner.avatar_url} alt="" className="home-org-avatar" />
            )}
            <span className="home-org-name">{orgName}</span>
            <CaretDown size={14} className="home-org-caret" />
          </button>

          {orgOpen && (
            <div className="home-org-dropdown">
              {repos.map(repo => (
                <div
                  key={repo.id}
                  className={`home-org-item${selectedRepo?.id === repo.id ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedRepoId(repo.id.toString())
                    localStorage.setItem('inboxSelectedRepo', repo.id.toString())
                    setOrgOpen(false)
                    trackEvent('Repo Selected', { repo: `${repo.owner.login}/${repo.name}` })
                  }}
                >
                  <img src={repo.owner.avatar_url} alt="" className="home-org-item-avatar" />
                  <span>{repo.owner.login}/{repo.name}</span>
                  {selectedRepo?.id === repo.id && <Check size={14} weight="bold" className="home-org-item-check" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI prompt area */}
        <div className="home-prompt-box" onClick={() => promptRef.current?.focus()}>
          <textarea
            ref={promptRef}
            className="home-prompt-input"
            placeholder="Ask ReviewGPT to spot issues, review and search code"
            rows={3}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handlePromptSubmit()
              }
            }}
          />
          <button className="home-prompt-submit" aria-label="Submit prompt" onClick={handlePromptSubmit}>
            <ArrowUp size={18} weight="bold" />
          </button>
        </div>

        {/* Pull Requests section */}
        <div className="home-pr-section">
          <div className="home-pr-header">
            <div className="home-pr-header-left">
              <span className="home-pr-title">Pull Requests</span>
              <span className="home-pr-count">{pullsTotalCount || pulls.length} open</span>
              {(loadingRepos || fetchingPulls) && (
                <l-jelly size="18" speed="0.9" color="#9c9b99" />
              )}
            </div>
            <div className="home-pr-header-right">
              <div className="home-filter-dropdown" ref={filterRef}>
                <button className="home-filter-trigger" onClick={() => setFilterOpen(o => !o)}>
                  <span>{activeFilterLabel}</span>
                  <CaretDown size={12} />
                </button>
                {filterOpen && (
                  <div className="home-filter-panel">
                    {reviewFilter && (
                      <div
                        className="home-filter-item clear"
                        onClick={() => {
                          setReviewFilter(null)
                          localStorage.removeItem('inboxReviewFilter')
                          setFilterOpen(false)
                        }}
                      >
                        No filter
                      </div>
                    )}
                    {REVIEW_FILTERS.map(f => (
                      <div
                        key={f.value}
                        className={`home-filter-item${reviewFilter === f.value ? ' active' : ''}`}
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
              <button
                className={`home-closed-toggle${showClosed ? ' active' : ''}`}
                onClick={() => setShowClosed(v => !v)}
              >
                <span className="home-toggle-track">
                  <span className="home-toggle-thumb" />
                </span>
                Closed
              </button>
            </div>
          </div>

          <div className="home-pr-list">
            <div className="home-pr-search">
              <MagnifyingGlass size={16} className="home-pr-search-icon" />
              <input
                type="text"
                placeholder="Search pull requests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="home-pr-search-input"
              />
              <kbd className="home-pr-search-shortcut">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl '}K</kbd>
            </div>
            {!loadingRepos && !loadingPulls && pulls.length === 0 ? (
              <div className="home-pr-empty">
                {searchQuery
                  ? `No pull requests matching "${searchQuery}"`
                  : 'No open pull requests'}
              </div>
            ) : (
              <>
                {pulls.map((pr) => (
                  <div
                    key={pr.id}
                    className="home-pr-row"
                    onClick={() => handlePRClick(pr)}
                  >
                    <img
                      src={pr.user?.avatar_url}
                      alt={pr.user?.login}
                      className="home-pr-avatar"
                    />
                    <span
                      className="home-pr-name"
                      style={{ viewTransitionName: transitioningPRId === pr.id ? 'pr-title' : 'none' }}
                    >
                      {pr.title}
                    </span>
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="home-pagination">
                    <button
                      className="home-pagination-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(1)}
                      aria-label="First page"
                    >
                      <CaretLineLeft size={16} />
                    </button>
                    <button
                      className="home-pagination-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                      aria-label="Previous page"
                    >
                      <CaretLeft size={16} />
                    </button>
                    <span className="home-pagination-info">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      className="home-pagination-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                      aria-label="Next page"
                    >
                      <CaretRight size={16} />
                    </button>
                    <button
                      className="home-pagination-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      aria-label="Last page"
                    >
                      <CaretLineRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <OnboardingModal />
    </div>
  )
}
