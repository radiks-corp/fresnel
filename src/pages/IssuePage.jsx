import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkEmoji from 'remark-emoji'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { ArrowLeft, X, Robot, Tag } from '@phosphor-icons/react'
import { useSidebarContext } from '../contexts/SidebarContext'
import { useAuth } from '../hooks/useAuth.jsx'
import { apiFetch } from '../hooks/useGitHubAPI'
import { useIssueDetails } from '../hooks/useIssueDetails'
import { useIssueTimeline } from '../hooks/useIssueTimeline'
import { useOperationsStore } from '../stores/operationsStore'
import OpenExternalButton from '../components/OpenExternalButton'
import './IssuePage.css'

function formatTimeAgo(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays < 30) return `${diffDays} days ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function labelColor(color) {
  if (!color) return {}
  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return {
    backgroundColor: `#${color}20`,
    color: `#${color}`,
    borderColor: `#${color}40`,
    ...(luminance > 0.7 ? { color: `#${color}`.replace(/^#/, '#') } : {}),
  }
}

function IssueStateBadge({ state }) {
  if (state === 'open') {
    return (
      <span className="issue-state-badge open">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
        </svg>
        Open
      </span>
    )
  }

  if (state === 'closed') {
    return (
      <span className="issue-state-badge closed">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
          <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
        </svg>
        Closed
      </span>
    )
  }

  return null
}

function TimelineEvent({ event }) {
  const { type } = event

  if (type === 'labeled' || type === 'unlabeled') {
    return (
      <div className="issue-timeline-event">
        <div className="issue-timeline-event-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
          </svg>
        </div>
        <div className="issue-timeline-event-content">
          <img src={event.actor?.avatar_url} alt="" className="issue-timeline-event-avatar" />
          <span className="issue-timeline-event-author">{event.actor?.login}</span>
          <span className="issue-timeline-event-text">
            {type === 'labeled' ? 'added' : 'removed'} the{' '}
            <span
              className="issue-timeline-event-label"
              style={event.label ? labelColor(event.label.color) : {}}
            >
              {event.label?.name}
            </span>
            {' '}label
          </span>
          <span className="issue-timeline-event-time">{formatTimeAgo(event.created_at)}</span>
        </div>
      </div>
    )
  }

  if (type === 'assigned' || type === 'unassigned') {
    return (
      <div className="issue-timeline-event">
        <div className="issue-timeline-event-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M10.5 5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm.061 3.073a4 4 0 1 0-5.123 0 6.004 6.004 0 0 0-3.431 5.142.75.75 0 0 0 1.498.07 4.5 4.5 0 0 1 8.99 0 .75.75 0 1 0 1.498-.07 6.005 6.005 0 0 0-3.432-5.142Z" />
          </svg>
        </div>
        <div className="issue-timeline-event-content">
          <img src={event.actor?.avatar_url} alt="" className="issue-timeline-event-avatar" />
          <span className="issue-timeline-event-author">{event.actor?.login}</span>
          <span className="issue-timeline-event-text">
            {type === 'assigned' ? 'assigned' : 'unassigned'}{' '}
            <strong>{event.assignee?.login}</strong>
          </span>
          <span className="issue-timeline-event-time">{formatTimeAgo(event.created_at)}</span>
        </div>
      </div>
    )
  }

  if (type === 'closed' || type === 'reopened') {
    return (
      <div className="issue-timeline-event">
        <div className={`issue-timeline-event-icon ${type}`}>
          {type === 'closed' ? (
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
            </svg>
          )}
        </div>
        <div className="issue-timeline-event-content">
          <img src={event.actor?.avatar_url} alt="" className="issue-timeline-event-avatar" />
          <span className="issue-timeline-event-author">{event.actor?.login}</span>
          <span className="issue-timeline-event-text">
            {type === 'closed' ? 'closed this' : 'reopened this'}
          </span>
          <span className="issue-timeline-event-time">{formatTimeAgo(event.created_at)}</span>
        </div>
      </div>
    )
  }

  if (type === 'renamed') {
    return (
      <div className="issue-timeline-event">
        <div className="issue-timeline-event-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M3.75 0h8.5C13.216 0 14 .784 14 1.75v12.5A1.75 1.75 0 0 1 12.25 16h-8.5A1.75 1.75 0 0 1 2 14.25V1.75C2 .784 2.784 0 3.75 0ZM3.5 1.75v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Z" />
          </svg>
        </div>
        <div className="issue-timeline-event-content">
          <img src={event.actor?.avatar_url} alt="" className="issue-timeline-event-avatar" />
          <span className="issue-timeline-event-author">{event.actor?.login}</span>
          <span className="issue-timeline-event-text">
            changed the title <del>{event.rename?.from}</del> <strong>{event.rename?.to}</strong>
          </span>
          <span className="issue-timeline-event-time">{formatTimeAgo(event.created_at)}</span>
        </div>
      </div>
    )
  }

  if (type === 'milestoned' || type === 'demilestoned') {
    return (
      <div className="issue-timeline-event">
        <div className="issue-timeline-event-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M7.75 0a.75.75 0 0 1 .75.75V3h3.634c.414 0 .814.147 1.13.414l2.07 1.75a1.75 1.75 0 0 1 0 2.672l-2.07 1.75a1.75 1.75 0 0 1-1.13.414H8.5v5.25a.75.75 0 0 1-1.5 0V10H2.75A1.75 1.75 0 0 1 1 8.25v-3.5C1 3.784 1.784 3 2.75 3H7V.75A.75.75 0 0 1 7.75 0Zm4.384 8.5a.25.25 0 0 0 .161-.059l2.07-1.75a.25.25 0 0 0 0-.382l-2.07-1.75a.25.25 0 0 0-.161-.059H2.75a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25Z" />
          </svg>
        </div>
        <div className="issue-timeline-event-content">
          <img src={event.actor?.avatar_url} alt="" className="issue-timeline-event-avatar" />
          <span className="issue-timeline-event-author">{event.actor?.login}</span>
          <span className="issue-timeline-event-text">
            {type === 'milestoned' ? 'added this to the' : 'removed this from the'}{' '}
            <strong>{event.milestone?.title}</strong> milestone
          </span>
          <span className="issue-timeline-event-time">{formatTimeAgo(event.created_at)}</span>
        </div>
      </div>
    )
  }

  if (type === 'referenced' || type === 'cross-referenced') {
    return (
      <div className="issue-timeline-event">
        <div className="issue-timeline-event-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M4.53 4.75A.75.75 0 0 1 5.28 4h6.01a.75.75 0 0 1 .75.75v6.01a.75.75 0 0 1-1.5 0v-4.2l-5.26 5.261a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L9.48 5.5H5.28a.75.75 0 0 1-.75-.75Z" />
          </svg>
        </div>
        <div className="issue-timeline-event-content">
          <img src={event.actor?.avatar_url} alt="" className="issue-timeline-event-avatar" />
          <span className="issue-timeline-event-author">{event.actor?.login}</span>
          <span className="issue-timeline-event-text">referenced this</span>
          <span className="issue-timeline-event-time">{formatTimeAgo(event.created_at)}</span>
        </div>
      </div>
    )
  }

  return null
}

function IssueComment({ comment }) {
  return (
    <div className="issue-comment">
      <img src={comment.user?.avatar_url} alt="" className="issue-comment-aside-avatar" />
      <div className="issue-comment-card">
        <div className="issue-comment-header">
          <span className="issue-comment-author">{comment.user?.login}</span>
          <span className="issue-comment-time">commented {formatTimeAgo(comment.created_at)}</span>
          {comment.author_association && comment.author_association !== 'NONE' && (
            <span className="issue-author-badge">{comment.author_association.toLowerCase()}</span>
          )}
        </div>
        <div className="issue-comment-body markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{comment.body || ''}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({ children, title, onClick }) {
  return (
    <button
      type="button"
      className="ibox-toolbar-btn"
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function IssueCommentBox({ owner, repo, issueNumber, issueState, userAvatar }) {
  const [body, setBody] = useState('')
  const [activeTab, setActiveTab] = useState('write')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef(null)
  const queryClient = useQueryClient()
  const prefillAppliedRef = useRef(false)

  // ── Planned operations from the Zustand store ──
  const repoFullName = owner && repo ? `${owner}/${repo}` : ''
  const allOps = useOperationsStore((s) => s.operations)
  const removeOperation = useOperationsStore((s) => s.removeOperation)

  const pendingOps = useMemo(
    () =>
      allOps.filter(
        (op) =>
          op.status === 'pending' &&
          op.repo === repoFullName &&
          op.issueNumber === Number(issueNumber)
      ),
    [allOps, repoFullName, issueNumber]
  )

  const commentOps = useMemo(() => pendingOps.filter((op) => op.type === 'comment'), [pendingOps])
  const labelOps = useMemo(
    () => pendingOps.filter((op) => op.type === 'set_labels' || op.type === 'add_labels'),
    [pendingOps]
  )
  const stateOps = useMemo(
    () => pendingOps.filter((op) => op.type === 'close_issue' || op.type === 'reopen_issue'),
    [pendingOps]
  )

  // Collect all bodies from comment ops AND close/reopen ops (which can carry a comment)
  const prefillBodies = useMemo(() => {
    const bodies = []
    for (const op of commentOps) {
      if (op.body?.trim()) bodies.push(op.body)
    }
    for (const op of stateOps) {
      if (op.body?.trim()) bodies.push(op.body)
    }
    return bodies
  }, [commentOps, stateOps])

  // Prefill the textarea once when planned operations with text arrive
  useEffect(() => {
    if (prefillBodies.length > 0 && !prefillAppliedRef.current && !body.trim()) {
      setBody(prefillBodies.join('\n\n'))
      prefillAppliedRef.current = true
    }
    if (prefillBodies.length === 0) {
      prefillAppliedRef.current = false
    }
  }, [prefillBodies, body])

  const isOpen = issueState === 'open'
  const hasBody = body.trim().length > 0
  const hasPendingActions = pendingOps.length > 0

  // If the AI planned a close or reopen, reflect that in the button state
  const aiWantsClose = stateOps.some((op) => op.type === 'close_issue')
  const aiWantsReopen = stateOps.some((op) => op.type === 'reopen_issue')

  const insertMarkdown = useCallback((prefix, suffix = '', placeholder = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = body.slice(start, end) || placeholder
    const before = body.slice(0, start)
    const after = body.slice(end)
    const inserted = `${prefix}${selected}${suffix}`
    setBody(before + inserted + after)
    requestAnimationFrame(() => {
      ta.focus()
      const cursorPos = start + prefix.length + selected.length
      ta.setSelectionRange(cursorPos, cursorPos)
    })
  }, [body])

  // Clear all buffered operations for this issue after a successful action
  const flushPendingOps = useCallback(() => {
    for (const op of pendingOps) {
      removeOperation(op.id)
    }
    setBody('')
    setActiveTab('write')
    prefillAppliedRef.current = false
  }, [pendingOps, removeOperation])

  const dismissOps = useCallback(() => {
    for (const op of pendingOps) {
      removeOperation(op.id)
    }
    setBody('')
    setActiveTab('write')
    prefillAppliedRef.current = false
  }, [pendingOps, removeOperation])

  const handleComment = async () => {
    if (!hasBody || submitting) return
    setSubmitting(true)
    try {
      await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      })
      setBody('')
      setActiveTab('write')
      flushPendingOps()
      queryClient.invalidateQueries({ queryKey: ['issueTimeline', owner, repo, issueNumber] })
      queryClient.invalidateQueries({ queryKey: ['issueDetails', owner, repo, issueNumber] })
    } catch (err) {
      console.error('Failed to post comment:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleStateChange = async (newState) => {
    setSubmitting(true)
    try {
      if (hasBody) {
        await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: body.trim() }),
        })
        setBody('')
        setActiveTab('write')
      }
      // If the AI planned a close with a specific reason (e.g. duplicate), use it
      const patchBody = { state: newState }
      if (newState === 'closed') {
        const closeOp = stateOps.find((op) => op.type === 'close_issue' && op.stateReason)
        if (closeOp) patchBody.state_reason = closeOp.stateReason
      }
      await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      flushPendingOps()
      queryClient.invalidateQueries({ queryKey: ['issueTimeline', owner, repo, issueNumber] })
      queryClient.invalidateQueries({ queryKey: ['issueDetails', owner, repo, issueNumber] })
    } catch (err) {
      console.error('Failed to update issue:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ibox">
      <img src={userAvatar} alt="" className="ibox-avatar" />
      <div className="ibox-card">
        {/* AI-suggested banner */}
        {hasPendingActions && (
          <div className="ibox-ai-banner">
            <div className="ibox-ai-banner-left">
              <Robot size={16} weight="duotone" />
              <span>
                AI suggested{' '}
                {(() => {
                  const parts = []
                  if (commentOps.length > 0) parts.push('a comment')
                  if (aiWantsClose) parts.push('closing this issue')
                  if (aiWantsReopen) parts.push('reopening this issue')
                  if (labelOps.length > 0) parts.push(`label ${labelOps.length === 1 ? 'change' : 'changes'}`)
                  return parts.join(' and ')
                })()}
              </span>
            </div>
            <button
              type="button"
              className="ibox-ai-banner-dismiss"
              onClick={dismissOps}
              title="Dismiss AI suggestions"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="ibox-tabs">
          <button
            type="button"
            className={`ibox-tab ${activeTab === 'write' ? 'active' : ''}`}
            onClick={() => setActiveTab('write')}
          >
            Write
          </button>
          <button
            type="button"
            className={`ibox-tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
        </div>

        {activeTab === 'write' ? (
          <>
            {/* Toolbar */}
            <div className="ibox-toolbar">
              <ToolbarButton title="Add heading" onClick={() => insertMarkdown('### ', '', 'Heading')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 2a.75.75 0 0 1 .75.75V7h7V2.75a.75.75 0 0 1 1.5 0v10.5a.75.75 0 0 1-1.5 0V8.5h-7v4.75a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 3.75 2Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Bold" onClick={() => insertMarkdown('**', '**', 'bold text')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h4.5a3.501 3.501 0 0 1 2.852 5.53A3.499 3.499 0 0 1 9.5 14H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm1 7v3h4.5a1.5 1.5 0 0 0 0-3Zm3.5-2a1.5 1.5 0 0 0 0-3H5v3Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Italic" onClick={() => insertMarkdown('_', '_', 'italic text')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2.75A.75.75 0 0 1 6.75 2h6.5a.75.75 0 0 1 0 1.5h-2.505l-3.858 9H9.25a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.505l3.858-9H6.75A.75.75 0 0 1 6 2.75Z"/></svg>
              </ToolbarButton>

              <div className="ibox-toolbar-sep" />

              <ToolbarButton title="Quote" onClick={() => insertMarkdown('> ', '', 'quote')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 2.5h10.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Zm4 5h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5Zm-4 5h10.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5ZM1.75 7h.01a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1 0-1.5Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Code" onClick={() => insertMarkdown('`', '`', 'code')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Link" onClick={() => insertMarkdown('[', '](url)', 'link text')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/></svg>
              </ToolbarButton>

              <div className="ibox-toolbar-sep" />

              <ToolbarButton title="Bulleted list" onClick={() => insertMarkdown('- ', '', 'item')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Numbered list" onClick={() => insertMarkdown('1. ', '', 'item')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 3.25Zm0 5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 8.25Zm0 5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75ZM.924 10.32l.856-.67a.25.25 0 0 0-.075-.438l-.108-.027a.25.25 0 0 1 .108-.49h.22c.191 0 .354.124.41.305l.068.22a.25.25 0 0 1-.069.255l-.815.638a.25.25 0 0 0-.096.206v.1h1.3a.25.25 0 0 1 0 .5H.75a.75.75 0 0 1-.75-.75v-.01a.75.75 0 0 1 .289-.593ZM1 2.75a.25.25 0 0 1 .25-.25h.268a.25.25 0 0 1 .25.25v2h.5a.25.25 0 0 1 0 .5H.75a.25.25 0 0 1 0-.5h.5v-1.5H1.25A.25.25 0 0 1 1 2.75Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Task list" onClick={() => insertMarkdown('- [ ] ', '', 'task')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 1.75v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H2.75a.25.25 0 0 0-.25.25Zm-1.5 0C1 .784 1.784 0 2.75 0h10.5C14.216 0 15 .784 15 1.75v12.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25ZM7.25 8a.75.75 0 0 1 .75-.75h3.25a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3.25a.75.75 0 0 0 0-1.5ZM7.25 4a.75.75 0 0 1 .75-.75h3.25a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 7.25 4ZM4.56 6.22a.749.749 0 0 1 0 1.06l-1 1a.749.749 0 0 1-1.06 0l-.5-.5a.749.749 0 1 1 1.06-1.06l-.97.97.47-.47a.749.749 0 0 1 1.06 0Z"/></svg>
              </ToolbarButton>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              className={`ibox-textarea ${hasPendingActions ? 'ai-prefilled' : ''}`}
              placeholder="Add a comment..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  handleComment()
                }
              }}
            />
          </>
        ) : (
          <div className="ibox-preview markdown-body">
            {hasBody ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{body}</ReactMarkdown>
            ) : (
              <span className="ibox-preview-empty">Nothing to preview</span>
            )}
          </div>
        )}

        {/* Pending label operations */}
        {labelOps.length > 0 && (
          <div className="ibox-label-ops">
            <Tag size={14} className="ibox-label-ops-icon" />
            <span className="ibox-label-ops-text">
              {labelOps.map((op) => (
                <span key={op.id}>
                  {op.type === 'set_labels' ? 'Set' : 'Add'} labels:{' '}
                  {op.labels?.map((l) => (
                    <span key={l} className="ibox-label-chip">{l}</span>
                  ))}
                </span>
              ))}
            </span>
            <button
              type="button"
              className="ibox-label-ops-dismiss"
              onClick={() => labelOps.forEach((op) => removeOperation(op.id))}
              title="Dismiss label changes"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="ibox-footer">
          <div className="ibox-footer-left">
            <span className="ibox-hint">Markdown is supported</span>
          </div>
          <div className="ibox-footer-right">
            {/* Close/Reopen button */}
            <div className="ibox-state-group">
              <button
                type="button"
                className={`ibox-state-btn ${isOpen ? 'close' : 'reopen'} ${aiWantsClose || aiWantsReopen ? 'ai-suggested' : ''}`}
                disabled={submitting}
                onClick={() => handleStateChange(isOpen ? 'closed' : 'open')}
              >
                {isOpen ? (
                  <>
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                      <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
                      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
                    </svg>
                    {hasBody ? 'Close with comment' : 'Close issue'}
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
                    </svg>
                    {hasBody ? 'Reopen with comment' : 'Reopen issue'}
                  </>
                )}
              </button>
            </div>

            {/* Comment button */}
            <button
              type="button"
              className="ibox-comment-btn"
              disabled={!hasBody || submitting}
              onClick={handleComment}
            >
              {submitting ? 'Submitting...' : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function IssuePage() {
  const { issueNumber } = useParams()
  const navigate = useNavigate()
  const { selectedRepo } = useSidebarContext()
  const { user } = useAuth()
  const owner = selectedRepo?.owner?.login
  const repoName = selectedRepo?.name

  const { data: issue, isLoading: loadingIssue } = useIssueDetails(owner, repoName, issueNumber)
  const { data: timeline = [], isLoading: loadingTimeline } = useIssueTimeline(owner, repoName, issueNumber)

  const comments = useMemo(() => timeline.filter(t => t.type === 'comment'), [timeline])

  const sortedTimeline = useMemo(() => {
    return timeline.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [timeline])


  if (!selectedRepo) {
    return (
      <div className="issue-page">
        <div className="issue-page-empty">Select a repository to view issues</div>
      </div>
    )
  }

  if (loadingIssue) {
    return (
      <div className="issue-page">
        <div className="issue-page-loading">Loading issue...</div>
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="issue-page">
        <div className="issue-page-empty">Issue not found</div>
      </div>
    )
  }

  return (
    <div className="issue-page">
      <div className="issue-page-inner">
        {/* Back button — spans full width */}
        <button className="issue-back-btn" onClick={() => navigate('/app')}>
          <ArrowLeft size={16} />
          Back to inbox
        </button>

        {/* Header — spans full width */}
        <div className="issue-header">
          <h1 className="issue-title">
            {issue.title}
            <span className="issue-number"> #{issue.number}</span>
          </h1>
          <div className="issue-header-meta">
            <IssueStateBadge state={issue.state} />
            <OpenExternalButton
              type="issue"
              owner={owner}
              repo={repoName}
              number={issueNumber}
            />
          </div>
        </div>

        {/* Main content */}
        <div className="issue-main">
          {/* Issue description */}
          {issue.body && (
            <div className="issue-comment">
              <img src={issue.user?.avatar_url} alt="" className="issue-comment-aside-avatar" />
              <div className="issue-comment-card issue-description-card">
                <div className="issue-comment-header">
                  <span className="issue-comment-author">{issue.user?.login}</span>
                  <span className="issue-comment-time">commented {formatTimeAgo(issue.created_at)}</span>
                  {issue.author_association && issue.author_association !== 'NONE' && (
                    <span className="issue-author-badge">{issue.author_association.toLowerCase()}</span>
                  )}
                </div>
                <div className="issue-comment-body markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{issue.body}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="issue-timeline">
            {loadingTimeline ? (
              <div className="issue-page-loading">Loading comments...</div>
            ) : (
              sortedTimeline.map((item, index) => {
                if (item.type === 'comment') {
                  return <IssueComment key={`comment-${item.id}`} comment={item} />
                }
                if (item.type === 'event') {
                  return <TimelineEvent key={`event-${item.id || index}`} event={item} />
                }
                return null
              })
            )}
          </div>

          {/* Comment box */}
          <IssueCommentBox
            key={`${owner}/${repoName}/${issueNumber}`}
            owner={owner}
            repo={repoName}
            issueNumber={issueNumber}
            issueState={issue.state}
            userAvatar={user?.avatar_url || 'https://github.com/ghost.png'}
          />
        </div>

        {/* Sidebar */}
        <aside className="issue-sidebar">
          {/* Assignees */}
          <div className="issue-sidebar-section">
            <h3 className="issue-sidebar-title">Assignees</h3>
            {issue.assignees?.length > 0 ? (
              <div className="issue-sidebar-assignees">
                {issue.assignees.map((a) => (
                  <div key={a.id} className="issue-sidebar-assignee">
                    <img src={a.avatar_url} alt={a.login} className="issue-sidebar-assignee-avatar" />
                    <span className="issue-sidebar-assignee-name">{a.login}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="issue-sidebar-empty">No one assigned</span>
            )}
          </div>

          {/* Labels */}
          <div className="issue-sidebar-section">
            <h3 className="issue-sidebar-title">Labels</h3>
            {issue.labels?.length > 0 ? (
              <div className="issue-sidebar-labels">
                {issue.labels.map((label) => (
                  <span
                    key={label.id}
                    className="issue-sidebar-label"
                    style={labelColor(label.color)}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="issue-sidebar-empty">None yet</span>
            )}
          </div>

          {/* Projects */}
          <div className="issue-sidebar-section">
            <h3 className="issue-sidebar-title">Projects</h3>
            <span className="issue-sidebar-empty">No projects</span>
          </div>

          {/* Milestone */}
          <div className="issue-sidebar-section">
            <h3 className="issue-sidebar-title">Milestone</h3>
            {issue.milestone ? (
              <span className="issue-sidebar-milestone">{issue.milestone.title}</span>
            ) : (
              <span className="issue-sidebar-empty">No milestone</span>
            )}
          </div>

          {/* Participants */}
          {comments.length > 0 && (
            <div className="issue-sidebar-section">
              <h3 className="issue-sidebar-title">Participants</h3>
              <div className="issue-sidebar-participants">
                {[...new Map(
                  [issue.user, ...comments.map(c => c.user)]
                    .filter(Boolean)
                    .map(u => [u.id, u])
                ).values()].map((u) => (
                  <img
                    key={u.id}
                    src={u.avatar_url}
                    alt={u.login}
                    title={u.login}
                    className="issue-sidebar-participant"
                  />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
