import { Check, X, SpinnerGap, ChatCircle, Tag } from '@phosphor-icons/react'

/**
 * OperationsBuffer Component
 * 
 * Displays a list of planned GitHub operations above the chatbox.
 * Shows operation status and provides controls to execute or clear operations.
 */
export function OperationsBuffer({ operations, executeOperation, executeAll, clearCompleted, clearAll }) {
  if (operations.length === 0) return null
  
  const pendingCount = operations.filter(op => op.status === 'pending').length
  const successCount = operations.filter(op => op.status === 'success').length
  const errorCount = operations.filter(op => op.status === 'error').length
  
  return (
    <div className="border-b border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">
          Planned Operations ({pendingCount} pending{successCount > 0 ? `, ${successCount} completed` : ''}{errorCount > 0 ? `, ${errorCount} failed` : ''})
        </h3>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <button
              onClick={executeAll}
              className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Execute All ({pendingCount})
            </button>
          )}
          {(successCount > 0 || errorCount > 0) && (
            <button
              onClick={clearCompleted}
              className="text-sm px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Clear Completed
            </button>
          )}
          {operations.length > 0 && (
            <button
              onClick={clearAll}
              className="text-sm px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>
      
      <div className="space-y-2">
        {operations.map(op => (
          <OperationItem 
            key={op.id} 
            operation={op} 
            onExecute={() => executeOperation(op.id)} 
          />
        ))}
      </div>
    </div>
  )
}

/**
 * OperationItem Component
 * 
 * Displays a single operation with its status and execute button.
 */
function OperationItem({ operation, onExecute }) {
  const getIcon = () => {
    switch (operation.type) {
      case 'comment': 
        return <ChatCircle className="w-4 h-4" />
      case 'set_labels':
      case 'add_labels': 
        return <Tag className="w-4 h-4" />
      default: 
        return null
    }
  }
  
  const getStatusIcon = () => {
    switch (operation.status) {
      case 'pending': 
        return null
      case 'executing': 
        return <SpinnerGap className="w-4 h-4 animate-spin text-blue-600" />
      case 'success': 
        return <Check className="w-4 h-4 text-green-600" weight="bold" />
      case 'error': 
        return <X className="w-4 h-4 text-red-600" weight="bold" />
      default:
        return null
    }
  }
  
  const getOperationTitle = () => {
    switch (operation.type) {
      case 'comment':
        return `Comment on ${operation.repo}#${operation.issueNumber}`
      case 'set_labels':
        return `Set labels on ${operation.repo}#${operation.issueNumber}`
      case 'add_labels':
        return `Add labels to ${operation.repo}#${operation.issueNumber}`
      default:
        return `Unknown operation on ${operation.repo}#${operation.issueNumber}`
    }
  }
  
  const getOperationDetails = () => {
    if (operation.type === 'comment') {
      return operation.body
    }
    if (operation.type === 'set_labels' || operation.type === 'add_labels') {
      return operation.labels?.map(l => `[${l}]`).join(' ') || 'No labels'
    }
    return ''
  }
  
  return (
    <div className="flex items-start gap-3 p-3 bg-white rounded border border-gray-200 shadow-sm">
      <div className="text-gray-500 mt-0.5">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">
          {getOperationTitle()}
        </div>
        <div className="text-sm text-gray-600 mt-1 truncate">
          {getOperationDetails()}
        </div>
        {operation.error && (
          <div className="text-sm text-red-600 mt-1">
            Error: {operation.error}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {getStatusIcon()}
        {operation.status === 'pending' && (
          <button
            onClick={onExecute}
            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            Execute
          </button>
        )}
      </div>
    </div>
  )
}
