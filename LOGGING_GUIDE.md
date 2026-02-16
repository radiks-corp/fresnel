# Logging Guide - Privacy & PII Protection

## Overview

This document describes the logging strategy for the GitHub Operations Buffer system and the broader application, with a focus on **preventing PII (Personally Identifiable Information) and sensitive data from being logged**.

## Logging Principles

### ✅ DO Log:
- Operation types (e.g., "comment", "set_labels", "add_labels")
- Operation IDs (UUIDs)
- Success/failure status
- Error types/names (e.g., "TypeError", "NetworkError")
- Counts and metrics (e.g., message count, token counts, file counts)
- Context types (e.g., "PR-level", "repo-level")
- Timing information
- Tool names being called

### ❌ DO NOT Log:
- Repository names (owner/repo)
- Issue or PR numbers
- PR titles or descriptions
- Comment bodies or content
- Label names
- File paths or filenames
- User names or IDs
- Diff content
- Any user-generated content
- GitHub API tokens

## Frontend Logging

### Operations Buffer (`src/hooks/useOperationsBuffer.js`)

**When operations are added:**
```javascript
console.log(`[OperationsBuffer] Operation added: type=${op.type}, id=${op.id}`)
```

**When operations start executing:**
```javascript
console.log(`[OperationsBuffer] Executing operation: type=${operation.type}, id=${operationId}`)
```

**When operations succeed:**
```javascript
console.log(`[OperationsBuffer] Operation succeeded: type=${operation.type}, id=${operationId}`)
```

**When operations fail:**
```javascript
console.error(`[OperationsBuffer] Operation failed: type=${operation.type}, id=${operationId}, error=${error.name}`)
```

### Tool Calls (`src/components/UnifiedReview.jsx`)

**When tool calls are received:**
```javascript
console.log(`[UnifiedReview] Tool call received: tool=planGitHubOperation, operationType=${toolCall.input.operationType}`)
```

**When tool calls succeed:**
```javascript
console.log(`[UnifiedReview] Tool call succeeded: tool=planGitHubOperation, operationId=${operation.id}`)
```

**When tool calls fail:**
```javascript
console.error(`[UnifiedReview] Tool call failed: tool=planGitHubOperation, error=${error.name}`)
```

## Backend Logging

### Chat Requests (`backend/src/index.ts`)

**Request received:**
```javascript
console.log('=== Chat Request ===')
console.log('Messages count:', messages?.length)
console.log('Context type:', hasPR ? 'PR-level' : 'repo-level')
```

**Data loaded:**
```javascript
console.log('PR data loaded:', !!prDetails)
console.log('Diff length:', diff?.length || 0)
console.log('Parsed diff files:', diffFiles.length)
```

**Token counts:**
```javascript
console.log(`PR context: ${tokenCount} tokens (truncated from ${originalTokenCount} tokens)`)
console.log(`Diff context: ${diffTokenCount} tokens (truncated from ${originalTokenCount} tokens)`)
```

### Review Requests

**Request received:**
```javascript
console.log('=== Review Request ===')
console.log('Lens:', lens)
console.log('Has instructions:', !!instructions)
console.log('Context type: PR-level')
```

**Review comments created:**
```javascript
console.log('[Tool] create_comment called: severity=' + comment.severity)
```

### Tool Calls (Backend)

**Tool registration:**
```javascript
console.log('[Tools] Registered tools:', Object.keys(chatTools).join(', '))
```

**read_file tool:**
```javascript
console.log('[Tool] read_file called: page=' + page)
console.log('[Tool] read_file succeeded: total_pages=' + totalPages)
console.log('[Tool] read_file failed: file not found')
```

**list_files tool:**
```javascript
console.log('[Tool] list_files called: has_filter=' + !!filter)
console.log('[Tool] list_files succeeded: total_files=' + files.length)
```

**search_issues tool:**
```javascript
console.log('[Tool] search_issues called')
console.log('[Tool] search_issues succeeded: total_count=' + data.total_count)
console.log('[Tool] search_issues failed: status=' + searchRes.status)
```

**planGitHubOperation tool:**
- This is a **client-side tool** with no execute function on the backend
- The backend only provides the schema
- Frontend logs the actual execution (see Frontend Logging section)
- Backend logs when it's registered in the tools list

## Example Log Output

### Chat Request with Tool Calls (Backend)

```
=== Chat Request ===
Messages count: 1
Context type: repo-level
[Tools] Registered tools: read_file, list_files, search_issues, planGitHubOperation
[Tool] search_issues called
[Tool] search_issues succeeded: total_count=5
[Tool] read_file called: page=1
[Tool] read_file succeeded: total_pages=3
```

### Operations Buffer Flow (Frontend)

**Successful Operation:**
```
[UnifiedReview] Tool call received: tool=planGitHubOperation, operationType=comment
[OperationsBuffer] Operation added: type=comment, id=a1b2c3d4-...
[UnifiedReview] Tool call succeeded: tool=planGitHubOperation, operationId=a1b2c3d4-...
[OperationsBuffer] Executing operation: type=comment, id=a1b2c3d4-...
[OperationsBuffer] Operation succeeded: type=comment, id=a1b2c3d4-...
```

**Failed Operation:**
```
[UnifiedReview] Tool call received: tool=planGitHubOperation, operationType=set_labels
[OperationsBuffer] Operation added: type=set_labels, id=e5f6g7h8-...
[UnifiedReview] Tool call succeeded: tool=planGitHubOperation, operationId=e5f6g7h8-...
[OperationsBuffer] Executing operation: type=set_labels, id=e5f6g7h8-...
[OperationsBuffer] Operation failed: type=set_labels, id=e5f6g7h8-..., error=Error
```

### Review Mode (Backend)

```
=== Review Request ===
Lens: security
Has instructions: true
Context type: PR-level
PR data loaded: true
Diff length: 5432
Parsed diff files: 3
[Tool] list_files called: has_filter=false
[Tool] list_files succeeded: total_files=3
[Tool] read_file called: page=1
[Tool] read_file succeeded: total_pages=2
[Tool] create_comment called: severity=high
[Tool] create_comment called: severity=medium
```

## Privacy Audit Checklist

When adding new logging statements, verify:

- [ ] No repository names or paths
- [ ] No issue/PR numbers
- [ ] No user names or IDs
- [ ] No content (titles, descriptions, comments, code)
- [ ] No GitHub tokens or credentials
- [ ] Only metadata (types, IDs, counts, status)

## Monitoring & Debugging

### What can be monitored with these logs:

1. **Operation success/failure rates** - Count how many operations succeed vs fail
2. **Error types** - Identify common error patterns without exposing data
3. **Operation types distribution** - See which operation types are most used
4. **Tool call patterns** - Understand AI agent tool usage
5. **Performance metrics** - Token counts, processing times, file counts

### What CANNOT be monitored (by design):

1. Specific repositories being accessed
2. Specific issues or PRs being modified
3. Content of operations (comments, labels, etc.)
4. User identities
5. Project-specific details

## Compliance

These logging practices align with:
- GDPR requirements for data minimization
- SOC 2 requirements for access logging without PII
- General privacy best practices for SaaS applications

## Updates

When adding new features:
1. Review all `console.log` and `console.error` statements
2. Ensure no PII is logged
3. Update this guide with new logging patterns
4. Test logs in development to verify no sensitive data appears
