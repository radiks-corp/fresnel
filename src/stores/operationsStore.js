import { create } from 'zustand'
import { apiFetch, RateLimitError } from '../hooks/useGitHubAPI'

/**
 * Global Zustand store for planned GitHub operations.
 *
 * Operations are created by the AI chat (plan_operation tool) and can
 * be consumed anywhere — the sidebar's OperationsBuffer card or the issue
 * page's comment box.
 */
export const useOperationsStore = create((set, get) => ({
  operations: [],

  /** Callback invoked after an operation succeeds. Set this to handle side effects like query invalidation. */
  onOperationSuccess: null,

  /** Register a callback for successful operations. */
  setOnOperationSuccess: (fn) => set({ onOperationSuccess: fn }),

  /** Add a new pending operation and return it. */
  addOperation: (operation) => {
    const op = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: 'pending',
    }
    console.log(`[OperationsStore] Operation added: type=${op.type}, id=${op.id}`)
    set((state) => ({ operations: [...state.operations, op] }))
    return op
  },

  /** Update a single operation by id (partial merge). */
  updateOperation: (id, patch) => {
    set((state) => ({
      operations: state.operations.map((op) =>
        op.id === id ? { ...op, ...patch } : op
      ),
    }))
  },

  /** Remove a single operation by id. */
  removeOperation: (id) => {
    set((state) => ({
      operations: state.operations.filter((op) => op.id !== id),
    }))
  },

  /** Execute a single operation by id. */
  executeOperation: async (operationId) => {
    const { operations, updateOperation } = get()
    const operation = operations.find((op) => op.id === operationId)
    if (!operation) return

    updateOperation(operationId, { status: 'executing' })
    console.log(`[OperationsStore] Executing: type=${operation.type}, id=${operationId}`)

    try {
      const [owner, repo] = operation.repo.split('/')

      switch (operation.type) {
        case 'comment': {
          await apiFetch(
            `/api/repos/${owner}/${repo}/issues/${operation.issueNumber}/comments`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body: operation.body }),
            }
          )
          break
        }
        case 'set_labels': {
          await apiFetch(
            `/api/repos/${owner}/${repo}/issues/${operation.issueNumber}/labels`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labels: operation.labels }),
            }
          )
          break
        }
        case 'add_labels': {
          await apiFetch(
            `/api/repos/${owner}/${repo}/issues/${operation.issueNumber}/labels`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labels: operation.labels }),
            }
          )
          break
        }
        case 'close_issue':
        case 'reopen_issue': {
          const newState = operation.type === 'close_issue' ? 'closed' : 'open'
          // Post an optional closing/reopening comment first
          if (operation.body?.trim()) {
            await apiFetch(
              `/api/repos/${owner}/${repo}/issues/${operation.issueNumber}/comments`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: operation.body.trim() }),
              }
            )
          }
          const patchBody = { state: newState }
          if (operation.type === 'close_issue' && operation.stateReason) {
            patchBody.state_reason = operation.stateReason
          } else if (operation.type === 'reopen_issue') {
            patchBody.state_reason = 'reopened'
          }
          await apiFetch(
            `/api/repos/${owner}/${repo}/issues/${operation.issueNumber}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patchBody),
            }
          )
          break
        }
        case 'review_comment': {
          const comment = {
            path: operation.path,
            line: operation.line,
            side: 'RIGHT',
            body: operation.body,
          }
          if (operation.startLine) {
            comment.start_line = operation.startLine
            comment.start_side = 'RIGHT'
          }
          await apiFetch(
            `/api/repos/${owner}/${repo}/pulls/${operation.prNumber}/reviews`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'COMMENT',
                comments: [comment],
              }),
            }
          )
          break
        }
        case 'review_comment_reply': {
          await apiFetch(
            `/api/repos/${owner}/${repo}/pulls/${operation.prNumber}/comments/${operation.inReplyTo}/replies`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body: operation.body }),
            }
          )
          break
        }
        default:
          throw new Error(`Unknown operation type: ${operation.type}`)
      }

      console.log(`[OperationsStore] Succeeded: type=${operation.type}, id=${operationId}`)
      updateOperation(operationId, { status: 'success' })

      // Remove the completed operation after a short delay for the exit animation
      setTimeout(() => get().removeOperation(operationId), 400)

      // Notify any listeners (e.g. React Query invalidation)
      const { onOperationSuccess } = get()
      if (onOperationSuccess) {
        onOperationSuccess(operation)
      }
    } catch (error) {
      const isRateLimit = error instanceof RateLimitError
      console.error(
        `[OperationsStore] Failed: type=${operation.type}, id=${operationId}, error=${error.name}${isRateLimit ? ' (rate limited)' : ''}`
      )
      updateOperation(operationId, {
        status: 'error',
        error: error.message,
        rateLimited: isRateLimit,
      })
    }
  },

  /** Execute all pending review comments for a specific PR as a single review batch. */
  executeReviewBatch: async (repoFullName, prNumber) => {
    const { operations, updateOperation } = get()
    const reviewOps = operations.filter(
      (op) =>
        op.type === 'review_comment' &&
        op.status === 'pending' &&
        op.repo === repoFullName &&
        op.prNumber === Number(prNumber)
    )

    if (reviewOps.length === 0) return

    for (const op of reviewOps) {
      updateOperation(op.id, { status: 'executing' })
    }

    const [owner, repo] = repoFullName.split('/')

    const comments = reviewOps.map((op) => {
      const c = {
        path: op.path,
        line: op.line,
        side: 'RIGHT',
        body: op.body,
      }
      if (op.startLine) {
        c.start_line = op.startLine
        c.start_side = 'RIGHT'
      }
      return c
    })

    try {
      await apiFetch(
        `/api/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'COMMENT',
            comments,
          }),
        }
      )

      console.log(`[OperationsStore] Review batch succeeded: ${reviewOps.length} comment(s) on ${repoFullName}#${prNumber}`)
      for (const op of reviewOps) {
        updateOperation(op.id, { status: 'success' })
        setTimeout(() => get().removeOperation(op.id), 400)
      }

      const { onOperationSuccess } = get()
      if (onOperationSuccess) {
        onOperationSuccess(reviewOps[0])
      }
    } catch (error) {
      const isRateLimit = error instanceof RateLimitError
      console.error(`[OperationsStore] Review batch failed: ${repoFullName}#${prNumber}, error=${error.message}`)
      for (const op of reviewOps) {
        updateOperation(op.id, {
          status: 'error',
          error: error.message,
          rateLimited: isRateLimit,
        })
      }
    }
  },

  /** Execute all pending operations in sequence with a small delay between each. */
  executeAll: async () => {
    const pending = get().operations.filter((op) => op.status === 'pending')

    // Batch review comments by PR and submit as single reviews
    const reviewBatches = new Map()
    for (const op of pending) {
      if (op.type === 'review_comment') {
        const key = `${op.repo}#${op.prNumber}`
        if (!reviewBatches.has(key)) {
          reviewBatches.set(key, { repo: op.repo, prNumber: op.prNumber })
        }
      }
    }

    for (const [, { repo, prNumber }] of reviewBatches) {
      await get().executeReviewBatch(repo, prNumber)

      // Check if the batch was rate-limited — bail out
      const batchOps = get().operations.filter(
        (o) => o.type === 'review_comment' && o.repo === repo && o.prNumber === Number(prNumber)
      )
      if (batchOps.some((o) => o.rateLimited)) {
        console.warn('[OperationsStore] Rate limited — stopping remaining operations')
        return
      }

      await new Promise((r) => setTimeout(r, 500))
    }

    // Execute remaining non-review-comment operations
    const remaining = get().operations.filter(
      (op) => op.status === 'pending' && op.type !== 'review_comment'
    )
    for (let i = 0; i < remaining.length; i++) {
      const op = remaining[i]
      const current = get().operations.find((o) => o.id === op.id)
      if (current?.status !== 'pending') continue

      await get().executeOperation(op.id)

      // Check if this one was rate-limited — bail out
      const after = get().operations.find((o) => o.id === op.id)
      if (after?.rateLimited) {
        console.warn('[OperationsStore] Rate limited — stopping remaining operations')
        break
      }

      // Small delay between operations to stay under rate limits
      if (i < remaining.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  },

  /** Remove completed and failed operations. */
  clearCompleted: () => {
    set((state) => ({
      operations: state.operations.filter(
        (op) => op.status === 'pending' || op.status === 'executing'
      ),
    }))
  },

  /** Clear everything. */
  clearAll: () => set({ operations: [] }),

  // ── Selectors (plain functions that derive data) ──

  /** Get all pending operations targeting a specific issue. */
  getOperationsForIssue: (repoFullName, issueNumber) => {
    return get().operations.filter(
      (op) =>
        op.status === 'pending' &&
        op.repo === repoFullName &&
        op.issueNumber === Number(issueNumber)
    )
  },

  /** Get all pending review comments for a specific PR. */
  getReviewCommentsForPR: (repoFullName, prNumber) => {
    return get().operations.filter(
      (op) =>
        op.type === 'review_comment' &&
        op.status === 'pending' &&
        op.repo === repoFullName &&
        op.prNumber === Number(prNumber)
    )
  },

  /** Remove all pending review comments for a specific PR. */
  clearReviewComments: (repoFullName, prNumber) => {
    set((state) => ({
      operations: state.operations.filter(
        (op) =>
          !(
            op.type === 'review_comment' &&
            op.repo === repoFullName &&
            op.prNumber === Number(prNumber)
          )
      ),
    }))
  },
}))
