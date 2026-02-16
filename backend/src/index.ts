// IMPORTANT: Import instrument.ts at the very top
import './instrument.js'
import { Sentry } from './instrument.js'

import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import { getTokenizer } from '@anthropic-ai/tokenizer'
import { z } from 'zod'

dotenv.config()

// Initialize Anthropic tokenizer for token counting
const anthropicTokenizer = getTokenizer()

/**
 * Truncate text to a maximum number of tokens using Anthropic tokenizer
 * @param text The text to truncate
 * @param maxTokens Maximum number of tokens to keep
 * @returns Truncated text
 */
function truncateToTokens(text: string, maxTokens: number): string {
  if (!text) return ''
  
  const tokens = Array.from(anthropicTokenizer.encode(text))
  
  if (tokens.length <= maxTokens) {
    return text
  }
  
  // Truncate tokens and decode back to text
  const truncatedTokens = tokens.slice(0, maxTokens)
  const decoder = new TextDecoder()
  return decoder.decode(anthropicTokenizer.decode(Uint32Array.from(truncatedTokens)))
}

/**
 * Count tokens in text using Anthropic tokenizer
 * @param text The text to count tokens for
 * @returns Number of tokens
 */
function countTokens(text: string): number {
  if (!text) return 0
  return Array.from(anthropicTokenizer.encode(text)).length
}

const app = express()
const PORT = process.env.PORT || 3001
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fresnel'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

/**
 * Validate and sanitize GitHub owner/repo names to prevent injection attacks
 * GitHub usernames/orgs and repo names can only contain alphanumeric, hyphens, underscores, and periods
 * @param value The owner or repo name to validate
 * @param fieldName The field name for error messages
 * @returns Sanitized value
 * @throws Error if validation fails
 */
function validateGitHubIdentifier(value: string, fieldName: string): string {
  if (!value) {
    throw new Error(`${fieldName} is required`)
  }
  
  // GitHub allows: alphanumeric, hyphens, underscores, periods
  // Reject anything else to prevent injection attacks
  const validPattern = /^[a-zA-Z0-9._-]+$/
  
  if (!validPattern.test(value)) {
    throw new Error(`Invalid ${fieldName}: contains disallowed characters`)
  }
  
  // Additional length checks (GitHub limits)
  if (value.length > 100) {
    throw new Error(`${fieldName} is too long`)
  }
  
  return value
}

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}))
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
})

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'Fresnel API' })
})

// Get current user (validate token)
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.slice(7)

  try {
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    res.json(userData)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Get user's repositories
app.get('/api/repos', async (req, res) => {
  const authHeader = req.headers.authorization
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.slice(7)

  try {
    const reposResponse = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (!reposResponse.ok) {
      return res.status(401).json({ error: 'Failed to fetch repos' })
    }

    const repos = await reposResponse.json()
    res.json(repos)
  } catch (error) {
    console.error('Failed to fetch repos:', error)
    res.status(500).json({ error: 'Failed to fetch repositories' })
  }
})

// Search inbox issues (server-side filtering via GitHub Search API)
app.get('/api/inbox/issues', async (req, res) => {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.slice(7)
  const repos = (req.query.repos as string) || ''
  const q = (req.query.q as string) || ''

  if (!repos) {
    return res.json([])
  }

  try {
    // Build repo filter: repo:owner/name+repo:owner2/name2
    const repoFilter = repos.split(',').map(r => `repo:${r}`).join('+')
    let searchQuery = `${repoFilter}+type:issue+state:open`

    if (q.trim()) {
      searchQuery = `${encodeURIComponent(q.trim())}+${searchQuery}`
    }

    const searchRes = await fetch(
      `https://api.github.com/search/issues?q=${searchQuery}&per_page=100&sort=updated`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!searchRes.ok) {
      return res.status(searchRes.status).json({ error: 'GitHub search failed' })
    }

    const data = await searchRes.json() as any
    res.json(data.items || [])
  } catch (error) {
    console.error('Failed to search inbox issues:', error)
    res.status(500).json({ error: 'Failed to search issues' })
  }
})

// Search inbox pull requests (server-side filtering via GitHub Search API)
app.get('/api/inbox/pulls', async (req, res) => {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.slice(7)
  const repos = (req.query.repos as string) || ''
  const username = (req.query.username as string) || ''
  const q = (req.query.q as string) || ''

  if (!repos || !username) {
    return res.json([])
  }

  try {
    const repoFilter = repos.split(',').map(r => `repo:${r}`).join('+')
    let searchQuery = `${repoFilter}+type:pr+state:open+review-requested:${username}+-is:draft`

    if (q.trim()) {
      searchQuery = `${encodeURIComponent(q.trim())}+${searchQuery}`
    }

    const searchRes = await fetch(
      `https://api.github.com/search/issues?q=${searchQuery}&per_page=100&sort=updated`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!searchRes.ok) {
      return res.status(searchRes.status).json({ error: 'GitHub search failed' })
    }

    const data = await searchRes.json() as any
    const items = data.items || []

    // Fetch full PR objects in parallel to get base/head refs for stack detection
    const fullPRs = await Promise.all(
      items.map(async (item: any) => {
        try {
          const prRes = await fetch(item.pull_request.url, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          })
          if (prRes.ok) return await prRes.json()
          return item
        } catch {
          return item
        }
      })
    )

    res.json(fullPRs)
  } catch (error) {
    console.error('Failed to search inbox pulls:', error)
    res.status(500).json({ error: 'Failed to search pull requests' })
  }
})

// Get pull requests for a repository
app.get('/api/repos/:owner/:repo/pulls', async (req, res) => {
  const authHeader = req.headers.authorization
  const { owner, repo } = req.params
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Validate route params
  try {
    validateGitHubIdentifier(owner, 'owner')
    validateGitHubIdentifier(repo, 'repo')
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }

  const token = authHeader.slice(7)

  try {
    const prsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (!prsResponse.ok) {
      return res.status(prsResponse.status).json({ error: 'Failed to fetch PRs' })
    }

    const prs = await prsResponse.json()
    res.json(prs)
  } catch (error) {
    console.error('Failed to fetch PRs:', error)
    res.status(500).json({ error: 'Failed to fetch pull requests' })
  }
})

// Get diff for a pull request
app.get('/api/repos/:owner/:repo/pulls/:pull_number/diff', async (req, res) => {
  const authHeader = req.headers.authorization
  const { owner, repo, pull_number } = req.params
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Validate route params
  try {
    validateGitHubIdentifier(owner, 'owner')
    validateGitHubIdentifier(repo, 'repo')
    if (!/^\d+$/.test(pull_number)) {
      return res.status(400).json({ error: 'Invalid pull request number' })
    }
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }

  const token = authHeader.slice(7)

  try {
    const diffResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3.diff',
      },
    })

    if (!diffResponse.ok) {
      return res.status(diffResponse.status).json({ error: 'Failed to fetch diff' })
    }

    const diff = await diffResponse.text()
    res.type('text/plain').send(diff)
  } catch (error) {
    console.error('Failed to fetch diff:', error)
    res.status(500).json({ error: 'Failed to fetch diff' })
  }
})

// Get PR details (including body/description)
app.get('/api/repos/:owner/:repo/pulls/:pull_number', async (req, res) => {
  const authHeader = req.headers.authorization
  const { owner, repo, pull_number } = req.params
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Validate route params
  try {
    validateGitHubIdentifier(owner, 'owner')
    validateGitHubIdentifier(repo, 'repo')
    if (!/^\d+$/.test(pull_number)) {
      return res.status(400).json({ error: 'Invalid pull request number' })
    }
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }

  const token = authHeader.slice(7)

  try {
    const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (!prResponse.ok) {
      return res.status(prResponse.status).json({ error: 'Failed to fetch PR details' })
    }

    const pr = await prResponse.json()
    res.json(pr)
  } catch (error) {
    console.error('Failed to fetch PR details:', error)
    res.status(500).json({ error: 'Failed to fetch PR details' })
  }
})

/**
 * Parse a unified diff into file sections
 */
function parseDiffToFiles(diff: string): { filename: string; content: string; additions: number; deletions: number }[] {
  if (!diff) return []
  
  const files: { filename: string; content: string; additions: number; deletions: number }[] = []
  const fileSections = diff.split(/^diff --git /gm).filter(Boolean)
  
  for (const section of fileSections) {
    const lines = section.split('\n')
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue
    
    const filename = headerMatch[2]
    const content = 'diff --git ' + section
    
    // Count additions and deletions
    let additions = 0
    let deletions = 0
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }
    
    files.push({ filename, content, additions, deletions })
  }
  
  return files
}

/**
 * Build a summary of changed files
 */
function buildFilesSummary(files: { filename: string; additions: number; deletions: number }[]): string {
  if (files.length === 0) return ''
  
  const lines = ['## Files Changed', '']
  for (const file of files) {
    lines.push(`- \`${file.filename}\` (+${file.additions}, -${file.deletions})`)
  }
  return lines.join('\n')
}

// Shared chat handler — works with or without a PR
async function handleChat(req: any, res: any) {
  const authHeader = req.headers.authorization
  const { owner, repo, pull_number } = req.params
  const { messages } = req.body

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.slice(7)

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' })
  }

  // Validate route params to prevent injection attacks
  try {
    validateGitHubIdentifier(owner, 'owner')
    validateGitHubIdentifier(repo, 'repo')
    if (pull_number && !/^\d+$/.test(pull_number)) {
      return res.status(400).json({ error: 'Invalid pull request number' })
    }
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }

  const hasPR = !!pull_number

  // Debug logging
  console.log('=== Chat Request ===')
  console.log('Messages count:', messages?.length)
  console.log('Context type:', hasPR ? 'PR-level' : 'repo-level')

  // Fetch PR details and diff from GitHub (only when a PR is specified)
  let prDetails: any = null
  let diff = ''

  if (hasPR) {
    try {
      // Fetch PR details
      const prRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      )
      if (prRes.ok) {
        prDetails = await prRes.json()
      }

      // Fetch diff
      const diffRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3.diff',
          },
        }
      )
      if (diffRes.ok) {
        diff = await diffRes.text()
      }
    } catch (error) {
      console.error('Error fetching PR data:', error)
    }

    console.log('PR data loaded:', !!prDetails)
    console.log('Diff length:', diff?.length || 0)
  }

  // Parse diff into files (empty when no PR)
  const diffFiles = parseDiffToFiles(diff || '')
  if (hasPR) console.log('Parsed diff files:', diffFiles.length)

  // Build system prompt — different depending on whether we have a PR
  let systemPrompt: string

  if (hasPR) {
    systemPrompt = `You are Fresnel, an AI code review assistant. You help developers understand code, review pull requests, and answer questions about their codebase.

## Important Guidelines

1. **Use your tools relentlessly to get a complete view.** You have access to \`read_file\`, \`list_files\`, and \`search_issues\` tools. Use them extensively to examine code and find information. Never make assumptions or give up early—keep calling tools with different queries and approaches until you have thoroughly investigated the question. Use tools to discover missing details instead of speculating.

2. **Be thorough and persistent.** When searching for information, try multiple approaches:
   - For duplicates: Don't just search for "duplicate" labels—actually search for issues with similar topics and compare them
   - For related issues: Try multiple relevant keywords and search terms
   - For code questions: Read multiple related files to understand the full context
   Go above and beyond to create a fully comprehensive answer.

3. **Reference specific findings.** Cite specific files, functions, line changes, or issue numbers when explaining what you found.

4. **Focus on practical advice.** Highlight potential issues, suggest improvements, and explain the impact of changes.

5. **Structure your responses clearly.** Use headings and bullet points to organize information about different files and changes.

## Available Tools

- \`list_files\`: List all changed files with addition/deletion counts. Pass an empty string for filter to see all files.
- \`read_file\`: Read the diff content for a specific file. Use page=1 to start, and increment for large files.
- \`list_issues\`: **Use this first!** List all issues/PRs efficiently (100 per page). Much faster than search for getting all issues. Supports filtering by state, labels, etc.
- \`get_issue\`: Get full details for a specific issue by number. No rate limits.
- \`search_issues\`: **Use sparingly!** Has low rate limits (10/min). Only use for complex full-text searches that list_issues can't handle.
- \`planGitHubOperation\`: Plan GitHub API operations (comments, labels, etc.) to be executed later by the user. Use this when the user asks you to perform GitHub actions like adding comments, changing labels, or closing issues. The user will review and execute these operations when ready.

**Important**: When exploring issues, ALWAYS use \`list_issues\` first to get all issues, then analyze them locally. Only use \`search_issues\` if you need complex full-text search.`

    // Add PR context (truncated to 300 tokens)
    if (prDetails) {
      let contextText = ''
      if (prDetails.title) contextText += `PR Title: ${prDetails.title}\n`
      contextText += `Repository: ${owner}/${repo} #${pull_number}\n`
      if (prDetails.body) contextText += `\nPR Description:\n${prDetails.body}`

      const truncatedContext = truncateToTokens(contextText, 300)
      const tokenCount = countTokens(truncatedContext)
      
      console.log(`PR context: ${tokenCount} tokens (truncated from ${countTokens(contextText)} tokens)`)

      if (truncatedContext) {
        systemPrompt += `\n\n## Pull Request Info (${tokenCount} tokens)\n${truncatedContext}`
      }
    }

    // Add files summary
    if (diffFiles.length > 0) {
      const filesSummary = buildFilesSummary(diffFiles)
      systemPrompt += `\n\n${filesSummary}`
    }

    // Add truncated diff context (up to 10,000 tokens)
    if (diff) {
      const truncatedDiff = truncateToTokens(diff, 10000)
      const diffTokenCount = countTokens(truncatedDiff)
      const originalTokenCount = countTokens(diff)
      
      console.log(`Diff context: ${diffTokenCount} tokens (truncated from ${originalTokenCount} tokens)`)
      
      systemPrompt += `\n\n## Code Changes (${diffTokenCount} tokens, ${diffFiles.length} files)\n\`\`\`diff\n${truncatedDiff}\n\`\`\``
      
      if (originalTokenCount > 10000) {
        systemPrompt += `\n\n*Note: The diff was truncated. Use the read_file tool to view specific files in full.*`
      }
    }
  } else {
    // Repo-level chat — no PR context
    systemPrompt = `You are Fresnel, an AI assistant for the **${owner}/${repo}** repository. You help developers explore the repo, find issues, understand project history, and answer general questions.

## Important Guidelines

1. **Use your tools efficiently.** You have access to \`list_issues\`, \`get_issue\`, and \`search_issues\`. Be strategic:
   - **ALWAYS start with \`list_issues\`** to get all issues in 1-2 calls (100 per page)
   - Analyze the results locally to find what you need
   - Use \`get_issue\` if you need full details for specific issues
   - Only use \`search_issues\` for complex full-text searches (it has low rate limits!)
   - For tasks like finding duplicates: Get all issues with \`list_issues\`, then compare titles/descriptions locally

2. **Be thorough and persistent.** When answering questions:
   - Use \`list_issues\` with appropriate filters (state, labels, etc.)
   - Analyze all results in memory rather than making repeated API calls
   - If you need more issues, use pagination (page=2, page=3, etc.)
   - Go above and beyond to provide complete, well-researched answers

3. **Be helpful and conversational.** Provide specific findings with issue numbers, dates, and relevant details.

4. **Structure your responses clearly.** Use headings and bullet points to organize information from your research.

## Available Tools

- \`list_issues\`: **Use this first!** List all issues/PRs efficiently (100 per page, paginated). Much faster and has higher rate limits than search. Supports filtering by state, labels, sort order, etc.
- \`get_issue\`: Get full details for a specific issue by number. No rate limits. Use this when you need complete details about a specific issue.
- \`search_issues\`: **Use sparingly!** Has low rate limits (10/min). Only use for complex full-text searches that list_issues can't handle.
- \`planGitHubOperation\`: Plan GitHub API operations (comments, labels, etc.) to be executed later by the user. Use this when the user asks you to perform GitHub actions like adding comments, changing labels, or closing issues. The user will review and execute these operations when ready.

**Important**: When exploring issues, ALWAYS use \`list_issues\` first to get all issues, then analyze them locally. Only use \`search_issues\` if you need complex full-text search that requires the query syntax.

## Context

Repository: ${owner}/${repo}`
  }

  // Build tools — PR-specific tools only when a PR is present
  const chatTools: Record<string, any> = {}

  if (hasPR) {
    chatTools.read_file = tool({
      description: 'Read the diff content for a specific file from the PR. Use this to examine code changes in detail. Supports pagination for large files.',
      inputSchema: z.object({
        filename: z.string().describe('The filename to read (e.g., "src/components/Button.tsx")'),
        page: z.number().describe('Page number (1-indexed). Each page contains ~100 lines.'),
      }),
      execute: async ({ filename, page }) => {
        console.log('[Tool] read_file called: page=' + page)
        
        const file = diffFiles.find(f => f.filename === filename || f.filename.endsWith(filename))
        
        if (!file) {
          console.log('[Tool] read_file failed: file not found')
          const availableFiles = diffFiles.map(f => f.filename).join(', ')
          return { 
            error: `File "${filename}" not found in this PR.`,
            available_files: availableFiles || 'No files in diff'
          }
        }
        
        const lines = file.content.split('\n')
        const linesPerPage = 100
        const totalPages = Math.ceil(lines.length / linesPerPage)
        const startLine = (page - 1) * linesPerPage
        const endLine = Math.min(startLine + linesPerPage, lines.length)
        
        const pageContent = lines.slice(startLine, endLine).join('\n')
        
        console.log('[Tool] read_file succeeded: total_pages=' + totalPages)
        return {
          filename: file.filename,
          page,
          total_pages: totalPages,
          total_lines: lines.length,
          lines_shown: `${startLine + 1}-${endLine}`,
          content: pageContent,
          has_more: page < totalPages,
        }
      },
    })

    chatTools.list_files = tool({
      description: 'List all files changed in this PR with their addition/deletion counts.',
      inputSchema: z.object({
        filter: z.string().describe('Filter string to match filenames (e.g., ".ts" or "src/"). Use empty string to list all files.'),
      }),
      execute: async ({ filter }) => {
        console.log('[Tool] list_files called: has_filter=' + !!filter)
        
        let files = diffFiles
        if (filter) {
          files = files.filter(f => f.filename.includes(filter))
        }
        
        console.log('[Tool] list_files succeeded: total_files=' + files.length)
        return {
          total_files: files.length,
          files: files.map(f => ({
            filename: f.filename,
            additions: f.additions || 0,
            deletions: f.deletions || 0,
          })),
        }
      },
    })
  }

  // list_issues - more efficient for listing all issues (higher rate limits than search)
  chatTools.list_issues = tool({
    description: 'List all issues and PRs in the repository. More efficient than search for getting all issues. Use this first to get a complete list, then analyze locally. Supports filtering by state, labels, sort order, etc.',
    inputSchema: z.object({
      state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by state. Defaults to "open"'),
      labels: z.string().optional().describe('Comma-separated list of label names to filter by (e.g., "bug,help wanted")'),
      sort: z.enum(['created', 'updated', 'comments']).optional().describe('What to sort by. Defaults to "created"'),
      direction: z.enum(['asc', 'desc']).optional().describe('Sort direction. Defaults to "desc"'),
      per_page: z.number().optional().describe('Results per page (max 100). Defaults to 100'),
      page: z.number().optional().describe('Page number. Defaults to 1'),
    }),
    execute: async ({ state = 'open', labels, sort = 'created', direction = 'desc', per_page = 100, page = 1 }) => {
      console.log('[Tool] list_issues called: state=' + state + ', page=' + page)
      
      try {
        const params = new URLSearchParams({
          state,
          sort,
          direction,
          per_page: String(Math.min(per_page, 100)),
          page: String(page),
        })
        
        if (labels) {
          params.append('labels', labels)
        }
        
        const issuesRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues?${params}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        )

        if (!issuesRes.ok) {
          console.log('[Tool] list_issues failed: status=' + issuesRes.status)
          return { error: `GitHub API error: ${issuesRes.status}` }
        }

        const issues = await issuesRes.json() as any[]
        
        console.log('[Tool] list_issues succeeded: count=' + issues.length)
        
        return {
          count: issues.length,
          issues: issues.map((issue: any) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            body: issue.body ? issue.body.substring(0, 500) + (issue.body.length > 500 ? '...' : '') : null,
            labels: issue.labels?.map((l: any) => l.name) || [],
            user: issue.user?.login,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            comments: issue.comments,
            html_url: issue.html_url,
            is_pull_request: !!issue.pull_request,
          })),
        }
      } catch (error) {
        console.error('[Tool] list_issues error:', error)
        return { error: 'Failed to list issues' }
      }
    },
  })

  // search_issues is always available (both PR and repo-level chat)
  chatTools.search_issues = tool({
    description: 'Search for issues and pull requests using GitHub search syntax. WARNING: Has low rate limits (10 requests/min). Use list_issues instead for getting all issues. Only use search_issues for complex queries that need full-text search.',
    inputSchema: z.object({
      query: z.string().describe('Search query using GitHub search syntax. Examples: "auth bug is:open label:bug", "is:closed author:johndoe", "memory leak type:issue", "label:enhancement is:open"'),
    }),
    execute: async ({ query }) => {
      console.log('[Tool] search_issues called')
      
      try {
        // Automatically scope to this repo and add the user's query
        const searchQuery = encodeURIComponent(`${query} repo:${owner}/${repo}`)
        const searchRes = await fetch(
          `https://api.github.com/search/issues?q=${searchQuery}&per_page=10&sort=relevance`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        )

        if (!searchRes.ok) {
          console.log('[Tool] search_issues failed: status=' + searchRes.status)
          return { error: `GitHub search failed with status ${searchRes.status}` }
        }

        const data = await searchRes.json() as any
        console.log('[Tool] search_issues succeeded: total_count=' + data.total_count)
        
        return {
          total_count: data.total_count,
          issues: (data.items || []).map((issue: any) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            body: issue.body ? issue.body.substring(0, 500) + (issue.body.length > 500 ? '...' : '') : null,
            labels: issue.labels?.map((l: any) => l.name) || [],
            user: issue.user?.login,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            comments: issue.comments,
            html_url: issue.html_url,
          })),
        }
      } catch (error) {
        console.error('[Tool] search_issues error:', error)
        return { error: 'Failed to search issues' }
      }
    },
  })

  // get_issue - fetch a specific issue by number (no rate limit issues)
  chatTools.get_issue = tool({
    description: 'Get details for a specific issue or PR by number. Use this when you need full details about a specific issue.',
    inputSchema: z.object({
      issue_number: z.number().describe('The issue or PR number'),
    }),
    execute: async ({ issue_number }) => {
      console.log('[Tool] get_issue called: issue_number=' + issue_number)
      
      try {
        const issueRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        )

        if (!issueRes.ok) {
          console.log('[Tool] get_issue failed: status=' + issueRes.status)
          return { error: `Issue #${issue_number} not found or inaccessible` }
        }

        const issue = await issueRes.json() as any
        
        console.log('[Tool] get_issue succeeded: issue_number=' + issue_number)
        
        return {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          body: issue.body,
          labels: issue.labels?.map((l: any) => l.name) || [],
          user: issue.user?.login,
          assignees: issue.assignees?.map((a: any) => a.login) || [],
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          closed_at: issue.closed_at,
          comments: issue.comments,
          html_url: issue.html_url,
          is_pull_request: !!issue.pull_request,
        }
      } catch (error) {
        console.error('[Tool] get_issue error:', error)
        return { error: 'Failed to fetch issue' }
      }
    },
  })

  // planGitHubOperation is a client-side tool for buffering GitHub API operations
  // Note: This tool has no execute function - it's handled on the frontend
  // The backend provides the schema, and the frontend intercepts the tool call via onToolCall
  chatTools.planGitHubOperation = {
    description: 'Plan a GitHub API operation (comment, label change, etc.) to be executed later. The user will review and execute these operations when ready. Use this when the user asks you to perform GitHub operations like adding comments, changing labels, closing issues, etc.',
    inputSchema: z.object({
      operationType: z.enum(['comment', 'set_labels', 'add_labels']).describe('Type of operation to perform'),
      repo: z.string().describe('Repository in format owner/repo'),
      issueNumber: z.number().describe('Issue or PR number'),
      body: z.string().optional().describe('Comment body (required for comment operations)'),
      labels: z.array(z.string()).optional().describe('Array of label names (required for label operations)'),
    }),
    // No execute function - this is a client-side tool handled by the frontend
    // When the AI calls this tool, the frontend's onToolCall handler will log and process it
  }
  
  console.log('[Tools] Registered tools:', Object.keys(chatTools).join(', '))

  try {
    // Convert UI messages to model messages (handles both old format with content and new format with parts)
    const modelMessages = await convertToModelMessages(messages)
    
    const result = streamText({
      model: anthropic('claude-opus-4-5-20251101'),
      messages: modelMessages,
      system: systemPrompt,
      tools: chatTools,
      stopWhen: stepCountIs(10),
      providerOptions: {
        anthropic: {
          // Enable extended thinking with a token budget
          thinking: { type: 'enabled', budgetTokens: 10000 },
        },
      },
    })

    // Use the AI SDK's built-in UI message stream for useChat() compatibility
    result.pipeUIMessageStreamToResponse(res, {
      sendReasoning: true,
      sendSources: true,
    })
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Failed to generate response' })
  }
}

// Chat endpoint for AI conversations about a specific PR
app.post('/api/repos/:owner/:repo/pulls/:pull_number/chat', handleChat)

// Chat endpoint for repo-level AI conversations (no PR context)
app.post('/api/repos/:owner/:repo/chat', handleChat)

// Review endpoint for structured code reviews - requires repo details in route
app.post('/api/repos/:owner/:repo/pulls/:pull_number/review', async (req, res) => {
  const authHeader = req.headers.authorization
  const { owner, repo, pull_number } = req.params
  const { lens, instructions } = req.body

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Validate route params
  try {
    validateGitHubIdentifier(owner, 'owner')
    validateGitHubIdentifier(repo, 'repo')
    if (!/^\d+$/.test(pull_number)) {
      return res.status(400).json({ error: 'Invalid pull request number' })
    }
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }

  const token = authHeader.slice(7)

  // Debug logging
  console.log('=== Review Request ===')
  console.log('Lens:', lens)
  console.log('Has instructions:', !!instructions)
  console.log('Context type: PR-level')

  // Fetch PR details and diff from GitHub
  let prDetails: any = null
  let diff = ''

  try {
    // Fetch PR details
    const prRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )
    if (prRes.ok) {
      prDetails = await prRes.json()
    }

    // Fetch diff
    const diffRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3.diff',
        },
      }
    )
    if (diffRes.ok) {
      diff = await diffRes.text()
    }
  } catch (error) {
    console.error('Error fetching PR data:', error)
  }

  console.log('PR data loaded:', !!prDetails)
  console.log('Diff length:', diff?.length || 0)

  // Parse diff into files
  const diffFiles = parseDiffToFiles(diff || '')
  console.log('Parsed diff files:', diffFiles.length)

  // Build lens-specific instructions
  const lensInstructions: Record<string, string> = {
    'general': `Focus on identifying:
- Potential bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code quality and maintainability concerns
- Missing error handling
- Edge cases that may not be covered`,
    'negotiate': `Focus on:
- Suggesting alternative approaches
- Identifying areas where the implementation could be simplified
- Proposing compromises between complexity and functionality
- Finding opportunities to reduce scope while maintaining value`,
    'proofread': `Focus on:
- Typos and grammatical errors in comments, strings, and documentation
- Inconsistent naming conventions
- Code style issues
- Formatting inconsistencies
- Missing or incorrect documentation`,
    'custom': instructions || 'Provide a general code review.',
  }

  const lensInstruction = lensInstructions[lens] || lensInstructions['general']

  // Build system prompt for review
  let systemPrompt = `You are an experienced software engineer reviewing a pull request. Write review comments that sound natural and human - like a helpful colleague, not a robot.

## Your Review Focus
${lensInstruction}

${instructions ? `## Additional Context from Reviewer\n${instructions}\n` : ''}

## How to Write Good Review Comments

Write like a thoughtful senior engineer would:
- Be direct but kind. Say "This could cause issues because..." not "ISSUE DETECTED:"
- Explain the WHY, not just the what. Help them learn.
- If suggesting a fix, show the code. Don't just describe it.
- Use "we" and "let's" to be collaborative: "Let's add a null check here"
- Keep it concise. One clear point per comment.
- Reference the specific line and file naturally: "In \`handleSubmit\`, the async call on line 42..."

Bad: "SECURITY VULNERABILITY: Input not sanitized. Severity: HIGH."
Good: "The user input here goes straight into the SQL query - that's an injection risk. Let's use parameterized queries instead."

Bad: "Missing error handling detected."  
Good: "If this API call fails, the app will crash. Worth wrapping in a try-catch and showing the user a friendly error."

## Process

1. First, use \`list_files\` to see what changed
2. Go through each file one by one, reading the diff with \`read_file\`
3. As you read through the diff from top to bottom, call \`create_comment\` IMMEDIATELY when you see an issue - don't wait until you've read the whole file
4. Process the diff sequentially - your comments should appear in the same order as the code appears in the diff
5. Continue until you've reviewed all files

CRITICAL: Review the code in reading order. When you see a problem on line 15, comment on it before moving to line 42. This makes your review easy to follow.

## Available Tools

- \`list_files\`: See all changed files
- \`read_file\`: Read a file's diff (paginated for large files)
- \`create_comment\`: Record a review comment for a specific line`

  // Add PR context (truncated to 300 tokens)
  if (prDetails) {
    let contextText = ''
    if (prDetails.title) contextText += `PR Title: ${prDetails.title}\n`
    contextText += `Repository: ${owner}/${repo} #${pull_number}\n`
    if (prDetails.body) contextText += `\nPR Description:\n${prDetails.body}`

    const truncatedContext = truncateToTokens(contextText, 300)
    const tokenCount = countTokens(truncatedContext)

    if (truncatedContext) {
      systemPrompt += `\n\n## Pull Request Info (${tokenCount} tokens)\n${truncatedContext}`
    }
  }

  // Add files summary
  if (diffFiles.length > 0) {
    const filesSummary = buildFilesSummary(diffFiles)
    systemPrompt += `\n\n${filesSummary}`
  }

  // Add truncated diff context (up to 10,000 tokens)
  if (diff) {
    const truncatedDiff = truncateToTokens(diff, 10000)
    const diffTokenCount = countTokens(truncatedDiff)
    const originalTokenCount = countTokens(diff)
    
    systemPrompt += `\n\n## Code Changes (${diffTokenCount} tokens, ${diffFiles.length} files)\n\`\`\`diff\n${truncatedDiff}\n\`\`\``
    
    if (originalTokenCount > 10000) {
      systemPrompt += `\n\n*Note: The diff was truncated. Use the read_file tool to view specific files in full.*`
    }
  }

  // Schema for review comments (GitHub PR comment shape)
  const reviewCommentSchema = z.object({
    path: z.string().describe('The file path (e.g., "src/components/Button.tsx")'),
    line: z.number().describe('The line number in the new file where the comment applies'),
    body: z.string().describe('The review comment in markdown. Write naturally like a helpful colleague. Include code suggestions in fenced blocks if relevant.'),
    severity: z.enum(['critical', 'high', 'medium', 'low']).describe('How important is this issue? critical = breaks things, high = significant problem, medium = should fix, low = nitpick'),
  })

  const tools = {
    read_file: tool({
      description: 'Read the diff content for a specific file from the PR. Use this to examine code changes in detail.',
      inputSchema: z.object({
        filename: z.string().describe('The filename to read'),
        page: z.number().describe('Page number (1-indexed). Each page contains ~100 lines.'),
      }),
      execute: async ({ filename, page }) => {
        console.log('[Tool] read_file called: page=' + page)
        
        const file = diffFiles.find(f => f.filename === filename || f.filename.endsWith(filename))
        
        if (!file) {
          console.log('[Tool] read_file failed: file not found')
          return { error: `File "${filename}" not found.`, available_files: diffFiles.map(f => f.filename).join(', ') }
        }
        
        const lines = file.content.split('\n')
        const linesPerPage = 100
        const totalPages = Math.ceil(lines.length / linesPerPage)
        const startLine = (page - 1) * linesPerPage
        const endLine = Math.min(startLine + linesPerPage, lines.length)
        
        console.log('[Tool] read_file succeeded: total_pages=' + totalPages)
        return {
          filename: file.filename,
          page,
          total_pages: totalPages,
          lines_shown: `${startLine + 1}-${endLine}`,
          content: lines.slice(startLine, endLine).join('\n'),
          has_more: page < totalPages,
        }
      },
    }),
    
    list_files: tool({
      description: 'List all files changed in this PR.',
      inputSchema: z.object({
        filter: z.string().describe('Filter string to match filenames. Use empty string to list all.'),
      }),
      execute: async ({ filter }) => {
        console.log('[Tool] list_files called: has_filter=' + !!filter)
        
        let files = diffFiles
        if (filter) files = files.filter(f => f.filename.includes(filter))
        
        console.log('[Tool] list_files succeeded: total_files=' + files.length)
        return {
          total_files: files.length,
          files: files.map(f => ({ filename: f.filename, additions: f.additions || 0, deletions: f.deletions || 0 })),
        }
      },
    }),

    create_comment: tool({
      description: 'Record a review comment for a specific line. Call this for EACH issue you find.',
      inputSchema: reviewCommentSchema,
      execute: async (comment) => {
        console.log('[Tool] create_comment called: severity=' + comment.severity)
        return {
          success: true,
          comment: {
            id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...comment,
          }
        }
      },
    }),
  }

  try {
    // Create initial message asking for a review
    const userMessage = instructions 
      ? `Review this PR. Focus: ${lens}. Additional notes: ${instructions}`
      : `Review this PR with focus: ${lens}. Find issues and call create_comment for each one.`

    const result = streamText({
      model: anthropic('claude-opus-4-5-20251101'),
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
      tools,
      stopWhen: stepCountIs(10),
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 10000 },
        },
      },
    })

    result.pipeUIMessageStreamToResponse(res, {
      sendReasoning: true,
      sendSources: true,
    })
  } catch (error) {
    console.error('Review error:', error)
    res.status(500).json({ error: 'Failed to generate review' })
  }
})

// Summarize review findings - lightweight endpoint
app.post('/api/repos/:owner/:repo/pulls/:pull_number/review/summarize', async (req, res) => {
  const authHeader = req.headers.authorization
  const { owner, repo, pull_number } = req.params

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Validate route params
  try {
    validateGitHubIdentifier(owner, 'owner')
    validateGitHubIdentifier(repo, 'repo')
    if (!/^\d+$/.test(pull_number)) {
      return res.status(400).json({ error: 'Invalid pull request number' })
    }
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }

  const { items } = req.body

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' })
  }

  // Build a compact list for the model - just severity + path + first line of body
  const compactList = items.slice(0, 30).map((item: any, i: number) => {
    const firstLine = (item.body || '').split('\n')[0].slice(0, 120)
    return `${i + 1}. [${item.severity}] ${item.path}: ${firstLine}`
  }).join('\n')

  try {
    const { generateText } = await import('ai')

    const result = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: 'You summarize code review findings in 1-2 concise sentences. Be specific about the most important issues. Do not use bullet points. Do not start with "The review" or "This review". Just state the findings directly.',
      prompt: `Summarize these ${items.length} review findings:\n${compactList}`,
      maxOutputTokens: 150,
    })

    res.json({ summary: result.text })
  } catch (error) {
    console.error('Summary error:', error)
    res.status(500).json({ error: 'Failed to generate summary' })
  }
})

// Get PR timeline/comments (issue comments + review comments + events)
app.get('/api/repos/:owner/:repo/pulls/:pull_number/timeline', async (req, res) => {
  const authHeader = req.headers.authorization
  const { owner, repo, pull_number } = req.params
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Validate route params
  try {
    validateGitHubIdentifier(owner, 'owner')
    validateGitHubIdentifier(repo, 'repo')
    if (!/^\d+$/.test(pull_number)) {
      return res.status(400).json({ error: 'Invalid pull request number' })
    }
  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }

  const token = authHeader.slice(7)

  try {
    // Fetch issue comments, review comments, and commits in parallel
    const [issueCommentsRes, reviewCommentsRes, commitsRes, reviewsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${pull_number}/comments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/comments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/commits`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/reviews`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }),
    ])

    const [issueComments, reviewComments, commits, reviews] = await Promise.all([
      issueCommentsRes.json(),
      reviewCommentsRes.json(),
      commitsRes.json(),
      reviewsRes.json(),
    ])

    // Combine and sort by created_at
    const timeline = [
      ...(Array.isArray(issueComments) ? issueComments.map((c: any) => ({ ...c, type: 'issue_comment' })) : []),
      ...(Array.isArray(reviewComments) ? reviewComments.map((c: any) => ({ ...c, type: 'review_comment' })) : []),
      ...(Array.isArray(commits) ? commits.map((c: any) => ({ 
        ...c, 
        type: 'commit',
        created_at: c.commit?.author?.date || c.commit?.committer?.date 
      })) : []),
      ...(Array.isArray(reviews) ? reviews.filter((r: any) => r.body || r.state !== 'PENDING').map((r: any) => ({ 
        ...r, 
        type: 'review',
        created_at: r.submitted_at 
      })) : []),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    res.json(timeline)
  } catch (error) {
    console.error('Failed to fetch timeline:', error)
    res.status(500).json({ error: 'Failed to fetch timeline' })
  }
})

// The Sentry error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app)

// Optional fallthrough error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500
  res.json({ 
    error: 'Internal server error',
    sentryId: (res as any).sentry 
  })
})

// Connect to MongoDB and start server
async function start() {
  // Start the HTTP server regardless of MongoDB status
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })

  // Attempt MongoDB connection (non-blocking)
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection failed (server will continue without it):', error)
  }
}

start()
