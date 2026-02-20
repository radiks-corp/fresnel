import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter'
import js from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript'
import ts from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript'
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css'
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json'
import xml from 'react-syntax-highlighter/dist/esm/languages/hljs/xml'
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python'
import rust from 'react-syntax-highlighter/dist/esm/languages/hljs/rust'
import go from 'react-syntax-highlighter/dist/esm/languages/hljs/go'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkEmoji from 'remark-emoji'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { ArrowLeft, CaretDown, CaretRight, Check, CheckCircle, MagnifyingGlass, File, Folder, FolderOpen, Funnel, Pencil, SpinnerGap, Trash } from '@phosphor-icons/react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { useAuth } from '../hooks/useAuth.jsx'
import { trackEvent } from '../hooks/useAnalytics'
import { usePullRequests } from '../hooks/usePullRequests'
import { usePRDiff } from '../hooks/usePRDiff'
import { usePRDetails } from '../hooks/usePRDetails'
import { usePRTimeline } from '../hooks/usePRTimeline'
import { apiFetch } from '../hooks/useGitHubAPI'
import { useSidebarContext } from '../contexts/SidebarContext'
import { useOperationsStore } from '../stores/operationsStore'
import InlineCommentEditor from '../components/InlineCommentEditor'
import OpenExternalButton from '../components/OpenExternalButton'
import OnboardingModal from '../components/OnboardingModal'
import '../app.css'

SyntaxHighlighter.registerLanguage('javascript', js)
SyntaxHighlighter.registerLanguage('typescript', ts)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('xml', xml)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('go', go)

// Map file extensions to language
function getLanguage(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const langMap = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    css: 'css', scss: 'css', less: 'css',
    json: 'json',
    html: 'xml', xml: 'xml', svg: 'xml',
    py: 'python',
    rs: 'rust',
    go: 'go',
  }
  return langMap[ext] || 'javascript'
}

// Custom style for syntax highlighting (minimal, lets diff colors show through)
const codeStyle = {
  'hljs': { background: 'transparent', padding: 0, margin: 0 },
  'hljs-keyword': { color: '#d73a49' },
  'hljs-built_in': { color: '#6f42c1' },
  'hljs-type': { color: '#6f42c1' },
  'hljs-literal': { color: '#005cc5' },
  'hljs-number': { color: '#005cc5' },
  'hljs-string': { color: '#032f62' },
  'hljs-template-variable': { color: '#032f62' },
  'hljs-regexp': { color: '#032f62' },
  'hljs-title': { color: '#6f42c1' },
  'hljs-name': { color: '#22863a' },
  'hljs-attr': { color: '#6f42c1' },
  'hljs-symbol': { color: '#005cc5' },
  'hljs-selector-id': { color: '#6f42c1' },
  'hljs-selector-class': { color: '#6f42c1' },
  'hljs-variable': { color: '#e36209' },
  'hljs-function': { color: '#6f42c1' },
  'hljs-params': { color: '#24292e' },
  'hljs-comment': { color: '#6a737d', fontStyle: 'italic' },
  'hljs-doctag': { color: '#d73a49' },
  'hljs-meta': { color: '#6a737d' },
  'hljs-section': { color: '#005cc5', fontWeight: 'bold' },
  'hljs-tag': { color: '#22863a' },
  'hljs-attribute': { color: '#6f42c1' },
}


// Parse diff into structured file data
function parseDiff(diffText) {
  if (!diffText) return []
  
  const files = []
  const fileChunks = diffText.split(/^diff --git /m).filter(Boolean)
  
  for (const chunk of fileChunks) {
    const lines = chunk.split('\n')
    const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/)
    if (!headerMatch) continue
    
    const fileName = headerMatch[2]
    const hunks = []
    let currentHunk = null
    let oldLineNum = 0
    let newLineNum = 0
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      
      if (line.startsWith('@@')) {
        const hunkMatch = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/)
        if (hunkMatch) {
          if (currentHunk) hunks.push(currentHunk)
          oldLineNum = parseInt(hunkMatch[1])
          newLineNum = parseInt(hunkMatch[2])
          currentHunk = {
            header: line,
            oldStart: oldLineNum,
            newStart: newLineNum,
            lines: []
          }
        }
      } else if (currentHunk && !line.startsWith('\\')) {
        if (line.startsWith('+')) {
          currentHunk.lines.push({
            type: 'add',
            content: line.slice(1),
            oldNum: null,
            newNum: newLineNum++
          })
        } else if (line.startsWith('-')) {
          currentHunk.lines.push({
            type: 'remove',
            content: line.slice(1),
            oldNum: oldLineNum++,
            newNum: null
          })
        } else if (line.length > 0 || currentHunk.lines.length > 0) {
          currentHunk.lines.push({
            type: 'context',
            content: line.slice(1) || line,
            oldNum: oldLineNum++,
            newNum: newLineNum++
          })
        }
      }
    }
    
    if (currentHunk) hunks.push(currentHunk)
    
    const additions = hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'add').length, 0)
    const deletions = hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'remove').length, 0)
    
    files.push({ fileName, hunks, additions, deletions })
  }
  
  return files
}

function AppPage() {
  const [selectedPR, setSelectedPR] = useState(null)

  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('appPageActiveTab')
    return saved || 'conversation'
  })
  const [viewedFiles, setViewedFiles] = useState({})
  const [collapsedFiles, setCollapsedFiles] = useState({})
  const [collapsedComments, setCollapsedComments] = useState({})
  const [replyingTo, setReplyingTo] = useState(null)
  const [editingComment, setEditingComment] = useState(null) // pending comment id
  const [editingReviewComment, setEditingReviewComment] = useState(null) // existing review comment id
  const [commentEditorOpen, setCommentEditorOpen] = useState(null) // { file, startLine, endLine }
  const [lineSelection, setLineSelection] = useState(null) // { file, startLine, endLine }
  const dragRef = useRef(null) // { file, anchorLine } — tracks the mousedown origin
  const [expandedHunks, setExpandedHunks] = useState({})
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState({})
  const [selectedExtensions, setSelectedExtensions] = useState({})
  const [hideViewedFiles, setHideViewedFiles] = useState(false)
  const [showSubmitDropdown, setShowSubmitDropdown] = useState(false)
  const [submitComment, setSubmitComment] = useState('')
  const [reviewType, setReviewType] = useState('comment')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  
  const { user, isAuthenticated, loading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { prNumber: urlPrNumber } = useParams()
  const { setSidebarData, selectedRepo } = useSidebarContext()
  // ── Buffered review comments from the global operations store ──
  const allOperations = useOperationsStore((s) => s.operations)
  const addOperation = useOperationsStore((s) => s.addOperation)
  const updateOperation = useOperationsStore((s) => s.updateOperation)
  const removeOperation = useOperationsStore((s) => s.removeOperation)
  const clearReviewComments = useOperationsStore((s) => s.clearReviewComments)
  
  // Track app page view on mount
  useEffect(() => {
    trackEvent('Page Viewed', { page: 'app' })
  }, [])

  // --- Data fetching via react-query hooks ---
  const owner = selectedRepo?.owner?.login
  const repoName = selectedRepo?.name
  const prNumber = selectedPR?.number

  const {
    data: pullRequestsData,
    isLoading: loadingPRs,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePullRequests(owner, repoName)
  const pullRequests = pullRequestsData?.pullRequests ?? []
  const { data: diff = '', isLoading: loadingDiff } = usePRDiff(owner, repoName, prNumber)
  const { data: prDetails = null, isLoading: loadingTimeline } = usePRDetails(owner, repoName, prNumber)
  const { data: timeline = [] } = usePRTimeline(owner, repoName, prNumber)

  const repoFullName = owner && repoName ? `${owner}/${repoName}` : ''
  const isOwnPR = !!(user?.login && prDetails?.user?.login && user.login === prDetails.user.login)

  // Derive pending review comments for the current PR from the global store
  const pendingComments = useMemo(
    () =>
      allOperations.filter(
        (op) =>
          op.type === 'review_comment' &&
          op.status === 'pending' &&
          op.repo === repoFullName &&
          op.prNumber === Number(prNumber)
      ),
    [allOperations, repoFullName, prNumber]
  )

  // Derive pending replies for the current PR from the global store, grouped by parent comment ID
  const pendingRepliesByComment = useMemo(() => {
    const map = {}
    for (const op of allOperations) {
      if (
        op.type === 'review_comment_reply' &&
        op.status === 'pending' &&
        op.repo === repoFullName &&
        op.prNumber === Number(prNumber)
      ) {
        if (!map[op.inReplyTo]) map[op.inReplyTo] = []
        map[op.inReplyTo].push(op)
      }
    }
    return map
  }, [allOperations, repoFullName, prNumber])

  // Group existing PR review comments from timeline by file path + line number
  const reviewCommentsByFileLine = useMemo(() => {
    const map = {}
    for (const item of timeline) {
      if (item.type === 'review_comment' && item.path && item.line != null) {
        const key = `${item.path}:${item.line}`
        if (!map[key]) map[key] = []
        map[key].push(item)
      }
    }
    // Sort each group by created_at
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    return map
  }, [timeline])

  // Reset PR when repo changes
  useEffect(() => {
    setSelectedPR(null)
  }, [selectedRepo?.id])

  // Select PR from URL params once pulls load
  useEffect(() => {
    if (!selectedRepo) return

    if (urlPrNumber) {
      const prFromUrl = pullRequests.find(pr => pr.number.toString() === urlPrNumber)
      if (prFromUrl) {
        // Found the full PR object in the loaded list — use it.
        setSelectedPR(prev => prev?.id === prFromUrl.id ? prev : prFromUrl)
      } else {
        // PR is not in the loaded pages yet (e.g. paginated out, or a direct
        // link / inbox click). Set a minimal placeholder so that usePRDiff /
        // usePRDetails / usePRTimeline can still fire for the correct number.
        // The real object will replace it once the page containing this PR loads.
        setSelectedPR(prev => {
          if (prev && prev.number.toString() === urlPrNumber) return prev
          return { number: parseInt(urlPrNumber, 10) }
        })
      }
      return
    }

    // No PR number in the URL — auto-select the first PR and update the URL.
    if (pullRequests.length === 0) return
    setSelectedPR(pullRequests[0])
    navigate(`/app/${selectedRepo.id}/${pullRequests[0].number}`, { replace: true })
  }, [pullRequests, urlPrNumber, selectedRepo, navigate])

  // Reset viewed files when diff changes
  useEffect(() => {
    setViewedFiles({})
  }, [diff])

  const parsedFiles = useMemo(() => parseDiff(diff), [diff])
  const viewedCount = Object.values(viewedFiles).filter(Boolean).length


  const toggleViewed = (fileName) => {
    const newViewedState = !viewedFiles[fileName]
    setViewedFiles(prev => ({ ...prev, [fileName]: newViewedState }))
    trackEvent('File Marked Viewed', { file: fileName, viewed: newViewedState })
    // Collapse when marking as viewed
    if (newViewedState) {
      setCollapsedFiles(prev => ({ ...prev, [fileName]: true }))
    }
  }

  const toggleCollapsed = (fileName) => {
    const willCollapse = !collapsedFiles[fileName]
    setCollapsedFiles(prev => ({ ...prev, [fileName]: !prev[fileName] }))
    trackEvent('File Diff Toggled', { file: fileName, collapsed: willCollapse })
  }

  const scrollToFile = (fileName) => {
    trackEvent('File Clicked', { file: fileName })
    const el = document.getElementById(`file-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleJumpToLine = useCallback((filePath, lineNumber) => {
    setActiveTab('files')
    setCollapsedFiles(prev => ({ ...prev, [filePath]: false }))

    setTimeout(() => {
      const lineEl =
        document.querySelector(`tr[data-file="${filePath}"][data-new-line="${lineNumber}"]`) ||
        document.querySelector(`tr[data-file="${filePath}"][data-line="${lineNumber}"]`)

      if (!lineEl) { scrollToFile(filePath); return }

      // Scroll only the diff container so headers stay fixed
      const container = lineEl.closest('.diff-content')
      if (container) {
        const rect = lineEl.getBoundingClientRect()
        const cRect = container.getBoundingClientRect()
        container.scrollTo({ top: rect.top - cRect.top + container.scrollTop - cRect.height / 2, behavior: 'smooth' })
      }

      // Flash highlight (remove + reflow lets it re-trigger on repeat clicks)
      lineEl.classList.remove('highlight-jump')
      void lineEl.offsetWidth
      lineEl.classList.add('highlight-jump')
      setTimeout(() => lineEl.classList.remove('highlight-jump'), 2000)
    }, 100)
  }, [])

  const handleApplyComment = useCallback((comment) => {
    // Avoid duplicates — check if this comment already exists in the store
    const existing = allOperations.find(
      (op) => op.type === 'review_comment' && op.originalId === comment.id
    )
    if (existing) return

    addOperation({
      type: 'review_comment',
      repo: repoFullName,
      prNumber: Number(prNumber),
      originalId: comment.id,
      path: comment.path,
      line: comment.line,
      body: comment.body,
      severity: comment.severity,
    })
    trackEvent('Review Comment Applied', { file: comment.path, line: comment.line, severity: comment.severity })
  }, [allOperations, addOperation, repoFullName, prNumber])

  // Provide sidebar data via context so the layout-level sidebar can read it
  useEffect(() => {
    setSidebarData({
      onApplyComment: handleApplyComment,
      viewedCount,
      totalFiles: parsedFiles.length,
    })
  }, [setSidebarData, handleApplyComment, viewedCount, parsedFiles.length])

  // Clear sidebar data when leaving this page
  useEffect(() => {
    return () => {
      setSidebarData({
        onApplyComment: null,
        viewedCount: 0,
        totalFiles: 0,
      })
    }
  }, [setSidebarData])

  // Handle jump-to from navigation state (sidebar uses navigate() for jump-to clicks)
  useEffect(() => {
    const jumpTo = location.state?.jumpTo
    if (jumpTo && !loadingDiff && parsedFiles.length > 0) {
      handleJumpToLine(jumpTo.file, jumpTo.line)
      // Clear the state so it doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, loadingDiff, parsedFiles, handleJumpToLine, navigate, location.pathname])

  // ── Multi-line selection via the "+" button drag ──

  const handlePlusMouseDown = useCallback((e, fileName, lineNum) => {
    if (!lineNum) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { file: fileName, anchorLine: lineNum }
    setLineSelection({ file: fileName, startLine: lineNum, endLine: lineNum })
    setCommentEditorOpen(null)
  }, [])

  const handleLineMouseEnter = useCallback((fileName, lineNum) => {
    if (!dragRef.current || dragRef.current.file !== fileName || !lineNum) return
    const anchor = dragRef.current.anchorLine
    setLineSelection({
      file: fileName,
      startLine: Math.min(anchor, lineNum),
      endLine: Math.max(anchor, lineNum),
    })
  }, [])

  // On mouse up: finish drag and immediately open the comment editor
  const handleDragMouseUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    setLineSelection((sel) => {
      if (!sel) return sel
      setCommentEditorOpen({ file: sel.file, startLine: sel.startLine, endLine: sel.endLine })
      trackEvent('Inline Comment Started', { file: sel.file, startLine: sel.startLine, endLine: sel.endLine })
      return sel
    })
  }, [])

  // Global mouseup so releasing anywhere finishes the drag
  useEffect(() => {
    const onMouseUp = () => {
      if (dragRef.current) handleDragMouseUp()
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [handleDragMouseUp])

  const isLineSelected = useCallback((fileName, lineNum) => {
    if (!lineSelection || lineSelection.file !== fileName || !lineNum) return false
    return lineNum >= lineSelection.startLine && lineNum <= lineSelection.endLine
  }, [lineSelection])

  const handleEditComment = useCallback((commentId, newBody) => {
    updateOperation(commentId, { body: newBody })
    setEditingComment(null)
    trackEvent('Inline Comment Edited', { comment_id: commentId })
  }, [updateOperation])

  const handleDeleteComment = useCallback((commentId) => {
    removeOperation(commentId)
    trackEvent('Inline Comment Deleted', { comment_id: commentId })
  }, [removeOperation])

  const handleReplySubmit = useCallback((threadKey, parentCommentId, body) => {
    if (!body?.trim()) return
    addOperation({
      type: 'review_comment_reply',
      repo: repoFullName,
      prNumber: Number(prNumber),
      inReplyTo: parentCommentId,
      body: body.trim(),
    })
    setReplyingTo(null)
    trackEvent('PR Comment Reply Buffered', { parent_comment_id: parentCommentId })
  }, [addOperation, repoFullName, prNumber])

  const handleResolveThread = useCallback(async (parentCommentId, resolved) => {
    if (!owner || !repoName || !prNumber) return
    try {
      const res = await apiFetch(
        `/api/repos/${owner}/${repoName}/pulls/${prNumber}/threads/resolve`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commentDatabaseId: parentCommentId, resolved }),
        }
      )
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['timeline', owner, repoName, prNumber] })
        trackEvent('PR Thread Resolved', { parent_comment_id: parentCommentId, resolved })
      }
    } catch (err) {
      console.error('Failed to resolve thread:', err)
    }
  }, [owner, repoName, prNumber, queryClient])

  const handleDeleteReviewComment = useCallback(async (commentId) => {
    if (!owner || !repoName) return
    try {
      const res = await apiFetch(
        `/api/repos/${owner}/${repoName}/pulls/comments/${commentId}`,
        { method: 'DELETE' }
      )
      if (res.ok || res.status === 204) {
        queryClient.invalidateQueries({ queryKey: ['timeline', owner, repoName, prNumber] })
        trackEvent('PR Comment Deleted', { comment_id: commentId })
      }
    } catch (err) {
      console.error('Failed to delete review comment:', err)
    }
  }, [owner, repoName, prNumber, queryClient])

  const handleEditReviewComment = useCallback(async (commentId, newBody) => {
    if (!owner || !repoName) return
    try {
      const res = await apiFetch(
        `/api/repos/${owner}/${repoName}/pulls/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: newBody }),
        }
      )
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['timeline', owner, repoName, prNumber] })
        setEditingReviewComment(null)
        trackEvent('PR Comment Edited', { comment_id: commentId })
      }
    } catch (err) {
      console.error('Failed to edit review comment:', err)
    }
  }, [owner, repoName, prNumber, queryClient])

  const handleInlineCommentSubmit = useCallback(({ body, type }, fileName, startLine, endLine) => {
    addOperation({
      type: 'review_comment',
      repo: repoFullName,
      prNumber: Number(prNumber),
      path: fileName,
      line: endLine,
      startLine: startLine !== endLine ? startLine : undefined,
      body,
      severity: 'comment',
    })
    setCommentEditorOpen(null)
    setLineSelection(null)
    trackEvent('Inline Comment Submitted', { file: fileName, startLine, endLine, type })
  }, [addOperation, repoFullName, prNumber])

  const handleSubmitReview = async () => {
    if (!owner || !repoName || !prNumber) return
    
    const token = localStorage.getItem('github_token') || localStorage.getItem('github_pat')
    if (!token) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const eventMap = {
        'comment': 'COMMENT',
        'approve': 'APPROVE',
        'request_changes': 'REQUEST_CHANGES'
      }

      const comments = pendingComments.map(comment => {
        const c = {
          path: comment.path,
          line: comment.line,
          side: 'RIGHT',
          body: comment.body,
        }
        if (comment.startLine) {
          c.start_line = comment.startLine
          c.start_side = 'RIGHT'
        }
        return c
      })

      // Gather pending replies
      const pendingReplies = allOperations.filter(
        op =>
          op.type === 'review_comment_reply' &&
          op.status === 'pending' &&
          op.repo === repoFullName &&
          op.prNumber === Number(prNumber)
      )

      // GitHub API requires body for COMMENT and REQUEST_CHANGES events
      const hasContent = submitComment || comments.length > 0 || pendingReplies.length > 0
      if (!hasContent && reviewType !== 'approve') {
        throw new Error('Please enter a comment or add inline review comments before submitting.')
      }

      // Only call the review API if there's a body or comments to submit
      // (replies are posted separately and don't need a review wrapper)
      const needsReview = submitComment || comments.length > 0 || reviewType === 'approve' || reviewType === 'request_changes'

      if (needsReview) {
        const reviewBody = submitComment
          || (reviewType === 'request_changes' ? 'Changes requested.' : undefined)

        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}/reviews`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              body: reviewBody,
              event: eventMap[reviewType],
              comments: comments.length > 0 ? comments : undefined
            })
          }
        )

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to submit review')
        }
      }

      // Post pending replies individually (GitHub review API doesn't support in_reply_to)
      for (const reply of pendingReplies) {
        try {
          await apiFetch(
            `/api/repos/${owner}/${repoName}/pulls/${prNumber}/comments/${reply.inReplyTo}/replies`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body: reply.body }),
            }
          )
          removeOperation(reply.id)
        } catch (replyErr) {
          console.error('Failed to post reply:', replyErr)
        }
      }

      trackEvent('Review Submitted to GitHub', {
        repo: `${owner}/${repoName}`,
        pr_number: prNumber,
        review_type: reviewType,
        comments_count: comments.length,
        replies_count: pendingReplies.length,
      })

      setShowSubmitDropdown(false)
      setSubmitComment('')
      setReviewType('comment')
      clearReviewComments(repoFullName, prNumber)
      queryClient.invalidateQueries({ queryKey: ['timeline', owner, repoName, prNumber] })
    } catch (err) {
      setSubmitError(err.message)
      trackEvent('Review Submit Failed', { error: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleFolder = (folderPath) => {
    setCollapsedFolders(prev => ({ ...prev, [folderPath]: !prev[folderPath] }))
  }

  // Build file tree structure from flat file list
  // Compute available file extensions with counts
  const extensionCounts = useMemo(() => {
    const counts = {}
    parsedFiles.forEach(file => {
      const ext = '.' + file.fileName.split('.').pop()?.toLowerCase()
      if (ext && ext !== '.') {
        counts[ext] = (counts[ext] || 0) + 1
      }
    })
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  }, [parsedFiles])

  const hasActiveFilters = Object.values(selectedExtensions).some(Boolean) || hideViewedFiles

  const clearFilters = () => {
    setSelectedExtensions({})
    setHideViewedFiles(false)
    trackEvent('File Filters Cleared')
  }

  const toggleExtension = (ext) => {
    const newState = !selectedExtensions[ext]
    setSelectedExtensions(prev => ({ ...prev, [ext]: !prev[ext] }))
    trackEvent('File Filter Applied', { extension: ext, enabled: newState })
  }

  const fileTree = useMemo(() => {
    let filteredFiles = parsedFiles.filter(file => 
      file.fileName.toLowerCase().includes(fileSearchQuery.toLowerCase())
    )
    
    // Filter by selected extensions
    const activeExtensions = Object.entries(selectedExtensions).filter(([_, v]) => v).map(([k]) => k)
    if (activeExtensions.length > 0) {
      filteredFiles = filteredFiles.filter(file => {
        const ext = '.' + file.fileName.split('.').pop()?.toLowerCase()
        return activeExtensions.includes(ext)
      })
    }
    
    // Filter out viewed files if toggle is on
    if (hideViewedFiles) {
      filteredFiles = filteredFiles.filter(file => !viewedFiles[file.fileName])
    }
    
    const tree = {}
    
    filteredFiles.forEach(file => {
      const parts = file.fileName.split('/')
      const fileName = parts.pop()
      const folderPath = parts.join('/')
      
      if (!tree[folderPath]) {
        tree[folderPath] = []
      }
      tree[folderPath].push({ ...file, baseName: fileName })
    })
    
    // Sort folders alphabetically
    return Object.entries(tree).sort(([a], [b]) => a.localeCompare(b))
  }, [parsedFiles, fileSearchQuery, selectedExtensions, hideViewedFiles, viewedFiles])

  // Flat list of filtered files for the diff content
  const filteredFiles = useMemo(() => {
    return fileTree.flatMap(([_, files]) => files)
  }, [fileTree])

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays < 30) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const renderTimelineItem = (item, index) => {
    if (item.type === 'commit') {
      return (
        <div key={`commit-${item.sha}`} className="timeline-item commit-item">
          <div className="timeline-icon">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
            </svg>
          </div>
          <div className="timeline-content">
            <img 
              src={item.author?.avatar_url || item.committer?.avatar_url || 'https://github.com/ghost.png'} 
              alt="" 
              className="timeline-avatar-small"
            />
            <span className="timeline-author">{item.commit?.author?.name || item.author?.login || 'Unknown'}</span>
            <span className="timeline-action">committed</span>
            <code className="commit-sha">{item.sha?.substring(0, 7)}</code>
            <span className="timeline-message">{item.commit?.message?.split('\n')[0]}</span>
            <span className="timeline-time">{formatTimeAgo(item.created_at)}</span>
          </div>
        </div>
      )
    }

    if (item.type === 'review') {
      const stateLabels = {
        APPROVED: { text: 'approved', class: 'approved' },
        CHANGES_REQUESTED: { text: 'requested changes', class: 'changes-requested' },
        COMMENTED: { text: 'reviewed', class: 'commented' },
      }
      const state = stateLabels[item.state] || { text: 'reviewed', class: 'commented' }
      
      return (
        <div key={`review-${item.id}`} className="timeline-item review-item">
          <div className="timeline-icon review">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M1.5 2.75a.25.25 0 0 1 .25-.25h8.5a.25.25 0 0 1 .25.25v5.5a.25.25 0 0 1-.25.25h-3.5a.75.75 0 0 0-.53.22L3.5 11.44V9.25a.75.75 0 0 0-.75-.75h-1a.25.25 0 0 1-.25-.25Zm.25-1.75A1.75 1.75 0 0 0 0 2.75v5.5C0 9.216.784 10 1.75 10H2v1.543a1.458 1.458 0 0 0 2.487 1.03L7.061 10h3.189A1.75 1.75 0 0 0 12 8.25v-5.5A1.75 1.75 0 0 0 10.25 1ZM14.5 4.75a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.457 1.457 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.224v-2.194a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z"/>
            </svg>
          </div>
          <div className="timeline-content">
            <img src={item.user?.avatar_url} alt="" className="timeline-avatar-small" />
            <span className="timeline-author">{item.user?.login}</span>
            <span className={`review-state ${state.class}`}>{state.text}</span>
            <span className="timeline-time">{formatTimeAgo(item.created_at)}</span>
            {item.body && (
              <div className="comment-body">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{item.body}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )
    }

    if (item.type === 'issue_comment' || item.type === 'review_comment') {
      return (
        <div key={`comment-${item.id}`} className="timeline-item comment-card">
          <div className="comment-header">
            <img src={item.user?.avatar_url} alt="" className="comment-avatar" />
            <span className="comment-author">{item.user?.login}</span>
            <span className="comment-time">commented {formatTimeAgo(item.created_at)}</span>
            {item.author_association && item.author_association !== 'NONE' && (
              <span className="author-badge">{item.author_association.toLowerCase()}</span>
            )}
          </div>
          <div className="comment-body">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{item.body || ''}</ReactMarkdown>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="app-page">
      <div className="tabs-bar">
        <button className="tabs-bar-back-btn" onClick={() => navigate('/app')}>
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>

        <div className="tabs-bar-divider" />

        <Popover className="header-selector">
          <PopoverButton className="header-selector-trigger">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="header-selector-icon">
              <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/>
            </svg>
            {loadingPRs ? (
              <span className="header-selector-text">Loading...</span>
            ) : selectedPR ? (
              <span className="header-selector-text">{selectedPR.head?.ref || `#${selectedPR.number}`}</span>
            ) : (
              <span className="header-selector-text">No PRs</span>
            )}
            <CaretDown size={12} className="header-selector-caret" />
          </PopoverButton>
          
          {pullRequests.length > 0 && (
            <PopoverPanel className="header-dropdown">
              {({ close }) => (
                <>
                  {pullRequests.map((pr) => (
                    <div
                      key={pr.id}
                      className={`header-dropdown-item ${selectedPR?.id === pr.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedPR(pr)
                        if (selectedRepo) {
                          navigate(`/app/${selectedRepo.id}/${pr.number}`)
                        }
                        trackEvent('PR Selected', {
                          pr_number: pr.number,
                          pr_title: pr.title,
                          repo_name: selectedRepo ? `${selectedRepo.owner.login}/${selectedRepo.name}` : undefined,
                        })
                        close()
                      }}
                    >
                      <span className="header-dropdown-number">#{pr.number}</span>
                      <span className="header-dropdown-text">{pr.title}</span>
                    </div>
                  ))}
                  {hasNextPage && (
                    <button
                      className="header-dropdown-load-more"
                      onClick={(e) => {
                        e.stopPropagation()
                        fetchNextPage()
                      }}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? (
                        <><SpinnerGap size={14} className="spinning" /> Loading...</>
                      ) : (
                        'Load more'
                      )}
                    </button>
                  )}
                </>
              )}
            </PopoverPanel>
          )}
        </Popover>

        <div className="tabs-bar-divider" />

        <button 
          className={`tab ${activeTab === 'conversation' ? 'active' : ''}`}
          onClick={() => { 
            setActiveTab('conversation')
            localStorage.setItem('appPageActiveTab', 'conversation')
            trackEvent('Tab Changed', { tab: 'conversation' })
          }}
        >
          Conversation <span className="tab-count">{timeline.filter(t => t.type === 'issue_comment' || t.type === 'review').length + (prDetails?.body ? 1 : 0)}</span>
        </button>
        <button 
          className={`tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => { 
            setActiveTab('files')
            localStorage.setItem('appPageActiveTab', 'files')
            trackEvent('Tab Changed', { tab: 'files_changed' })
          }}
        >
          Files changed <span className="tab-count">{parsedFiles.length}</span>
        </button>

        <div className="tabs-bar-spacer" />

        {selectedPR && owner && repoName && (
          <OpenExternalButton
            type="pr"
            owner={owner}
            repo={repoName}
            number={selectedPR.number}
          />
        )}

        {selectedPR && (
          <div className="submit-review-container">
            <button 
              className="submit-review-header-btn"
              onClick={() => {
                if (!showSubmitDropdown && isOwnPR && (reviewType === 'approve' || reviewType === 'request_changes')) {
                  setReviewType('comment')
                }
                setShowSubmitDropdown(!showSubmitDropdown)
              }}
            >
              Submit review
              <CaretDown size={12} weight="bold" />
            </button>

            {showSubmitDropdown && (
              <div className="submit-review-dropdown">
                <div className="submit-review-dropdown-header">
                  <span>Finish your review</span>
                  <button className="submit-review-dropdown-close" onClick={() => setShowSubmitDropdown(false)}>
                    &times;
                  </button>
                </div>
                <div className="submit-review-dropdown-body">
                  <textarea
                    className="submit-review-textarea"
                    placeholder="Leave a comment"
                    value={submitComment}
                    onChange={(e) => setSubmitComment(e.target.value)}
                  />
                  <div className="submit-review-options">
                    <label className={`submit-review-option ${reviewType === 'comment' ? 'selected' : ''}`}>
                      <input type="radio" name="headerReviewType" value="comment"
                        checked={reviewType === 'comment'}
                        onChange={(e) => { setReviewType(e.target.value); trackEvent('Review Type Selected', { type: 'comment' }) }}
                      />
                      <span className="submit-review-radio" />
                      <div className="submit-review-option-content">
                        <span className="submit-review-option-title">Comment</span>
                        <span className="submit-review-option-desc">Submit general feedback without explicit approval.</span>
                      </div>
                    </label>
                    <label className={`submit-review-option ${isOwnPR ? 'disabled' : ''} ${reviewType === 'approve' ? 'selected' : ''}`}>
                      <input type="radio" name="headerReviewType" value="approve"
                        checked={reviewType === 'approve'}
                        disabled={isOwnPR}
                        onChange={(e) => { setReviewType(e.target.value); trackEvent('Review Type Selected', { type: 'approve' }) }}
                      />
                      <span className="submit-review-radio" />
                      <div className="submit-review-option-content">
                        <span className="submit-review-option-title">Approve</span>
                        <span className="submit-review-option-desc">Submit feedback and approve merging these changes.</span>
                      </div>
                      {isOwnPR && <span className="submit-review-tooltip">Pull request authors can't approve their own pull requests.</span>}
                    </label>
                    <label className={`submit-review-option ${isOwnPR ? 'disabled' : ''} ${reviewType === 'request_changes' ? 'selected' : ''}`}>
                      <input type="radio" name="headerReviewType" value="request_changes"
                        checked={reviewType === 'request_changes'}
                        disabled={isOwnPR}
                        onChange={(e) => { setReviewType(e.target.value); trackEvent('Review Type Selected', { type: 'request_changes' }) }}
                      />
                      <span className="submit-review-radio" />
                      <div className="submit-review-option-content">
                        <span className="submit-review-option-title">Request changes</span>
                        <span className="submit-review-option-desc">Submit feedback suggesting changes.</span>
                      </div>
                      {isOwnPR && <span className="submit-review-tooltip">Pull request authors can't request changes on their own pull requests.</span>}
                    </label>
                  </div>
                </div>
                <div className="submit-review-dropdown-footer">
                  <button 
                    className="submit-review-cancel-btn" 
                    onClick={() => { setShowSubmitDropdown(false); trackEvent('Review Submit Cancelled') }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button 
                    className="submit-review-submit-btn"
                    onClick={handleSubmitReview}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <SpinnerGap size={16} className="spinning" /> : 'Submit review'}
                  </button>
                </div>
                {submitError && (
                  <div className="submit-review-error">
                    {submitError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`main-with-sidebar ${activeTab === 'files' ? 'has-sidebar' : ''}`}>
        {activeTab === 'files' && (
        <aside className="files-sidebar">
          <div className="files-search">
            <MagnifyingGlass size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Filter files..."
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              className="files-search-input"
            />
            <Popover className="filter-dropdown-container">
              <PopoverButton className={`filter-btn ${hasActiveFilters ? 'active' : ''}`}>
                <Funnel size={14} />
              </PopoverButton>
              <PopoverPanel className="filter-dropdown">
                <div className="filter-section">
                  <div className="filter-section-title">File extensions</div>
                  {extensionCounts.map(([ext, count]) => (
                    <label key={ext} className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedExtensions[ext] || false}
                        onChange={() => toggleExtension(ext)}
                      />
                      <span className={`filter-checkbox ${selectedExtensions[ext] ? 'checked' : ''}`}>
                        {selectedExtensions[ext] && <Check size={10} weight="bold" />}
                      </span>
                      <span className="filter-option-label">{ext}</span>
                      <span className="filter-option-count">{count}</span>
                    </label>
                  ))}
                </div>
                <div className="filter-divider" />
                <label className="filter-option">
                  <input
                    type="checkbox"
                    checked={hideViewedFiles}
                    onChange={() => setHideViewedFiles(!hideViewedFiles)}
                  />
                  <span className={`filter-checkbox ${hideViewedFiles ? 'checked' : ''}`}>
                    {hideViewedFiles && <Check size={10} weight="bold" />}
                  </span>
                  <span className="filter-option-label">Viewed files</span>
                </label>
                {hasActiveFilters && (
                  <>
                    <div className="filter-divider" />
                    <button className="clear-filters-btn" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </>
                )}
              </PopoverPanel>
            </Popover>
          </div>
          <div className="files-tree">
            {fileTree.map(([folderPath, files]) => (
              <div key={folderPath} className="folder-group">
                {folderPath && (
                  <div 
                    className="folder-header"
                    onClick={() => toggleFolder(folderPath)}
                  >
                    <span className="folder-chevron">
                      {collapsedFolders[folderPath] ? <CaretRight size={12} /> : <CaretDown size={12} />}
                    </span>
                    {collapsedFolders[folderPath] ? <Folder size={14} /> : <FolderOpen size={14} />}
                    <span className="folder-name">{folderPath}</span>
                  </div>
                )}
                {!collapsedFolders[folderPath] && (
                  <div className={`folder-files ${folderPath ? 'nested' : ''}`}>
                    {files.map((file) => (
                      <div 
                        key={file.fileName}
                        className={`file-tree-item ${viewedFiles[file.fileName] ? 'viewed' : ''}`}
                        onClick={() => scrollToFile(file.fileName)}
                      >
                        <File size={14} className="file-icon" />
                        <span className="file-tree-name">{file.baseName}</span>
                        <div className="file-tree-stats">
                          {file.additions > 0 && <span className="stat-add">+{file.additions}</span>}
                          {file.deletions > 0 && <span className="stat-del">-{file.deletions}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
        )}

        <main className="diff-content">
          {activeTab === 'conversation' ? (
            <div className="conversation-view">
              {loadingTimeline ? (
                <div className="loading-state">Loading conversation...</div>
              ) : prDetails ? (
                <>
                  {/* PR Header */}
                  <div className="pr-header-card">
                    <h1>
                      {prDetails.title}
                      <span className="pr-number-badge">#{prDetails.number}</span>
                    </h1>
                    <div className="pr-meta-row">
                      <span className={`pr-state-badge ${prDetails.state} ${prDetails.merged ? 'merged' : ''}`}>
                        {prDetails.merged ? (
                          <>
                            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                              <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/>
                            </svg>
                            Merged
                          </>
                        ) : prDetails.state === 'open' ? (
                          <>
                            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>
                            </svg>
                            Open
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                              <path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM3.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
                            </svg>
                            Closed
                          </>
                        )}
                      </span>
                      <span className="pr-meta-text">
                        <strong>{prDetails.user?.login}</strong> wants to merge {prDetails.commits || 0} commits into{' '}
                        <code className="branch-name">{prDetails.base?.ref}</code> from{' '}
                        <code className="branch-name">{prDetails.head?.ref}</code>
                      </span>
                    </div>
                  </div>

                  {/* PR Description */}
                  {prDetails.body && (
                    <div className="comment-card pr-description">
                      <div className="comment-header">
                        <img src={prDetails.user?.avatar_url} alt="" className="comment-avatar" />
                        <span className="comment-author">{prDetails.user?.login}</span>
                        <span className="comment-time">commented {formatTimeAgo(prDetails.created_at)}</span>
                        {prDetails.author_association && prDetails.author_association !== 'NONE' && (
                          <span className="author-badge">{prDetails.author_association.toLowerCase()}</span>
                        )}
                      </div>
                      <div className="comment-body markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{prDetails.body}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="timeline">
                    {timeline.map((item, index) => renderTimelineItem(item, index))}
                  </div>
                </>
              ) : (
                <div className="empty-state">Select a pull request to view</div>
              )}
            </div>
          ) : loadingDiff ? (
            <div className="loading-state">Loading diff...</div>
          ) : filteredFiles.length > 0 ? (
            <div className="files-diff">
              {filteredFiles.map((file) => (
                <div 
                  key={file.fileName} 
                  id={`file-${file.fileName.replace(/[^a-zA-Z0-9]/g, '-')}`}
                  className={`file-diff-card ${viewedFiles[file.fileName] ? 'viewed' : ''}`}
                >
                  <div className="file-diff-header" onClick={() => toggleCollapsed(file.fileName)}>
                    <div className="file-header-left">
                      <span className={`collapse-caret ${collapsedFiles[file.fileName] ? '' : 'expanded'}`}>
                        <CaretRight size={16} weight="bold" />
                      </span>
                      <span className="file-header-name">{file.fileName}</span>
                      <div className="file-header-stats">
                        {file.additions > 0 && <span className="stat-add">+{file.additions}</span>}
                        {file.deletions > 0 && <span className="stat-del">-{file.deletions}</span>}
                      </div>
                    </div>
                    <div className="file-header-right" onClick={(e) => e.stopPropagation()}>
                      <label className="viewed-checkbox">
                        <input 
                          type="checkbox"
                          checked={viewedFiles[file.fileName] || false}
                          onChange={() => toggleViewed(file.fileName)}
                        />
                        <span className={`checkbox-custom ${viewedFiles[file.fileName] ? 'checked' : ''}`}>
                          {viewedFiles[file.fileName] && <Check size={12} weight="bold" />}
                        </span>
                        <span className="checkbox-label">Viewed</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className={`file-diff-content ${collapsedFiles[file.fileName] ? 'collapsed' : ''}`}>
                    {file.hunks.map((hunk, hunkIdx) => (
                      <div key={hunkIdx} className="diff-hunk">
                        <div className="hunk-header">{hunk.header}</div>
                        <table className="diff-table">
                          <tbody>
                            {hunk.lines.map((line, lineIdx) => {
                              const lineNum = line.newNum || line.oldNum
                              const lineComments = pendingComments.filter(
                                c => c.path === file.fileName && c.line === lineNum
                              )
                              // Check if this line falls within any multi-line comment's range
                              const isInCommentRange = pendingComments.some(
                                c => c.path === file.fileName && c.startLine && lineNum >= c.startLine && lineNum <= c.line
                              )
                              const existingComments = line.newNum
                                ? (reviewCommentsByFileLine[`${file.fileName}:${line.newNum}`] || [])
                                : []
                              const selected = isLineSelected(file.fileName, line.newNum)
                              return (
                                <React.Fragment key={lineIdx}>
                                  <tr 
                                    className={`diff-line ${line.type}${selected ? ' line-selected' : ''}${isInCommentRange ? ' line-commented' : ''}`}
                                    data-file={file.fileName}
                                    data-line={lineNum || ''}
                                    data-new-line={line.newNum || ''}
                                    onMouseEnter={() => handleLineMouseEnter(file.fileName, line.newNum)}
                                  >
                                    <td className="line-num old">{line.oldNum || ''}</td>
                                    <td className="line-num new has-plus-btn">
                                      {line.newNum && !commentEditorOpen && (() => {
                                        const isFirst = selected && lineSelection?.startLine === line.newNum
                                        const isLast = selected && lineSelection?.endLine === line.newNum
                                        const isMid = selected && !isFirst && !isLast
                                        const isMultiLine = lineSelection && lineSelection.startLine !== lineSelection.endLine
                                        return (
                                          <>
                                            {isMid && isMultiLine && (
                                              <span className="line-drag-pipe" />
                                            )}
                                            {(!isMid || !isMultiLine) && (
                                              <button
                                                className={`line-plus-btn${isFirst && isMultiLine ? ' is-first' : ''}${isLast && isMultiLine ? ' is-last' : ''}`}
                                                onMouseDown={(e) => handlePlusMouseDown(e, file.fileName, line.newNum)}
                                                tabIndex={-1}
                                              >+</button>
                                            )}
                                          </>
                                        )
                                      })()}
                                      {line.newNum || ''}
                                    </td>
                                    <td className="line-content">
                                      <SyntaxHighlighter
                                        language={getLanguage(file.fileName)}
                                        style={codeStyle}
                                        customStyle={{
                                          background: 'transparent',
                                          padding: 0,
                                          margin: 0,
                                          overflow: 'visible',
                                        }}
                                        codeTagProps={{
                                          style: {
                                            fontFamily: 'inherit',
                                            fontSize: 'inherit',
                                          }
                                        }}
                                      >
                                        {line.content || ' '}
                                      </SyntaxHighlighter>
                                    </td>
                                  </tr>
                                  {lineComments.map(comment => (
                                    <tr key={comment.id} className="pending-comment-row">
                                      <td colSpan={3}>
                                        <div className="pending-comment-wrapper">
                                          {editingComment === comment.id ? (
                                            <InlineCommentEditor
                                              avatar={user?.avatar_url}
                                              userName={user?.name || user?.login}
                                              fileName={file.fileName}
                                              lineNum={comment.line}
                                              initialBody={comment.body}
                                              editMode
                                              onSubmit={({ body }) => handleEditComment(comment.id, body)}
                                              onCancel={() => setEditingComment(null)}
                                            />
                                          ) : (
                                          <div className={`pending-comment ${collapsedComments[comment.id] ? 'collapsed' : ''}`}>
                                            <div 
                                              className="pending-comment-header"
                                              onClick={() => setCollapsedComments(prev => ({
                                                ...prev,
                                                [comment.id]: !prev[comment.id]
                                              }))}
                                            >
                                              <CaretRight 
                                                size={14} 
                                                className={`pending-comment-caret ${collapsedComments[comment.id] ? '' : 'expanded'}`}
                                              />
                                              <span>Comment on {comment.startLine ? <>lines <strong>R{comment.startLine}</strong> to <strong>R{comment.line}</strong></> : <>line <strong>R{comment.line}</strong></>}</span>
                                            </div>
                                            <div className="pending-comment-body">
                                              <img 
                                                className="pending-comment-avatar" 
                                                src={user?.avatar_url || 'https://avatars.githubusercontent.com/u/0?v=4'} 
                                                alt={user?.name || 'User'}
                                              />
                                              <div className="pending-comment-content">
                                                <div className="pending-comment-meta">
                                                  <span className="pending-comment-author">{user?.name || user?.login}</span>
                                                  <span className="pending-comment-time">now</span>
                                                  <div className="pending-comment-actions-right">
                                                    <span className="pending-comment-badge">Pending</span>
                                                    <Popover className="pending-comment-menu">
                                                    <PopoverButton className="pending-comment-menu-btn">
                                                      ···
                                                    </PopoverButton>
                                                    <PopoverPanel anchor="bottom end" className="pending-comment-dropdown">
                                                      {({ close }) => (
                                                        <>
                                                          <button 
                                                            className="pending-comment-dropdown-item"
                                                            onClick={() => { setEditingComment(comment.id); close(); }}
                                                          >
                                                            Edit
                                                          </button>
                                                          <button 
                                                            className="pending-comment-dropdown-item danger"
                                                            onClick={() => { handleDeleteComment(comment.id); close(); }}
                                                          >
                                                            Delete
                                                          </button>
                                                        </>
                                                      )}
                                                    </PopoverPanel>
                                                    </Popover>
                                                  </div>
                                                </div>
                                                <div className="pending-comment-text">
                                                  <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSanitize]}>{comment.body}</ReactMarkdown>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {existingComments.length > 0 && (
                                    <tr className="pr-comment-row">
                                      <td colSpan={3}>
                                        <div className="pr-comment-thread">
                                          <div className="pr-comment-thread-header">
                                            <CaretRight 
                                              size={14} 
                                              className={`pending-comment-caret ${collapsedComments[`pr-${file.fileName}-${line.newNum}`] ? '' : 'expanded'}`}
                                            />
                                            <span
                                              className="pr-comment-thread-label"
                                              onClick={() => setCollapsedComments(prev => ({
                                                ...prev,
                                                [`pr-${file.fileName}-${line.newNum}`]: !prev[`pr-${file.fileName}-${line.newNum}`]
                                              }))}
                                            >
                                              {existingComments.length} {existingComments.length === 1 ? 'comment' : 'comments'} on line <strong>R{line.newNum}</strong>
                                            </span>
                                          </div>
                                          {!collapsedComments[`pr-${file.fileName}-${line.newNum}`] && (() => {
                                            const threadKey = `pr-${file.fileName}-${line.newNum}`
                                            const parentCommentId = existingComments[0].id
                                            const threadPendingReplies = pendingRepliesByComment[parentCommentId] || []
                                            return (
                                            <div className="pr-comment-thread-body">
                                              {existingComments.map(rc => (
                                                <div key={rc.id} className="pr-comment-item">
                                                  {editingReviewComment === rc.id ? (
                                                    <InlineCommentEditor
                                                      avatar={rc.user?.avatar_url}
                                                      userName={rc.user?.login}
                                                      fileName={file.fileName}
                                                      lineNum={rc.line || line.newNum}
                                                      initialBody={rc.body || ''}
                                                      editMode
                                                      onSubmit={({ body }) => handleEditReviewComment(rc.id, body)}
                                                      onCancel={() => setEditingReviewComment(null)}
                                                    />
                                                  ) : (
                                                  <>
                                                  <img 
                                                    className="pr-comment-avatar" 
                                                    src={rc.user?.avatar_url || 'https://avatars.githubusercontent.com/u/0?v=4'} 
                                                    alt={rc.user?.login || 'User'}
                                                  />
                                                  <div className="pr-comment-content">
                                                    <div className="pr-comment-meta">
                                                      <span className="pr-comment-author">{rc.user?.login}</span>
                                                      <span className="pr-comment-time">{formatTimeAgo(rc.created_at)}</span>
                                                      {rc.author_association && rc.author_association !== 'NONE' && (
                                                        <span className="pr-comment-badge">{rc.author_association.toLowerCase()}</span>
                                                      )}
                                                      {rc.user?.login === user?.login && (
                                                        <Popover className="pr-comment-menu">
                                                          <PopoverButton className="pr-comment-menu-btn">···</PopoverButton>
                                                          <PopoverPanel anchor="bottom end" className="pr-comment-dropdown">
                                                            {({ close }) => (
                                                              <>
                                                                <button
                                                                  className="pr-comment-dropdown-item"
                                                                  onClick={() => { setEditingReviewComment(rc.id); close() }}
                                                                >
                                                                  <Pencil size={14} /> Edit
                                                                </button>
                                                                <button
                                                                  className="pr-comment-dropdown-item danger"
                                                                  onClick={() => { handleDeleteReviewComment(rc.id); close() }}
                                                                >
                                                                  <Trash size={14} /> Delete
                                                                </button>
                                                              </>
                                                            )}
                                                          </PopoverPanel>
                                                        </Popover>
                                                      )}
                                                    </div>
                                                    <div className="pr-comment-text">
                                                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{rc.body || ''}</ReactMarkdown>
                                                    </div>
                                                  </div>
                                                  </>
                                                  )}
                                                </div>
                                              ))}
                                              {threadPendingReplies.map(reply => (
                                                <div key={reply.id} className="pr-comment-item pending">
                                                  <img
                                                    className="pr-comment-avatar"
                                                    src={user?.avatar_url || 'https://avatars.githubusercontent.com/u/0?v=4'}
                                                    alt={user?.name || 'User'}
                                                  />
                                                  <div className="pr-comment-content">
                                                    <div className="pr-comment-meta">
                                                      <span className="pr-comment-author">{user?.name || user?.login}</span>
                                                      <span className="pr-comment-time">now</span>
                                                      <span className="pending-comment-badge">Pending</span>
                                                      <Popover className="pr-comment-menu">
                                                        <PopoverButton className="pr-comment-menu-btn">···</PopoverButton>
                                                        <PopoverPanel anchor="bottom end" className="pr-comment-dropdown">
                                                          {({ close }) => (
                                                            <button
                                                              className="pr-comment-dropdown-item danger"
                                                              onClick={() => { removeOperation(reply.id); close() }}
                                                            >
                                                              <Trash size={14} /> Delete
                                                            </button>
                                                          )}
                                                        </PopoverPanel>
                                                      </Popover>
                                                    </div>
                                                    <div className="pr-comment-text">
                                                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>{reply.body}</ReactMarkdown>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                              <div className="pr-comment-reply-box">
                                                {replyingTo === threadKey ? (
                                                  <InlineCommentEditor
                                                    avatar={user?.avatar_url}
                                                    userName={user?.name || user?.login}
                                                    fileName={file.fileName}
                                                    lineNum={line.newNum}
                                                    replyMode
                                                    onSubmit={({ body }) => handleReplySubmit(threadKey, parentCommentId, body)}
                                                    onCancel={() => setReplyingTo(null)}
                                                  />
                                                ) : (
                                                  <button
                                                    className="pr-reply-trigger"
                                                    onClick={() => setReplyingTo(threadKey)}
                                                  >
                                                    Write a reply...
                                                  </button>
                                                )}
                                              </div>
                                              <div className="pr-comment-thread-footer">
                                                <button
                                                  className="pr-resolve-btn"
                                                  onClick={() => handleResolveThread(parentCommentId, true)}
                                                >
                                                  <CheckCircle size={16} /> Resolve comment
                                                </button>
                                              </div>
                                            </div>
                                            )
                                          })()}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  {commentEditorOpen && commentEditorOpen.file === file.fileName && commentEditorOpen.endLine === lineNum && (
                                    <tr className="pending-comment-row">
                                      <td colSpan={3}>
                                        <div className="pending-comment-wrapper">
                                          <InlineCommentEditor
                                            avatar={user?.avatar_url}
                                            userName={user?.name || user?.login}
                                            fileName={file.fileName}
                                            lineNum={commentEditorOpen.endLine}
                                            startLine={commentEditorOpen.startLine !== commentEditorOpen.endLine ? commentEditorOpen.startLine : null}
                                            onSubmit={(data) => handleInlineCommentSubmit(data, file.fileName, commentEditorOpen.startLine, commentEditorOpen.endLine)}
                                            onCancel={() => { setCommentEditorOpen(null); setLineSelection(null); trackEvent('Inline Comment Cancelled', { file: file.fileName, startLine: commentEditorOpen.startLine, endLine: commentEditorOpen.endLine }) }}
                                            hasExistingComments={pendingComments.length > 0}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {pullRequests.length === 0 ? 'No pull requests assigned to you.' : 'Select a PR to view changes'}
            </div>
          )}
        </main>
      </div>

      <OnboardingModal />
    </div>
  )
}

export default AppPage
