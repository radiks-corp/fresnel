import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { SpinnerGap, Check, CaretDown, CaretUp, ArrowLeft, ArrowUp, ChatCircle, Wrench, X } from '@phosphor-icons/react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ScrollToBottom from 'react-scroll-to-bottom'
import { trackEvent } from '../hooks/useAnalytics'
import { useSidebarContext } from '../contexts/SidebarContext'
import './ai-elements/ai-elements.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const LensIcon = ({ className }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12.0667" cy="11.9999" r="6.6" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12.0667" cy="12" r="9.4" stroke="currentColor" strokeWidth="1.33333"/>
    <circle cx="12" cy="12" r="11.5" stroke="currentColor"/>
  </svg>
)

const lenses = [
  { id: 'general', label: 'General risks and issues', description: 'Find high risk issues with this code' },
  { id: 'security', label: 'Security vulnerabilities', description: 'Identify security issues and concerns' },
  { id: 'performance', label: 'Performance review', description: 'Find performance bottlenecks' },
  { id: 'custom', label: 'Custom Review', description: 'Define your own review criteria' },
]

// Simple message component for Ask mode
function Message({ from, children }) {
  return (
    <div className={`ai-message ai-message-${from}`}>
      <div className="ai-message-content">
        {children}
      </div>
    </div>
  )
}

// Table wrapper for markdown
function TableWrapper({ children, ...props }) {
  return (
    <div className="table-wrapper">
      <table {...props}>{children}</table>
    </div>
  )
}

// Markdown renderer
function MessageResponse({ children }) {
  return (
    <div className="ai-message-response">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{ table: TableWrapper }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

// Tool call display
function ToolCall({ toolName, args, result, state }) {
  const [isOpen, setIsOpen] = useState(false)
  
  const getStateIcon = () => {
    switch (state) {
      case 'partial-call':
      case 'call':
        return <SpinnerGap className="ai-tool-spinner" size={14} />
      case 'result':
        return <Check size={14} className="ai-tool-success" />
      default:
        return <Wrench size={14} />
    }
  }

  return (
    <div className="ai-tool">
      <div className="ai-tool-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="ai-tool-header-left">
          {getStateIcon()}
          <span className="ai-tool-name">{toolName}</span>
        </div>
        <span className={`ai-tool-state ai-tool-state-${state}`}>
          {state === 'result' ? 'Complete' : state === 'call' ? 'Running...' : state}
        </span>
      </div>
      {isOpen && (
        <div className="ai-tool-content">
          {args && (
            <div className="ai-tool-input">
              <div className="ai-tool-section-label">Input</div>
              <pre className="ai-tool-code">{JSON.stringify(args, null, 2)}</pre>
            </div>
          )}
          {result && (
            <div className="ai-tool-output">
              <div className="ai-tool-section-label">Output</div>
              <pre className="ai-tool-code">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Reasoning component
function Reasoning({ children, isStreaming }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="ai-reasoning">
      <div className="ai-reasoning-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span className={`ai-reasoning-chevron ${isOpen ? 'expanded' : ''}`}>›</span>
        <span className={`ai-reasoning-label ${isStreaming ? 'shimmer' : ''}`}>
          {isStreaming ? 'Thinking...' : 'Thought for a moment'}
        </span>
      </div>
      {isOpen && (
        <div className="ai-reasoning-content visible">
          <div className="ai-reasoning-text">{children}</div>
        </div>
      )}
    </div>
  )
}

// Review comment card
function ReviewCommentCard({ comment, userAvatar, userName, onApply, onDismiss, onJumpTo, applied, dismissed }) {
  const severityColors = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#65a30d',
  }

  if (dismissed || applied) return null

  return (
    <div className="review-comment-card">
      <div className="review-comment-header">
        <img 
          className="review-comment-avatar" 
          src={userAvatar || 'https://avatars.githubusercontent.com/u/0?v=4'} 
          alt={userName || 'User'}
        />
        <span className="review-comment-author">{userName || 'Fresnel'}</span>
        <span className="review-comment-location">on {comment.path}</span>
        <span 
          className="review-comment-severity"
          style={{ color: severityColors[comment.severity] }}
        >
          {comment.severity}
        </span>
      </div>
      <div className="review-comment-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {comment.body}
        </ReactMarkdown>
      </div>
      <div className="review-comment-actions">
        <button 
          className="review-comment-btn show"
          onClick={() => onJumpTo(comment)}
        >
          Show
        </button>
        <div className="review-comment-actions-right">
          <button 
            className="review-comment-btn dismiss"
            onClick={() => onDismiss(comment.id)}
          >
            Dismiss
          </button>
          <button 
            className={`review-comment-btn apply ${applied ? 'applied' : ''}`}
            onClick={() => onApply(comment.id, comment)}
            disabled={applied}
          >
            {applied ? <><Check size={14} /> Applied</> : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UnifiedReview({ 
  owner, repo, repoId, prNumber, userAvatar, userName,
}) {
  const navigate = useNavigate()
  const { 
    onApplyComment: contextApplyComment, 
    viewedCount, 
    totalFiles, 
    pendingComments: appliedPendingComments 
  } = useSidebarContext()

  const [selectedLens, setSelectedLens] = useState(null)
  const [input, setInput] = useState('')
  const [appliedComments, setAppliedComments] = useState(new Set())
  const [dismissedComments, setDismissedComments] = useState(new Set())
  const [hasStarted, setHasStarted] = useState(false)
  const [showSubmitDropup, setShowSubmitDropup] = useState(false)
  const [submitComment, setSubmitComment] = useState('')
  const [reviewType, setReviewType] = useState('comment')
  const [showPendingView, setShowPendingView] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [reviewSummary, setReviewSummary] = useState(null)
  const [reviewDuration, setReviewDuration] = useState(null)
  const reviewStartTimeRef = useRef(null)
  const summaryFetchedRef = useRef(false)

  const getToken = () => localStorage.getItem('github_pat')
  
  // Mode depends on lens selection
  const isAskMode = !selectedLens
  
  // Build API URLs - separate endpoints for ask vs review
  // Chat works at repo level (no PR) or PR level
  const chatApiUrl = owner && repo
    ? prNumber
      ? `${API_URL}/api/repos/${owner}/${repo}/pulls/${prNumber}/chat`
      : `${API_URL}/api/repos/${owner}/${repo}/chat`
    : null
    
  const reviewApiUrl = owner && repo && prNumber 
    ? `${API_URL}/api/repos/${owner}/${repo}/pulls/${prNumber}/review`
    : null

  // Separate transport for Ask (chat)
  const chatTransport = useMemo(() => {
    if (!chatApiUrl) return null
    return new DefaultChatTransport({
      api: chatApiUrl,
      headers: () => ({
        'Authorization': `Bearer ${getToken()}`,
      }),
    })
  }, [chatApiUrl])

  // Separate transport for Review
  const reviewTransport = useMemo(() => {
    if (!reviewApiUrl) return null
    return new DefaultChatTransport({
      api: reviewApiUrl,
      headers: () => ({
        'Authorization': `Bearer ${getToken()}`,
      }),
    })
  }, [reviewApiUrl])

  // Separate useChat for Ask mode
  const { 
    messages: chatMessages, 
    sendMessage: sendChatMessage, 
    status: chatStatus, 
    error: chatError 
  } = useChat({
    transport: chatTransport || undefined,
  })

  // Separate useChat for Review mode
  const { 
    messages: reviewMessages, 
    sendMessage: sendReviewMessage, 
    status: reviewStatus, 
    error: reviewError,
    stop: stopReview,
  } = useChat({
    transport: reviewTransport || undefined,
  })

  // Use the appropriate messages/status based on mode
  const messages = isAskMode ? chatMessages : reviewMessages
  const status = isAskMode ? chatStatus : reviewStatus
  const error = isAskMode ? chatError : reviewError
  
  const isLoading = status === 'submitted' || status === 'streaming'
  const isReady = isAskMode ? !!chatTransport : !!reviewTransport
  const hasMessages = messages.length > 0

  // Extract review comments from tool invocations
  const reviewComments = useMemo(() => {
    const comments = []
    for (const message of messages) {
      if (message.parts) {
        for (const part of message.parts) {
          if (part.type === 'tool-create_comment' && 
              part.output?.success && 
              part.output?.comment) {
            comments.push(part.output.comment)
          }
        }
      }
    }
    return comments
  }, [messages])

  // Record duration and fetch summary when the review completes
  useEffect(() => {
    if (!isAskMode && hasStarted && !isLoading && !summaryFetchedRef.current) {
      // Calculate duration
      if (reviewStartTimeRef.current) {
        const elapsed = Math.round((Date.now() - reviewStartTimeRef.current) / 1000)
        setReviewDuration(elapsed)
      }

      trackEvent('Review Completed', {
        lens: selectedLens?.id,
        comments_found: reviewComments.length,
        duration_seconds: reviewDuration,
        repo: `${owner}/${repo}`,
        pr_number: prNumber,
      })

      if (reviewComments.length === 0) return
      summaryFetchedRef.current = true
      const token = getToken()
      if (!token) return

      // Send only compact data: path, severity, first line of body
      const items = reviewComments.map(c => ({
        path: c.path,
        severity: c.severity,
        body: c.body,
      }))

      fetch(`${API_URL}/api/repos/${owner}/${repo}/pulls/${prNumber}/review/summarize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.summary) setReviewSummary(data.summary)
        })
        .catch(() => {})
    }
  }, [isAskMode, hasStarted, isLoading, reviewComments, owner, repo, prNumber])

  const handleApplyComment = useCallback((commentId, comment) => {
    setAppliedComments(prev => new Set([...prev, commentId]))
    trackEvent('Review Comment Applied', { file: comment.path, line: comment.line, severity: comment.severity })
    if (contextApplyComment) {
      contextApplyComment(comment)
    }
    // Jump to the comment via navigation state
    if (repoId && prNumber) {
      navigate(`/app/${repoId}/${prNumber}`, {
        state: { jumpTo: { file: comment.path, line: comment.line } },
      })
    }
  }, [contextApplyComment, navigate, repoId, prNumber])

  const handleDismissComment = useCallback((commentId) => {
    setDismissedComments(prev => new Set([...prev, commentId]))
    trackEvent('Review Comment Dismissed', { comment_id: commentId })
  }, [])

  const handleJumpTo = useCallback((comment) => {
    trackEvent('Review Comment Show Clicked', { file: comment.path, line: comment.line })
    // Use navigation state so AppPage can handle the scroll
    if (repoId && prNumber) {
      navigate(`/app/${repoId}/${prNumber}`, {
        state: { jumpTo: { file: comment.path, line: comment.line } },
      })
    }
  }, [navigate, repoId, prNumber])

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!input.trim() && isAskMode) return
    if (!isReady || isLoading) return

    if (isAskMode) {
      // Ask mode - use chat endpoint
      trackEvent('Chat Message Sent', {
        repo: `${owner}/${repo}`,
        pr_number: prNumber,
      })
      sendChatMessage({ text: input })
      setInput('')
    } else {
      // Review mode - use review endpoint
      setHasStarted(true)
      reviewStartTimeRef.current = Date.now()
      trackEvent('Review Started', {
        lens: selectedLens.id,
        has_instructions: !!input.trim(),
        repo: `${owner}/${repo}`,
        pr_number: prNumber,
      })
      sendReviewMessage({ 
        text: input.trim() 
          ? `Review with focus: ${selectedLens.id}. Notes: ${input}` 
          : `Review with focus: ${selectedLens.id}` 
      }, {
        body: {
          lens: selectedLens.id,
          instructions: input.trim() || undefined,
        }
      })
      setInput('')
    }
  }

  const handleNewReview = () => {
    setHasStarted(false)
    setAppliedComments(new Set())
    setDismissedComments(new Set())
  }

  const handleClearLens = () => {
    if (selectedLens) {
      trackEvent('Lens Cleared', { lens: selectedLens.id })
    }
    setSelectedLens(null)
    setHasStarted(false)
    setInput('')
    setAppliedComments(new Set())
    setDismissedComments(new Set())
    setShowSubmitDropup(false)
    setShowPendingView(false)
    setSubmitComment('')
    setReviewType('comment')
    setReviewSummary(null)
    setReviewDuration(null)
    reviewStartTimeRef.current = null
    summaryFetchedRef.current = false
  }

  // Submit review with all pending comments
  const handleSubmitReview = async () => {
    if (!owner || !repo || !prNumber) return
    
    const token = getToken()
    if (!token) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Map review type to GitHub event
      const eventMap = {
        'comment': 'COMMENT',
        'approve': 'APPROVE',
        'request_changes': 'REQUEST_CHANGES'
      }

      // Format pending comments for GitHub API
      const comments = (appliedPendingComments || []).map(comment => ({
        path: comment.path,
        line: comment.line,
        body: comment.body
      }))

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            body: submitComment || (reviewType === 'request_changes' ? 'Changes requested.' : undefined),
            event: eventMap[reviewType],
            comments: comments.length > 0 ? comments : undefined
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to submit review')
      }

      trackEvent('Review Submitted to GitHub', {
        repo: `${owner}/${repo}`,
        pr_number: prNumber,
        review_type: reviewType,
        comments_count: comments.length,
      })

      // Success - close the dropup and reset
      setShowSubmitDropup(false)
      setSubmitComment('')
      // Clear the pending comments by calling handleClearLens or notifying parent
      handleClearLens()
    } catch (err) {
      setSubmitError(err.message)
      trackEvent('Review Submit Failed', { error: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Count visible (non-dismissed, non-applied) comments
  const visibleCommentCount = reviewComments.filter(
    c => !dismissedComments.has(c.id) && !appliedComments.has(c.id)
  ).length

  // Render lens selector OR review status bar
  const lensSelector = hasStarted ? (
    <div className="review-status-bar">
      {isLoading ? (
        <div className="review-status-row">
          <SpinnerGap size={16} className="spinning review-status-spinner" />
          <span className="review-status-text">Reading the pull request...</span>
          <button className="review-status-stop" onClick={() => { stopReview(); trackEvent('Review Stopped', { repo: `${owner}/${repo}`, pr_number: prNumber }) }}>
            Stop
          </button>
        </div>
      ) : (
        <>
          <div className="review-status-row">
            <span className="review-status-heading">
              Found {reviewComments.length} {reviewComments.length === 1 ? 'issue' : 'issues'}
              {reviewDuration != null && (
                <span className="review-status-duration">
                  {' '}in {reviewDuration < 60
                    ? `${reviewDuration}s`
                    : `${Math.floor(reviewDuration / 60)}m ${reviewDuration % 60}s`}
                </span>
              )}
            </span>
            <button className="review-status-clear" onClick={handleClearLens}>
              <X size={14} />
            </button>
          </div>
          {reviewSummary && (
            <p className="review-status-summary">{reviewSummary}</p>
          )}
        </>
      )}
    </div>
  ) : (
    <div className="lens-selector-unified">
      <Popover className="lens-popover">
        <PopoverButton className="lens-dropdown-trigger">
          <LensIcon className="lens-icon" />
          <span>{selectedLens ? selectedLens.label : 'Select a lens'}</span>
          <CaretDown size={14} className="lens-chevron" />
        </PopoverButton>

        <PopoverPanel className="lens-dropdown">
          {({ close }) => (
            <>
              <div className="lens-dropdown-header">Select a focus</div>
              {lenses.map((lens) => (
                <div
                  key={lens.id}
                  className={`lens-option ${selectedLens?.id === lens.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedLens(lens)
                    trackEvent('Lens Selected', { lens: lens.id, lens_label: lens.label })
                    close()
                  }}
                >
                  <LensIcon className="lens-icon" />
                  <div className="lens-option-text">
                    <span className="lens-option-label">{lens.label}</span>
                    <span className="lens-option-desc">{lens.description}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </PopoverPanel>
      </Popover>
      
      {selectedLens && (
        <button className="lens-clear-btn" onClick={handleClearLens} title="Clear lens">
          <X size={14} />
        </button>
      )}
    </div>
  )

  // Render chat input
  const chatInput = (
    <form onSubmit={handleSubmit} className="ai-chat-form">
      <div className="chat-input-container">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          placeholder={isAskMode ? (prNumber ? "Ask about this PR..." : "Ask about this repo...") : "Additional instructions (optional)"}
          disabled={isLoading || !isReady || (!isAskMode && hasStarted)}
          rows={2}
        />
        <div className="chat-input-actions">
          <div className="chat-input-icons" />
          {isAskMode ? (
            <button 
              className={`chat-submit-btn ${input.trim() ? 'active' : ''}`}
              type="submit"
              disabled={!input.trim() || isLoading || !isReady}
            >
              {isLoading ? <SpinnerGap size={16} className="spinning" /> : <ArrowUp size={16} weight="bold" />}
            </button>
          ) : (
            <button 
              className="start-review-btn"
              type="submit"
              disabled={isLoading || !isReady || hasStarted}
            >
              {isLoading ? <SpinnerGap size={16} className="spinning" /> : 'Start'}
            </button>
          )}
        </div>
      </div>
    </form>
  )

  // Render footer for review mode
  const reviewFooter = (
    <>
      {showSubmitDropup ? (
        <div className="submit-accordion">
          <div className="submit-accordion-header">
            <span>Finish your review</span>
          </div>
          <div className="submit-accordion-body">
            <textarea
              className="submit-dropup-textarea"
              placeholder="Leave a comment"
              value={submitComment}
              onChange={(e) => setSubmitComment(e.target.value)}
            />
            <div className="submit-dropup-options">
              <label className={`submit-option ${reviewType === 'comment' ? 'selected' : ''}`}>
                <input type="radio" name="reviewType" value="comment"
                  checked={reviewType === 'comment'}
                  onChange={(e) => { setReviewType(e.target.value); trackEvent('Review Type Selected', { type: 'comment' }) }}
                />
                <span className="option-radio" />
                <div className="option-content">
                  <span className="option-title">Comment</span>
                  <span className="option-desc">Submit general feedback without explicit approval.</span>
                </div>
              </label>
              <label className={`submit-option ${reviewType === 'approve' ? 'selected' : ''}`}>
                <input type="radio" name="reviewType" value="approve"
                  checked={reviewType === 'approve'}
                  onChange={(e) => { setReviewType(e.target.value); trackEvent('Review Type Selected', { type: 'approve' }) }}
                />
                <span className="option-radio" />
                <div className="option-content">
                  <span className="option-title">Approve</span>
                  <span className="option-desc">Submit feedback and approve merging these changes.</span>
                </div>
              </label>
              <label className={`submit-option ${reviewType === 'request_changes' ? 'selected' : ''}`}>
                <input type="radio" name="reviewType" value="request_changes"
                  checked={reviewType === 'request_changes'}
                  onChange={(e) => { setReviewType(e.target.value); trackEvent('Review Type Selected', { type: 'request_changes' }) }}
                />
                <span className="option-radio" />
                <div className="option-content">
                  <span className="option-title">Request changes</span>
                  <span className="option-desc">Submit feedback suggesting changes.</span>
                </div>
              </label>
            </div>
          </div>
          <div className="submit-accordion-footer">
            <button 
              className="submit-dropup-cancel" 
              onClick={() => { setShowSubmitDropup(false); trackEvent('Review Submit Cancelled') }}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              className="submit-dropup-submit"
              onClick={handleSubmitReview}
              disabled={isSubmitting}
            >
              {isSubmitting ? <SpinnerGap size={16} className="spinning" /> : 'Submit review'}
            </button>
          </div>
          {submitError && (
            <div className="submit-error">
              {submitError}
            </div>
          )}
        </div>
      ) : showPendingView ? (
        <div className="pending-comments-view">
          <div className="pending-view-header">
            <button className="back-btn" onClick={() => setShowPendingView(false)}>
              <ArrowLeft size={16} />
            </button>
            <span>Pending comments ({appliedPendingComments?.length || 0})</span>
          </div>
          <div className="pending-view-list">
            {appliedPendingComments?.map(comment => (
              <div key={comment.id} className="pending-view-item">
                <div className="pending-view-item-header">
                  <span className="pending-view-file">{comment.path}</span>
                  <span className="pending-view-line">L{comment.line}</span>
                </div>
                <div className="pending-view-item-body">
                  <ReactMarkdown>{comment.body}</ReactMarkdown>
                </div>
              </div>
            ))}
            {(!appliedPendingComments || appliedPendingComments.length === 0) && (
              <div className="pending-view-empty">No pending comments</div>
            )}
          </div>
          <div className="pending-view-footer">
            <button 
              className="submit-review-btn"
              onClick={() => { setShowPendingView(false); setShowSubmitDropup(true); }}
            >
              Submit review
            </button>
          </div>
        </div>
      ) : (
        <div className="review-comments-footer">
          <div className="footer-stats">
            <span className="footer-stat">{viewedCount ?? 0}/{totalFiles ?? 0} viewed</span>
            <button className="footer-stat-btn" onClick={() => setShowPendingView(true)}>
              Comments {appliedPendingComments?.length || 0}
            </button>
          </div>
          <button className="submit-review-btn" onClick={() => setShowSubmitDropup(true)}>
            Submit review
            <CaretUp size={14} weight="bold" />
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className={`unified-review-container ${selectedLens ? 'has-lens' : ''}`}>
      {lensSelector}
      
      {/* Show input at top when no messages */}
      {!hasMessages && !hasStarted && chatInput}
      
      <ScrollToBottom className="ai-conversation" followButtonClassName="hidden">
        <div className="ai-conversation-content">
          {!isReady ? (
            <div className="ai-empty-state">
              <ChatCircle size={40} />
              <h3 className="ai-empty-state-title">Select a repo</h3>
              <p className="ai-empty-state-description">
                Select a repository to start chatting.
              </p>
            </div>
          ) : !hasMessages && !hasStarted ? (
            <div className="ai-empty-state">
              <ChatCircle size={40} />
              <h3 className="ai-empty-state-title">
                {isAskMode 
                  ? (prNumber ? 'Ask about this PR' : 'Chat with this repo') 
                  : 'Ready to review'}
              </h3>
              <p className="ai-empty-state-description">
                {isAskMode 
                  ? (prNumber 
                      ? 'Ask questions about the code changes or get explanations.' 
                      : 'Ask questions, search issues, or explore the repository.')
                  : 'Click Start to begin the review, or add instructions first.'}
              </p>
            </div>
          ) : (
            <>
              {/* Render messages */}
              {messages.map((message) => (
                <Fragment key={message.id}>
                  {message.parts?.map((part, i) => {
                    // Text messages (for Ask mode only)
                    if (isAskMode && part.type === 'text') {
                      return (
                        <Message key={`${message.id}-${i}`} from={message.role}>
                          {message.role === 'assistant' ? (
                            <MessageResponse>{part.text}</MessageResponse>
                          ) : (
                            <div className="whitespace-pre-wrap">{part.text}</div>
                          )}
                        </Message>
                      )
                    }
                    
                    // Reasoning
                    if (part.type === 'reasoning') {
                      return (
                        <Reasoning 
                          key={`${message.id}-${i}`}
                          isStreaming={status === 'streaming' && i === message.parts.length - 1}
                        >
                          {part.text}
                        </Reasoning>
                      )
                    }
                    
                    // Tool invocations (for Ask mode only)
                    if (isAskMode && part.type === 'tool-invocation') {
                      return (
                        <ToolCall
                          key={`${message.id}-${i}`}
                          toolName={part.toolInvocation.toolName}
                          args={part.toolInvocation.args}
                          result={part.toolInvocation.result}
                          state={part.toolInvocation.state}
                        />
                      )
                    }

                    // Review comments (for Review mode) - tool parts have type like 'tool-create_comment'
                    if (!isAskMode && part.type === 'tool-create_comment' && part.output?.success && part.output?.comment) {
                      const comment = part.output.comment
                      return (
                        <ReviewCommentCard
                          key={comment.id}
                          comment={comment}
                          userAvatar={userAvatar}
                          userName={userName}
                          onApply={handleApplyComment}
                          onDismiss={handleDismissComment}
                          onJumpTo={handleJumpTo}
                          applied={appliedComments.has(comment.id)}
                          dismissed={dismissedComments.has(comment.id)}
                        />
                      )
                    }

                    return null
                  })}
                </Fragment>
              ))}

              {/* Loading state (Ask mode only) */}
              {isAskMode && isLoading && messages.length === 0 && (
                <div className="review-loading">
                  <SpinnerGap size={24} className="spinning" />
                  <span>Thinking...</span>
                </div>
              )}

              {/* Success state for review mode */}
              {!isAskMode && !isLoading && hasStarted && reviewComments.length === 0 && status !== 'error' && (
                <div className="review-success">
                  <div className="review-success-icon">✓</div>
                  <div className="review-success-title">You're good to go!</div>
                  <div className="review-success-text">No issues found in this pull request.</div>
                </div>
              )}

              {/* Error state */}
              {status === 'error' && (
                <div className="ai-error-message">
                  <div className="ai-error-title">Request failed</div>
                  <div className="ai-error-text">{error?.message ?? 'Unknown error'}</div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollToBottom>

      {/* Show input at bottom for Ask mode with messages, or review footer */}
      {isAskMode && hasMessages && chatInput}
      {!isAskMode && hasStarted && reviewFooter}
    </div>
  )
}
