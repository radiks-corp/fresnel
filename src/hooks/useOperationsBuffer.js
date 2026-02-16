import { useState, useCallback } from 'react'
import { githubFetch } from './useGitHubAPI'

/**
 * Hook for managing a buffer of GitHub API operations
 * 
 * Operations are stored in-memory and can be executed individually or in bulk.
 * Each operation has a status: pending, executing, success, or error.
 * 
 * @returns {Object} Buffer state and control functions
 */
export function useOperationsBuffer() {
  const [operations, setOperations] = useState([])
  
  /**
   * Add a new operation to the buffer
   * @param {Object} operation - Operation details (type, repo, issueNumber, etc.)
   * @returns {Object} The created operation with id, timestamp, and status
   */
  const addOperation = useCallback((operation) => {
    const op = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: 'pending'
    }
    
    // Log operation added (no PII - only operation type)
    console.log(`[OperationsBuffer] Operation added: type=${op.type}, id=${op.id}`)
    
    setOperations(prev => [...prev, op])
    return op
  }, [])
  
  /**
   * Execute a single operation by ID
   * @param {string} operationId - The operation ID to execute
   */
  const executeOperation = useCallback(async (operationId) => {
    // Update status to executing
    setOperations(prev => prev.map(op => 
      op.id === operationId ? { ...op, status: 'executing' } : op
    ))
    
    const operation = operations.find(op => op.id === operationId)
    if (!operation) return
    
    // Log operation execution start (no PII - only operation type and ID)
    console.log(`[OperationsBuffer] Executing operation: type=${operation.type}, id=${operationId}`)
    
    try {
      // Execute based on operation type
      switch (operation.type) {
        case 'comment': {
          const [owner, repo] = operation.repo.split('/')
          await githubFetch(
            `https://api.github.com/repos/${owner}/${repo}/issues/${operation.issueNumber}/comments`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body: operation.body })
            }
          )
          break
        }
        case 'set_labels': {
          const [owner, repo] = operation.repo.split('/')
          await githubFetch(
            `https://api.github.com/repos/${owner}/${repo}/issues/${operation.issueNumber}/labels`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labels: operation.labels })
            }
          )
          break
        }
        case 'add_labels': {
          const [owner, repo] = operation.repo.split('/')
          await githubFetch(
            `https://api.github.com/repos/${owner}/${repo}/issues/${operation.issueNumber}/labels`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labels: operation.labels })
            }
          )
          break
        }
        default:
          throw new Error(`Unknown operation type: ${operation.type}`)
      }
      
      // Log success (no PII)
      console.log(`[OperationsBuffer] Operation succeeded: type=${operation.type}, id=${operationId}`)
      
      // Update status to success
      setOperations(prev => prev.map(op => 
        op.id === operationId ? { ...op, status: 'success' } : op
      ))
    } catch (error) {
      // Log failure (no PII - only error type)
      console.error(`[OperationsBuffer] Operation failed: type=${operation.type}, id=${operationId}, error=${error.name}`)
      
      // Update status to error
      setOperations(prev => prev.map(op => 
        op.id === operationId 
          ? { ...op, status: 'error', error: error.message } 
          : op
      ))
    }
  }, [operations])
  
  /**
   * Execute all pending operations in sequence
   */
  const executeAll = useCallback(async () => {
    const pending = operations.filter(op => op.status === 'pending')
    for (const op of pending) {
      await executeOperation(op.id)
    }
  }, [operations, executeOperation])
  
  /**
   * Remove completed and failed operations from the buffer
   */
  const clearCompleted = useCallback(() => {
    setOperations(prev => prev.filter(op => op.status === 'pending' || op.status === 'executing'))
  }, [])
  
  /**
   * Clear all operations from the buffer
   */
  const clearAll = useCallback(() => {
    setOperations([])
  }, [])
  
  return {
    operations,
    addOperation,
    executeOperation,
    executeAll,
    clearCompleted,
    clearAll,
  }
}
