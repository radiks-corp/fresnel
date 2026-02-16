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

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

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

  const hasPR = !!pull_number

  // Debug logging
  console.log('=== Chat Request ===')
  console.log('Messages count:', messages?.length)
  console.log('Context:', hasPR ? `${owner}/${repo}#${pull_number}` : `${owner}/${repo} (repo-level)`)

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

    console.log('PR title:', prDetails?.title || 'N/A')
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
- \`search_issues\`: Search using GitHub search syntax (supports is:open, is:closed, label:xyz, author:username, type:pr, type:issue, etc.). Use multiple different searches with various keywords to get a complete picture.`

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

1. **Use your tools relentlessly to get a complete view.** You have access to \`search_issues\` to investigate the repository thoroughly. Never make assumptions or give up after one search—keep calling the tool with different queries, keywords, and filters until you have comprehensively investigated the question. For complex questions like finding duplicates, try multiple search approaches to actually compare and analyze the data, not just search for a "duplicate" label.

2. **Be thorough and persistent.** When answering questions:
   - Try multiple relevant search queries with different keywords
   - Use various filters (is:open, is:closed, author:, label:, etc.) to explore different angles
   - Actually analyze and compare the results to draw meaningful conclusions
   - Go above and beyond to provide complete, well-researched answers

3. **Be helpful and conversational.** Provide specific findings with issue numbers, dates, and relevant details.

4. **Structure your responses clearly.** Use headings and bullet points to organize information from your research.

## Available Tools

- \`search_issues\`: Search using GitHub search syntax (supports is:open, is:closed, label:xyz, author:username, type:pr, type:issue, created:>date, comments:>N, etc.). Use this tool multiple times with different queries to thoroughly investigate questions.

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
        const file = diffFiles.find(f => f.filename === filename || f.filename.endsWith(filename))
        
        if (!file) {
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
        let files = diffFiles
        if (filter) {
          files = files.filter(f => f.filename.includes(filter))
        }
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

  // search_issues is always available (both PR and repo-level chat)
  chatTools.search_issues = tool({
    description: 'Search for issues and pull requests in the current GitHub repository using GitHub search syntax. Supports advanced filters like is:open, is:closed, label:bug, author:username, assignee:user, mentions:user, type:pr, type:issue, created:>2024-01-01, comments:>5, etc. The repo is automatically scoped, so you don\'t need to add repo: qualifier.',
    inputSchema: z.object({
      query: z.string().describe('Search query using GitHub search syntax. Examples: "auth bug is:open label:bug", "is:closed author:johndoe", "memory leak type:issue", "label:enhancement is:open"'),
    }),
    execute: async ({ query }) => {
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
          return { error: `GitHub search failed with status ${searchRes.status}` }
        }

        const data = await searchRes.json() as any
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
        console.error('Issue search error:', error)
        return { error: 'Failed to search issues' }
      }
    },
  })

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

  const token = authHeader.slice(7)

  // Debug logging
  console.log('=== Review Request ===')
  console.log('Lens:', lens)
  console.log('Instructions:', instructions || '(none)')
  console.log('PR:', `${owner}/${repo}#${pull_number}`)

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

  console.log('PR title:', prDetails?.title || 'N/A')
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
        const file = diffFiles.find(f => f.filename === filename || f.filename.endsWith(filename))
        
        if (!file) {
          return { error: `File "${filename}" not found.`, available_files: diffFiles.map(f => f.filename).join(', ') }
        }
        
        const lines = file.content.split('\n')
        const linesPerPage = 100
        const totalPages = Math.ceil(lines.length / linesPerPage)
        const startLine = (page - 1) * linesPerPage
        const endLine = Math.min(startLine + linesPerPage, lines.length)
        
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
        let files = diffFiles
        if (filter) files = files.filter(f => f.filename.includes(filter))
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
        console.log('Review comment:', comment.path, 'L' + comment.line, `[${comment.severity}]`)
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

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
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
