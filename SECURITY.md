# Security Documentation

## Injection Attack Prevention

### Vulnerability Fixed: Route Parameter Injection

**Issue**: Route parameters (`owner`, `repo`, `pull_number`) from Express routes were being used directly in GitHub API URLs without validation, creating potential injection vulnerabilities.

**Example of the vulnerability:**
```typescript
// BEFORE (Vulnerable):
const { owner, repo } = req.params
fetch(`https://api.github.com/repos/${owner}/${repo}/issues`)
// Attacker could inject: owner = "../../malicious/repo"
```

### Solution Implemented

**1. Validation Function** (`validateGitHubIdentifier`)

```typescript
function validateGitHubIdentifier(value: string, fieldName: string): string {
  if (!value) {
    throw new Error(`${fieldName} is required`)
  }
  
  // GitHub allows: alphanumeric, hyphens, underscores, periods
  const validPattern = /^[a-zA-Z0-9._-]+$/
  
  if (!validPattern.test(value)) {
    throw new Error(`Invalid ${fieldName}: contains disallowed characters`)
  }
  
  if (value.length > 100) {
    throw new Error(`${fieldName} is too long`)
  }
  
  return value
}
```

**2. Applied to All Endpoints**

Every endpoint that accepts `owner`, `repo`, or `pull_number` now validates these parameters:

- ✅ `GET /api/repos/:owner/:repo/pulls`
- ✅ `GET /api/repos/:owner/:repo/pulls/:pull_number/diff`
- ✅ `GET /api/repos/:owner/:repo/pulls/:pull_number`
- ✅ `GET /api/repos/:owner/:repo/pulls/:pull_number/timeline`
- ✅ `POST /api/repos/:owner/:repo/chat`
- ✅ `POST /api/repos/:owner/:repo/pulls/:pull_number/chat`
- ✅ `POST /api/repos/:owner/:repo/pulls/:pull_number/review`
- ✅ `POST /api/repos/:owner/:repo/pulls/:pull_number/review/summarize`

**Example validation:**
```typescript
try {
  validateGitHubIdentifier(owner, 'owner')
  validateGitHubIdentifier(repo, 'repo')
  if (pull_number && !/^\d+$/.test(pull_number)) {
    return res.status(400).json({ error: 'Invalid pull request number' })
  }
} catch (error: any) {
  return res.status(400).json({ error: error.message })
}
```

### Protected vs Unprotected URL Construction

**✅ SAFE - Query Parameters with URLSearchParams:**
```typescript
const params = new URLSearchParams({ state, sort, direction })
fetch(`https://api.github.com/repos/${owner}/${repo}/issues?${params}`)
// URLSearchParams automatically encodes values
```

**✅ SAFE - encodeURIComponent on entire string:**
```typescript
const searchQuery = encodeURIComponent(`${query} repo:${owner}/${repo}`)
fetch(`https://api.github.com/search/issues?q=${searchQuery}`)
// Entire string including owner/repo is encoded
```

**❌ VULNERABLE (Now Fixed) - Direct interpolation:**
```typescript
fetch(`https://api.github.com/repos/${owner}/${repo}/issues`)
// owner/repo not validated or encoded
// NOW FIXED: Validated before use
```

### Number Validation

Pull request and issue numbers are validated to be digits only:
```typescript
if (!/^\d+$/.test(pull_number)) {
  return res.status(400).json({ error: 'Invalid pull request number' })
}
```

## Other Security Measures

### 1. Authentication
- All API endpoints require `Bearer` token authentication
- Tokens are validated on every request
- No token = 401 Unauthorized

### 2. PII Protection in Logs
- No repository names, issue numbers, or user content logged
- Only metadata logged (types, counts, status codes)
- See [LOGGING_GUIDE.md](LOGGING_GUIDE.md) for details

### 3. Rate Limiting Awareness
- Tools designed to minimize API calls
- `list_issues` preferred over `search_issues` (lower rate limits)
- Proper error handling for rate limit responses

### 4. Input Validation
- Zod schemas validate all tool inputs
- Array bounds checked (max 100 per page, etc.)
- String lengths validated

## Attack Scenarios Prevented

### Scenario 1: Path Traversal
**Attack**: `GET /api/repos/../../evil/repo/pulls`  
**Defense**: Validation rejects `../` and other special characters

### Scenario 2: Repository Hijacking
**Attack**: `GET /api/repos/victim-org/victim-repo?attacker-param/pulls`  
**Defense**: Validation rejects `?` and other URL-breaking characters

### Scenario 3: Numeric Injection
**Attack**: `GET /api/repos/owner/repo/pulls/123;DROP TABLE`  
**Defense**: Pull numbers validated to be digits only

## Testing Security

To verify protections are working:

```bash
# Should fail with 400 Bad Request:
curl http://localhost:3001/api/repos/../evil/repo/pulls \
  -H "Authorization: Bearer token"

# Should fail with 400 Bad Request:
curl http://localhost:3001/api/repos/owner/repo/pulls/abc \
  -H "Authorization: Bearer token"

# Should succeed (valid identifiers):
curl http://localhost:3001/api/repos/facebook/react/pulls \
  -H "Authorization: Bearer token"
```

## Recommendations

### Current Protection Level: ✅ Good

- All route parameters validated
- Pattern matching prevents injection
- Length limits prevent abuse

### Future Enhancements (Optional):

1. **Rate limiting per user** - Add express-rate-limit middleware
2. **Request size limits** - Already handled by express.json()
3. **CORS strictness** - Consider specific origin validation in production
4. **API token scoping** - Validate GitHub token has required permissions
5. **Audit logging** - Log security events (invalid params, auth failures)

## Responsible Disclosure

If you discover a security vulnerability:
1. Do NOT open a public GitHub issue
2. Email security concerns privately
3. Provide details about the vulnerability
4. Allow time for patching before public disclosure

## Security Checklist for New Endpoints

When adding new endpoints that accept route parameters:

- [ ] Add `validateGitHubIdentifier()` for owner/repo params
- [ ] Validate numeric IDs with `/^\d+$/` regex
- [ ] Use URLSearchParams or encodeURIComponent for query params
- [ ] Add authentication check
- [ ] Avoid logging sensitive data
- [ ] Handle errors gracefully without leaking info
