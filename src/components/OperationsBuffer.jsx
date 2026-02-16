import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretRight, ChatCircle, Tag, X, ArrowSquareOut, XCircle, ArrowCounterClockwise } from '@phosphor-icons/react'
import { useRepos } from '../hooks/useRepos'
import { useOperationsStore } from '../stores/operationsStore'

/**
 * Resolves an "owner/name" repo string to the numeric repo id
 * from the cached repos list, or null if not found.
 */
function useRepoIdLookup() {
  const { data: repos = [] } = useRepos()
  return (repoFullName) => {
    const match = repos.find(
      (r) => `${r.owner.login}/${r.name}` === repoFullName
    )
    return match ? match.id.toString() : null
  }
}

/**
 * OperationsBuffer Component
 *
 * Displays planned GitHub operations inline in the chatbox as a
 * collapsible card with a count and Review button.
 * Each row is clickable and navigates to the issue page.
 */
export function OperationsBuffer({ operations, onReview }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [applyingAll, setApplyingAll] = useState(false)
  const navigate = useNavigate()
  const resolveRepoId = useRepoIdLookup()
  const removeOperation = useOperationsStore((s) => s.removeOperation)
  const executeAll = useOperationsStore((s) => s.executeAll)

  const handleApplyAll = useCallback(async (e) => {
    e.stopPropagation()
    setApplyingAll(true)
    try {
      await executeAll()
    } finally {
      setApplyingAll(false)
    }
  }, [executeAll])

  if (operations.length === 0) return null

  const count = operations.length

  const handleRowClick = (op) => {
    const repoId = resolveRepoId(op.repo)
    if (!repoId) return
    navigate(`/app/${repoId}/issues/${op.issueNumber}`)
  }

  return (
    <div className="planned-updates-card">
      <div className="planned-updates-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="planned-updates-header-left">
          <CaretRight
            size={14}
            weight="bold"
            className={`planned-updates-chevron ${isExpanded ? 'expanded' : ''}`}
          />
          <span className="planned-updates-count">
            {count} {count === 1 ? 'Update' : 'Updates'}
          </span>
        </div>
        <div className="planned-updates-header-right">
          <button
            type="button"
            className="planned-updates-apply-all-btn"
            disabled={applyingAll}
            onClick={handleApplyAll}
          >
            {applyingAll ? 'Applying...' : 'Apply all'}
          </button>
          <button
            type="button"
            className="planned-updates-review-btn"
            onClick={(e) => { e.stopPropagation(); onReview?.() }}
          >
            Review
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="planned-updates-list">
          <AnimatedOperationList
            operations={operations}
            onRowClick={handleRowClick}
            onDismiss={removeOperation}
          />
        </div>
      )}
    </div>
  )
}

/**
 * UpdatesReviewView Component
 *
 * Full-sidebar view showing the list of planned updates with an X close button.
 * Each row is clickable and navigates to the issue page.
 */
export function UpdatesReviewView({ operations, onClose }) {
  const navigate = useNavigate()
  const resolveRepoId = useRepoIdLookup()
  const removeOperation = useOperationsStore((s) => s.removeOperation)

  const handleRowClick = (op) => {
    const repoId = resolveRepoId(op.repo)
    if (!repoId) return
    navigate(`/app/${repoId}/issues/${op.issueNumber}`)
  }

  return (
    <div className="updates-review-view">
      <div className="updates-review-header">
        <span className="updates-review-title">
          Planned Updates ({operations.length})
        </span>
        <button className="updates-review-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="updates-review-list">
        <AnimatedOperationList
          operations={operations}
          onRowClick={handleRowClick}
          onDismiss={removeOperation}
        />
        {operations.length === 0 && (
          <div className="updates-review-empty">No planned updates</div>
        )}
      </div>
    </div>
  )
}

/**
 * AnimatedOperationList
 *
 * Tracks which operation IDs are present so that removed items can
 * play a slide-out / fade-out animation before being unmounted.
 */
function AnimatedOperationList({ operations, onRowClick, onDismiss }) {
  const [displayOps, setDisplayOps] = useState(operations)
  const [exitingIds, setExitingIds] = useState(new Set())
  const prevIdsRef = useRef(new Set(operations.map((o) => o.id)))

  useEffect(() => {
    const currentIds = new Set(operations.map((o) => o.id))
    const removed = [...prevIdsRef.current].filter((id) => !currentIds.has(id))

    if (removed.length > 0) {
      setExitingIds((prev) => new Set([...prev, ...removed]))

      // Keep removed items in displayOps during the animation
      const timer = setTimeout(() => {
        setExitingIds((prev) => {
          const next = new Set(prev)
          removed.forEach((id) => next.delete(id))
          return next
        })
        setDisplayOps(operations)
      }, 350)

      prevIdsRef.current = currentIds
      return () => clearTimeout(timer)
    }

    setDisplayOps(operations)
    prevIdsRef.current = currentIds
  }, [operations])

  // Merge: keep exiting items in the rendered list
  const merged = exitingIds.size > 0
    ? [
        ...displayOps.filter((o) => !exitingIds.has(o.id)),
        // keep the stale copies around for the animation
        ...displayOps.filter((o) => exitingIds.has(o.id)),
      ]
    : displayOps

  return merged.map((op) => (
    <OperationRow
      key={op.id}
      operation={op}
      exiting={exitingIds.has(op.id)}
      onClick={() => onRowClick(op)}
      onDismiss={onDismiss ? () => onDismiss(op.id) : undefined}
    />
  ))
}

/**
 * OperationRow Component
 *
 * Displays a single operation row. Clickable (navigates to the issue page).
 */
function OperationRow({ operation, exiting, onClick, onDismiss }) {
  const getIcon = () => {
    switch (operation.type) {
      case 'comment':
        return <ChatCircle size={14} />
      case 'set_labels':
      case 'add_labels':
        return <Tag size={14} />
      case 'close_issue':
        return <XCircle size={14} />
      case 'reopen_issue':
        return <ArrowCounterClockwise size={14} />
      default:
        return null
    }
  }

  const getTitle = () => {
    switch (operation.type) {
      case 'comment':
        return `Comment on ${operation.repo}#${operation.issueNumber}`
      case 'set_labels':
        return `Set labels on ${operation.repo}#${operation.issueNumber}`
      case 'add_labels':
        return `Add labels to ${operation.repo}#${operation.issueNumber}`
      case 'close_issue': {
        const reason = operation.stateReason === 'duplicate' ? ' as duplicate'
          : operation.stateReason === 'not_planned' ? ' as not planned'
          : ''
        return `Close${reason} ${operation.repo}#${operation.issueNumber}`
      }
      case 'reopen_issue':
        return `Reopen ${operation.repo}#${operation.issueNumber}`
      default:
        return `Operation on ${operation.repo}#${operation.issueNumber}`
    }
  }

  const getDetail = () => {
    if (operation.type === 'comment') return operation.body
    if (operation.type === 'close_issue' || operation.type === 'reopen_issue') {
      const reasonLabel = operation.stateReason === 'duplicate' ? ' as duplicate'
        : operation.stateReason === 'not_planned' ? ' as not planned'
        : ''
      return operation.body || (operation.type === 'close_issue' ? `Close${reasonLabel} without comment` : 'Reopen without comment')
    }
    if (operation.type === 'set_labels' || operation.type === 'add_labels') {
      return operation.labels?.join(', ') || 'No labels'
    }
    return ''
  }

  return (
    <div
      className={`planned-updates-row clickable ${exiting ? 'exiting' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
    >
      <span className="planned-updates-row-icon">{getIcon()}</span>
      <div className="planned-updates-row-text">
        <span className="planned-updates-row-title">{getTitle()}</span>
        {getDetail() && (
          <span className="planned-updates-row-detail">{getDetail()}</span>
        )}
      </div>
      <ArrowSquareOut size={14} className="planned-updates-row-nav" />
      {onDismiss && (
        <button
          type="button"
          className="planned-updates-row-dismiss"
          title="Dismiss"
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
