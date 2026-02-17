# GitHub Operations Buffer - Testing Guide

## Implementation Summary

The GitHub Operations Buffer system has been successfully implemented with the following components:

### Files Created

1. **`src/types/githubOperations.js`** - Type definitions for operation objects
2. **`src/hooks/useOperationsBuffer.js`** - React hook for managing operation state and execution
3. **`src/components/OperationsBuffer.jsx`** - UI component for displaying operations
4. **Backend tool added to `backend/src/index.ts`** - `plan_operation` client-side tool

### Integration Points

- **UnifiedReview component** (`src/components/UnifiedReview.jsx`) has been updated with:
  - Import of the operations buffer hook and component
  - `useOperationsBuffer()` hook initialization
  - `onToolCall` handler for intercepting `plan_operation` tool calls
  - `addToolOutput` to send results back to the AI
  - `<OperationsBuffer />` component rendered above chat messages (Ask mode only)

## How to Test

### Prerequisites

1. Start the backend server: `cd backend && npm start`
2. Start the frontend: `npm run dev`
3. Ensure you have a valid GitHub token configured

### Test Scenario 1: Add Comment Operation

1. Navigate to a repository in Ask mode (not Review mode)
2. Select an issue or PR
3. Ask the AI: "Add a comment to issue #123 saying 'This looks good'"
4. The AI should call the `plan_operation` tool
5. **Expected Result**: A new operation appears above the chatbox showing:
   - Type: Comment on owner/repo#123
   - Body: "This looks good"
   - Status: pending (with blue dot)
   - Execute button

### Test Scenario 2: Add Labels Operation

1. In Ask mode, ask: "Mark issue #456 as duplicate"
2. The AI should call `plan_operation` with type `set_labels` or `add_labels`
3. **Expected Result**: Operation appears showing:
   - Type: Set/Add labels on owner/repo#456
   - Labels: [duplicate]
   - Status: pending

### Test Scenario 3: Execute Single Operation

1. After creating an operation (see scenarios above)
2. Click the "Execute" button on the operation
3. **Expected Result**:
   - Status changes to "executing" (spinning icon)
   - Then changes to "success" (green checkmark) or "error" (red X)
   - If successful, the GitHub API call was made
   - If error, error message appears below the operation

### Test Scenario 4: Execute All Operations

1. Create multiple operations using different AI prompts
2. Click "Execute All (N)" button at the top
3. **Expected Result**:
   - All pending operations execute sequentially
   - Each operation's status updates as it completes
   - Success/error states are shown for each

### Test Scenario 5: Clear Operations

1. After some operations are completed/failed
2. Click "Clear Completed" to remove only completed/failed operations
3. Or click "Clear All" to remove all operations
4. **Expected Result**: Operations are removed from the buffer

### Test Scenario 6: Error Handling

1. Create an operation with invalid data (e.g., non-existent issue number)
2. Execute the operation
3. **Expected Result**:
   - Status changes to "error"
   - Error message is displayed below the operation
   - Message format: "Error: GitHub API error 404" or similar

### Test Scenario 7: Multiple Operation Types

1. Ask the AI to perform multiple actions in one prompt:
   "Add a comment to issue #1 saying 'LGTM' and mark it as duplicate"
2. **Expected Result**:
   - Two operations appear in the buffer
   - One for the comment
   - One for the label change
   - Each can be executed individually

## Verification Checklist

- [ ] Operations appear in the buffer when AI calls `plan_operation`
- [ ] Operations show correct type, repo, issue number, and details
- [ ] Individual execute button works
- [ ] "Execute All" button executes all pending operations
- [ ] Status transitions work: pending → executing → success/error
- [ ] Success state shows green checkmark
- [ ] Error state shows red X and error message
- [ ] "Clear Completed" removes only completed/failed operations
- [ ] "Clear All" removes all operations
- [ ] Operations only appear in Ask mode (not Review mode)
- [ ] Operations are in-memory (cleared on page refresh)
- [ ] No console errors during operation lifecycle

## Known Limitations

1. **In-memory only**: Operations don't persist across page refreshes
2. **Ask mode only**: Operations buffer is only shown in Ask mode, not Review mode
3. **Sequential execution**: "Execute All" runs operations one at a time, not in parallel
4. **No editing**: Operations cannot be edited after creation (would need to create a new one)

## Extending the System

To add new operation types (e.g., `close_issue`, `assign_user`):

1. Add the type to `src/types/githubOperations.js`
2. Add a case in `executeOperation` switch statement in `useOperationsBuffer.js`
3. Update the `plan_operation` tool schema in `backend/src/index.ts`
4. Update the UI rendering in `OperationsBuffer.jsx` `getOperationTitle` and `getOperationDetails`

## Troubleshooting

**Operations not appearing?**
- Check browser console for errors
- Verify the AI is calling the `plan_operation` tool (check network tab)
- Ensure you're in Ask mode, not Review mode

**Execute fails?**
- Check that you have a valid GitHub token
- Verify the repo/issue numbers are correct
- Check browser console for API errors
- Ensure the GitHub API rate limit hasn't been exceeded

**UI not rendering?**
- Check that all imports are correct in UnifiedReview.jsx
- Verify the OperationsBuffer component is being rendered
- Check for any React errors in the console
