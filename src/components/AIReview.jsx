import { useState, useMemo, useCallback, Fragment } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { SpinnerGap, Check, CaretDown, CaretUp, ArrowLeft } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ScrollToBottom from 'react-scroll-to-bottom'
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

// Review comment card component
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

// Reasoning component (collapsed by default)
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

export default function AIReview({ owner, repo, prNumber, userAvatar, userName, onJumpToLine, onApplyComment, viewedCount, totalFiles, pendingComments: appliedPendingComments }) {
  const [selectedLens, setSelectedLens] = useState(lenses[0])
  const [lensDropdownOpen, setLensDropdownOpen] = useState(false)
  const [hoveredLens, setHoveredLens] = useState(null)
  const [instructions, setInstructions] = useState('')
  const [appliedComments, setAppliedComments] = useState(new Set())
  const [dismissedComments, setDismissedComments] = useState(new Set())
  const [hasStarted, setHasStarted] = useState(false)
  const [showSubmitDropup, setShowSubmitDropup] = useState(false)
  const [submitComment, setSubmitComment] = useState('')
  const [reviewType, setReviewType] = useState('comment')
  const [showPendingView, setShowPendingView] = useState(false)

  const getToken = () => localStorage.getItem('github_pat')

  // Build API URL for review endpoint
  const apiUrl = owner && repo && prNumber 
    ? `${API_URL}/api/repos/${owner}/${repo}/pulls/${prNumber}/review`
    : null

  const transport = useMemo(() => {
    if (!apiUrl) return null
    return new DefaultChatTransport({
      api: apiUrl,
      headers: () => ({
        'Authorization': `Bearer ${getToken()}`,
      }),
    })
  }, [apiUrl])

  const { messages, sendMessage, status, error } = useChat({
    transport: transport || undefined,
  })

  const isLoading = status === 'submitted' || status === 'streaming'
  const isReady = !!transport

  // Extract comments from tool invocations
  // Tool parts have type like 'tool-create_comment', 'tool-list_files' etc.
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

  const handleApplyComment = useCallback((commentId, comment) => {
    setAppliedComments(prev => new Set([...prev, commentId]))
    if (onApplyComment) {
      onApplyComment(comment)
    }
    // Jump to the line after applying
    if (onJumpToLine) {
      onJumpToLine(comment.path, comment.line)
    }
  }, [onApplyComment, onJumpToLine])

  const handleDismissComment = useCallback((commentId) => {
    setDismissedComments(prev => new Set([...prev, commentId]))
  }, [])

  const handleJumpTo = useCallback((comment) => {
    if (onJumpToLine) {
      onJumpToLine(comment.path, comment.line)
    }
  }, [onJumpToLine])

  const handleStartReview = () => {
    if (!isReady || isLoading) return
    setHasStarted(true)
    sendMessage({ 
      text: instructions.trim() 
        ? `Review with focus: ${selectedLens.id}. Notes: ${instructions}` 
        : `Review with focus: ${selectedLens.id}` 
    }, {
      body: {
        lens: selectedLens.id,
        instructions: instructions.trim() || undefined,
      }
    })
  }

  const handleNewReview = () => {
    setHasStarted(false)
    setAppliedComments(new Set())
    // Note: useChat doesn't have a clear method, so we rely on key prop from parent
  }

  // Show setup form before starting
  if (!hasStarted) {
    return (
      <div className="ai-review-setup">
        <div className="lens-selector">
          <div 
            className="lens-dropdown-trigger"
            onClick={() => setLensDropdownOpen(!lensDropdownOpen)}
          >
            <LensIcon className="lens-icon" />
            <span>{selectedLens.label}</span>
            <CaretDown size={14} className="lens-chevron" />
          </div>

          {lensDropdownOpen && (
            <div className="lens-dropdown">
              <div className="lens-dropdown-header">Select a focus</div>
              {lenses.map((lens) => (
                <div
                  key={lens.id}
                  className={`lens-option ${selectedLens?.id === lens.id ? 'selected' : ''} ${hoveredLens === lens.id ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredLens(lens.id)}
                  onMouseLeave={() => setHoveredLens(null)}
                  onClick={() => {
                    setSelectedLens(lens)
                    setLensDropdownOpen(false)
                  }}
                >
                  <LensIcon className="lens-icon" />
                  <div className="lens-option-text">
                    <span className="lens-option-label">{lens.label}</span>
                    <span className={`lens-option-desc ${hoveredLens === lens.id ? 'visible' : ''}`}>
                      {lens.description}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chat-input-container">
          <textarea
            className="chat-input"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Additional instructions (Optional)"
            rows={2}
          />
          <div className="chat-input-actions">
            <div className="chat-input-icons" />
            <button 
              className="start-review-btn" 
              onClick={handleStartReview}
              disabled={!isReady}
            >
              Start
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show review results
  return (
    <div className="ai-review-container">
      <div className="review-comments-header">
        <LensIcon className="lens-icon" />
        <span>{selectedLens.label}</span>
        {isLoading && <SpinnerGap size={16} className="spinning" />}
      </div>

      <ScrollToBottom className="review-comments-scroll" followButtonClassName="scroll-follow-btn">
        <div className="review-comments-list">
          {/* Show reasoning and tool calls from messages */}
          {messages.map((message) => (
            <Fragment key={message.id}>
              {message.parts?.map((part, i) => {
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
                
                // Tool parts have type like 'tool-create_comment', 'tool-list_files', 'tool-read_file'
                if (part.type === 'tool-create_comment' && part.output?.success && part.output?.comment) {
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

                // Filter out other tool calls (list_files, read_file) - don't render them

                return null
              })}
            </Fragment>
          ))}

          {/* Loading state when no messages yet */}
          {isLoading && messages.length === 0 && (
            <div className="review-loading">
              <SpinnerGap size={24} className="spinning" />
              <span>Starting review...</span>
            </div>
          )}

          {/* Success state - no issues found */}
          {!isLoading && messages.length > 0 && reviewComments.length === 0 && status !== 'error' && (
            <div className="review-success">
              <div className="review-success-icon">✓</div>
              <div className="review-success-title">You're good to go!</div>
              <div className="review-success-text">No issues found in this pull request.</div>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="ai-error-message">
              <div className="ai-error-title">Review failed</div>
              <div className="ai-error-text">{error?.message ?? 'Unknown error'}</div>
            </div>
          )}
        </div>
      </ScrollToBottom>

      {/* Submit accordion - expands in place */}
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
                <input 
                  type="radio" 
                  name="reviewType" 
                  value="comment"
                  checked={reviewType === 'comment'}
                  onChange={(e) => setReviewType(e.target.value)}
                />
                <span className="option-radio" />
                <div className="option-content">
                  <span className="option-title">Comment</span>
                  <span className="option-desc">Submit general feedback without explicit approval.</span>
                </div>
              </label>
              <label className={`submit-option ${reviewType === 'approve' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="reviewType" 
                  value="approve"
                  checked={reviewType === 'approve'}
                  onChange={(e) => setReviewType(e.target.value)}
                />
                <span className="option-radio" />
                <div className="option-content">
                  <span className="option-title">Approve</span>
                  <span className="option-desc">Submit feedback and approve merging these changes.</span>
                </div>
              </label>
              <label className={`submit-option ${reviewType === 'request_changes' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="reviewType" 
                  value="request_changes"
                  checked={reviewType === 'request_changes'}
                  onChange={(e) => setReviewType(e.target.value)}
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
              onClick={() => setShowSubmitDropup(false)}
            >
              Cancel
            </button>
            <button className="submit-dropup-submit">
              Submit review
            </button>
          </div>
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
            <span className="footer-stat">
              {viewedCount ?? 0}/{totalFiles ?? 0} viewed
            </span>
            <button 
              className="footer-stat-btn"
              onClick={() => setShowPendingView(true)}
            >
              Comments {appliedPendingComments?.length || 0}
            </button>
          </div>
          <button 
            className="submit-review-btn"
            onClick={() => setShowSubmitDropup(true)}
          >
            Submit review
            <CaretUp size={14} weight="bold" />
          </button>
        </div>
      )}
    </div>
  )
}
