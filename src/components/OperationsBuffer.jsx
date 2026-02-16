import { useState } from 'react'
import { CaretRight, ChatCircle, Tag } from '@phosphor-icons/react'

/**
 * OperationsBuffer Component
 * 
 * Displays planned GitHub operations inline in the chatbox as a
 * collapsible card with a file count, Stop, and Review buttons.
 */
export function OperationsBuffer({ operations }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (operations.length === 0) return null

  const count = operations.length

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
            className="planned-updates-stop-btn"
            onClick={(e) => e.stopPropagation()}
          >
            Stop <span className="planned-updates-shortcut">^c</span>
          </button>
          <button
            type="button"
            className="planned-updates-review-btn"
            onClick={(e) => e.stopPropagation()}
          >
            Review
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="planned-updates-list">
          {operations.map((op) => (
            <OperationRow key={op.id} operation={op} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * OperationRow Component
 * 
 * Displays a single operation row inside the expanded list.
 */
function OperationRow({ operation }) {
  const getIcon = () => {
    switch (operation.type) {
      case 'comment':
        return <ChatCircle size={14} />
      case 'set_labels':
      case 'add_labels':
        return <Tag size={14} />
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
      default:
        return `Operation on ${operation.repo}#${operation.issueNumber}`
    }
  }

  const getDetail = () => {
    if (operation.type === 'comment') return operation.body
    if (operation.type === 'set_labels' || operation.type === 'add_labels') {
      return operation.labels?.join(', ') || 'No labels'
    }
    return ''
  }

  return (
    <div className="planned-updates-row">
      <span className="planned-updates-row-icon">{getIcon()}</span>
      <div className="planned-updates-row-text">
        <span className="planned-updates-row-title">{getTitle()}</span>
        {getDetail() && (
          <span className="planned-updates-row-detail">{getDetail()}</span>
        )}
      </div>
    </div>
  )
}
