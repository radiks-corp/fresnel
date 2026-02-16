/**
 * GitHub Operations Type System
 * 
 * Discriminated union for all GitHub API operations that can be buffered.
 * This design makes it easy to add new operation types by extending the union.
 */

/**
 * @typedef {'pending' | 'executing' | 'success' | 'error'} OperationStatus
 */

/**
 * @typedef {Object} BaseOperation
 * @property {string} id - Unique identifier for the operation
 * @property {number} timestamp - When the operation was planned (ms since epoch)
 * @property {OperationStatus} status - Current status of the operation
 * @property {string} [error] - Error message if status is 'error'
 */

/**
 * @typedef {BaseOperation & {
 *   type: 'comment',
 *   repo: string,
 *   issueNumber: number,
 *   body: string
 * }} CommentOperation
 */

/**
 * @typedef {BaseOperation & {
 *   type: 'set_labels',
 *   repo: string,
 *   issueNumber: number,
 *   labels: string[]
 * }} SetLabelsOperation
 */

/**
 * @typedef {BaseOperation & {
 *   type: 'add_labels',
 *   repo: string,
 *   issueNumber: number,
 *   labels: string[]
 * }} AddLabelsOperation
 */

/**
 * Union type for all GitHub operations
 * @typedef {CommentOperation | SetLabelsOperation | AddLabelsOperation} GitHubOperation
 */

export {}
