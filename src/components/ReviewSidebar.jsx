import { useState, useCallback, useEffect } from 'react'
import UnifiedReview from './UnifiedReview'
import './ReviewSidebar.css'

const MIN_WIDTH = 380
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 480

function ReviewSidebar({ owner, repo, prNumber, chatKey, userAvatar, userName, onJumpToLine, onApplyComment, viewedCount, totalFiles, pendingComments }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return
    const newWidth = e.clientX
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)))
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <aside className="review-sidebar" style={{ width }}>
      <div className="review-header-bar">
        {/* Empty draggable header bar */}
      </div>

      <div className="review-content">
        <UnifiedReview 
          key={chatKey}
          owner={owner} 
          repo={repo} 
          prNumber={prNumber}
          userAvatar={userAvatar}
          userName={userName}
          onJumpToLine={onJumpToLine}
          onApplyComment={onApplyComment}
          viewedCount={viewedCount}
          totalFiles={totalFiles}
          pendingComments={pendingComments}
        />
      </div>

      <div 
        className={`sidebar-resize-handle ${isResizing ? 'active' : ''}`}
        onMouseDown={handleMouseDown}
      />
    </aside>
  )
}

export default ReviewSidebar
