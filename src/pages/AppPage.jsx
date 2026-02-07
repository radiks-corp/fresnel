import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { CaretDown, CaretRight, Check, MagnifyingGlass, File, Folder, FolderOpen, Funnel, SidebarSimple } from '@phosphor-icons/react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { useAuth } from '../hooks/useAuth.jsx'
import ReviewSidebar from '../components/ReviewSidebar'
import FeedSidebar from '../components/FeedSidebar'
import InlineCommentEditor from '../components/InlineCommentEditor'
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
  const [repos, setRepos] = useState([])
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [loadingRepos, setLoadingRepos] = useState(true)
  
  const [pullRequests, setPullRequests] = useState([])
  const [selectedPR, setSelectedPR] = useState(null)
  const [loadingPRs, setLoadingPRs] = useState(false)
  
  const [diff, setDiff] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)
  
  const [prDetails, setPrDetails] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  
  const [activeTab, setActiveTab] = useState('conversation')
  const [viewedFiles, setViewedFiles] = useState({})
  const [collapsedFiles, setCollapsedFiles] = useState({})
  const [pendingComments, setPendingComments] = useState([])
  const [collapsedComments, setCollapsedComments] = useState({})
  const [editingComment, setEditingComment] = useState(null) // comment id
  const [commentEditorOpen, setCommentEditorOpen] = useState(null) // { file, line }
  const [expandedHunks, setExpandedHunks] = useState({})
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState({})
  const [selectedExtensions, setSelectedExtensions] = useState({})
  const [hideViewedFiles, setHideViewedFiles] = useState(false)
  const [feedSidebarOpen, setFeedSidebarOpen] = useState(true)
  
  // Auth modal state (for Electron)
  const [patInput, setPatInput] = useState('')
  const [patError, setPatError] = useState('')
  const [patLoading, setPatLoading] = useState(false)
  
  const { user, isAuthenticated, loading, logout, login } = useAuth()
  const navigate = useNavigate()
  const { repoId: urlRepoId, prNumber: urlPrNumber } = useParams()
  
  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

  // Update URL when repo/PR selection changes
  const updateUrl = useCallback((repo, pr) => {
    if (repo && pr) {
      navigate(`/app/${repo.id}/${pr.number}`, { replace: true })
    } else if (repo) {
      navigate(`/app/${repo.id}`, { replace: true })
    } else {
      navigate('/app', { replace: true })
    }
  }, [navigate])

  // Get the stored PAT
  const getToken = () => localStorage.getItem('github_pat')

  const parsedFiles = useMemo(() => parseDiff(diff), [diff])
  const viewedCount = Object.values(viewedFiles).filter(Boolean).length

  useEffect(() => {
    // Only redirect to landing page on web, not in Electron (modal handles auth)
    if (!loading && !isAuthenticated && !isElectron) {
      navigate('/')
    }
  }, [loading, isAuthenticated, navigate, isElectron])
  
  // Handle PAT submission in Electron
  const handlePatSubmit = async (e) => {
    e.preventDefault()
    if (!patInput.trim()) {
      setPatError('Please enter a token')
      return
    }
    setPatLoading(true)
    setPatError('')
    const success = await login(patInput.trim())
    setPatLoading(false)
    if (!success) {
      setPatError('Invalid token. Make sure it has repo access.')
    }
  }

  useEffect(() => {
    async function fetchRepos() {
      const token = getToken()
      console.log('fetchRepos called, token exists:', !!token, 'isAuthenticated:', isAuthenticated)
      if (!token) {
        console.log('No token found, returning early')
        setLoadingRepos(false)
        return
      }

      try {
        console.log('Fetching repos from:', `${import.meta.env.VITE_API_URL}/api/repos`)
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/repos`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const data = await response.json()
        console.log('Repos fetched:', data.length, 'data:', JSON.stringify(data).substring(0, 200))
        
        if (data.error) {
          console.error('API error:', data.error)
          // Token might be invalid, try to refresh
          logout()
          navigate('/')
          return
        }
        
        setRepos(data)
        
        // Select repo from URL or default to first
        if (data.length > 0 && !selectedRepo) {
          if (urlRepoId) {
            const repoFromUrl = data.find(r => r.id.toString() === urlRepoId)
            if (repoFromUrl) {
              setSelectedRepo(repoFromUrl)
            } else {
              // URL repo not found, select first and update URL
              setSelectedRepo(data[0])
              updateUrl(data[0], null)
            }
          } else {
            setSelectedRepo(data[0])
            updateUrl(data[0], null)
          }
        }
      } catch (error) {
        console.error('Failed to fetch repos:', error)
      } finally {
        setLoadingRepos(false)
      }
    }

    console.log('useEffect for fetchRepos, isAuthenticated:', isAuthenticated)
    if (isAuthenticated) {
      fetchRepos()
    }
  }, [isAuthenticated])

  useEffect(() => {
    async function fetchPRs() {
      if (!selectedRepo) return
      
      const token = getToken()
      if (!token) return

      setLoadingPRs(true)
      setPullRequests([])
      setSelectedPR(null)
      setDiff('')
      setViewedFiles({})

      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/repos/${selectedRepo.owner.login}/${selectedRepo.name}/pulls`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        )
        const data = await response.json()
        setPullRequests(data)
        
        // Select PR from URL or default to first
        if (data.length > 0) {
          if (urlPrNumber && selectedRepo.id.toString() === urlRepoId) {
            const prFromUrl = data.find(pr => pr.number.toString() === urlPrNumber)
            if (prFromUrl) {
              setSelectedPR(prFromUrl)
            } else {
              // URL PR not found, select first and update URL
              setSelectedPR(data[0])
              updateUrl(selectedRepo, data[0])
            }
          } else {
            setSelectedPR(data[0])
            updateUrl(selectedRepo, data[0])
          }
        }
      } catch (error) {
        console.error('Failed to fetch PRs:', error)
      } finally {
        setLoadingPRs(false)
      }
    }

    fetchPRs()
  }, [selectedRepo, urlRepoId, urlPrNumber, updateUrl])

  useEffect(() => {
    async function fetchDiff() {
      if (!selectedRepo || !selectedPR) return
      
      const token = getToken()
      if (!token) return

      setLoadingDiff(true)
      setViewedFiles({})

      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/repos/${selectedRepo.owner.login}/${selectedRepo.name}/pulls/${selectedPR.number}/diff`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        )
        const data = await response.text()
        setDiff(data)
      } catch (error) {
        console.error('Failed to fetch diff:', error)
      } finally {
        setLoadingDiff(false)
      }
    }

    fetchDiff()
  }, [selectedPR, selectedRepo])

  // Fetch PR details and timeline when PR is selected
  useEffect(() => {
    async function fetchPRDetails() {
      if (!selectedRepo || !selectedPR) return
      
      const token = getToken()
      if (!token) return

      setLoadingTimeline(true)

      try {
        const [detailsRes, timelineRes] = await Promise.all([
          fetch(
            `${import.meta.env.VITE_API_URL}/api/repos/${selectedRepo.owner.login}/${selectedRepo.name}/pulls/${selectedPR.number}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          ),
          fetch(
            `${import.meta.env.VITE_API_URL}/api/repos/${selectedRepo.owner.login}/${selectedRepo.name}/pulls/${selectedPR.number}/timeline`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          ),
        ])
        
        const [details, timelineData] = await Promise.all([
          detailsRes.json(),
          timelineRes.json(),
        ])
        
        setPrDetails(details)
        setTimeline(Array.isArray(timelineData) ? timelineData : [])
      } catch (error) {
        console.error('Failed to fetch PR details:', error)
      } finally {
        setLoadingTimeline(false)
      }
    }

    fetchPRDetails()
  }, [selectedPR, selectedRepo])

  const toggleViewed = (fileName) => {
    const newViewedState = !viewedFiles[fileName]
    setViewedFiles(prev => ({ ...prev, [fileName]: newViewedState }))
    // Collapse when marking as viewed
    if (newViewedState) {
      setCollapsedFiles(prev => ({ ...prev, [fileName]: true }))
    }
  }

  const toggleCollapsed = (fileName) => {
    setCollapsedFiles(prev => ({ ...prev, [fileName]: !prev[fileName] }))
  }

  const scrollToFile = (fileName) => {
    const el = document.getElementById(`file-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleJumpToLine = useCallback((filePath, lineNumber) => {
    // Switch to files tab
    setActiveTab('files')
    
    // Expand the file if collapsed
    setCollapsedFiles(prev => ({ ...prev, [filePath]: false }))
    
    // Wait for DOM to update, then scroll to line
    setTimeout(() => {
      const lineEl = document.querySelector(`tr[data-file="${filePath}"][data-line="${lineNumber}"]`)
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Highlight the line briefly
        lineEl.classList.add('highlight-jump')
        setTimeout(() => lineEl.classList.remove('highlight-jump'), 2000)
      } else {
        // Fallback: scroll to the file
        scrollToFile(filePath)
      }
    }, 100)
  }, [])

  const handleApplyComment = useCallback((comment) => {
    setPendingComments(prev => {
      // Avoid duplicates
      if (prev.some(c => c.id === comment.id)) return prev
      return [...prev, comment]
    })
  }, [])

  const handleEditComment = useCallback((commentId, newBody) => {
    setPendingComments(prev => prev.map(c => 
      c.id === commentId ? { ...c, body: newBody } : c
    ))
    setEditingComment(null)
  }, [])

  const handleDeleteComment = useCallback((commentId) => {
    setPendingComments(prev => prev.filter(c => c.id !== commentId))
  }, [])

  const handleInlineCommentSubmit = useCallback(({ body, type }, fileName, lineNum) => {
    const commentId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const comment = {
      id: commentId,
      path: fileName,
      line: lineNum,
      body,
      severity: 'comment',
    }
    setPendingComments(prev => [...prev, comment])
    setCommentEditorOpen(null)
  }, [])

  // Handle selecting a PR from the feed
  const handleSelectPR = useCallback(async ({ owner, repo: repoName, number }) => {
    const token = getToken()
    if (!token) return

    // Find the repo in our list or fetch it
    let targetRepo = repos.find(r => r.owner.login === owner && r.name === repoName)
    
    if (!targetRepo) {
      // Repo not in our list, try to fetch it
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (response.ok) {
          targetRepo = await response.json()
          setRepos(prev => [...prev, targetRepo])
        }
      } catch (error) {
        console.error('Failed to fetch repo:', error)
        return
      }
    }

    if (targetRepo) {
      setSelectedRepo(targetRepo)
      // Fetch PRs for this repo and select the right one
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/repos/${owner}/${repoName}/pulls`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        )
        const prs = await response.json()
        setPullRequests(prs)
        const targetPR = prs.find(pr => pr.number === number)
        if (targetPR) {
          setSelectedPR(targetPR)
          updateUrl(targetRepo, targetPR)
          setFeedSidebarOpen(false)
        }
      } catch (error) {
        console.error('Failed to fetch PRs:', error)
      }
    }
  }, [repos, getToken, updateUrl])

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
  }

  const toggleExtension = (ext) => {
    setSelectedExtensions(prev => ({ ...prev, [ext]: !prev[ext] }))
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
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]}>{item.body}</ReactMarkdown>
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
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]}>{item.body || ''}</ReactMarkdown>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className={`app-layout-v2 ${feedSidebarOpen ? 'feed-open' : ''}`}>
      <FeedSidebar isOpen={feedSidebarOpen} onSelectPR={handleSelectPR} />
      <header className="app-header">
        <div className="header-left">
          <Popover className="header-selector">
            <PopoverButton className="header-selector-trigger">
              <Folder size={16} weight="fill" className="header-selector-icon" />
              {loadingRepos ? (
                <span className="header-selector-text">Loading...</span>
              ) : selectedRepo ? (
                <span className="header-selector-text">{selectedRepo.name}</span>
              ) : (
                <span className="header-selector-text">No repos</span>
              )}
              <CaretDown size={12} className="header-selector-caret" />
            </PopoverButton>
            
            <PopoverPanel className="header-dropdown">
              {({ close }) => (
                <>
                  {repos.map((repo) => (
                    <div
                      key={repo.id}
                      className={`header-dropdown-item ${selectedRepo?.id === repo.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedRepo(repo)
                        navigate(`/app/${repo.id}`, { replace: true })
                        close()
                      }}
                    >
                      <Folder size={14} className="header-dropdown-icon" />
                      <span className="header-dropdown-text">{repo.owner.login}/{repo.name}</span>
                      {repo.private && <span className="header-dropdown-badge">Private</span>}
                    </div>
                  ))}
                </>
              )}
            </PopoverPanel>
          </Popover>

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
                          updateUrl(selectedRepo, pr)
                          close()
                        }}
                      >
                        <span className="header-dropdown-number">#{pr.number}</span>
                        <span className="header-dropdown-text">{pr.title}</span>
                      </div>
                    ))}
                  </>
                )}
              </PopoverPanel>
            )}
          </Popover>
        </div>

        <div className="header-right">
          <button 
            className="feed-toggle-btn"
            onClick={() => setFeedSidebarOpen(!feedSidebarOpen)}
            title={feedSidebarOpen ? 'Close feed' : 'Open feed'}
          >
            <SidebarSimple 
              size={18} 
              weight={feedSidebarOpen ? 'fill' : 'regular'} 
            />
          </button>
        </div>
      </header>

      <div className="tabs-bar">
        <button 
          className={`tab ${activeTab === 'conversation' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversation')}
        >
          Conversation <span className="tab-count">{timeline.filter(t => t.type === 'issue_comment' || t.type === 'review').length + (prDetails?.body ? 1 : 0)}</span>
        </button>
        <button 
          className={`tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files changed <span className="tab-count">{parsedFiles.length}</span>
        </button>
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
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkEmoji]}>{prDetails.body}</ReactMarkdown>
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
                              return (
                                <React.Fragment key={lineIdx}>
                                  <tr 
                                    className={`diff-line ${line.type}`}
                                    data-file={file.fileName}
                                    data-line={lineNum || ''}
                                  >
                                    <td className="line-num old">{line.oldNum || ''}</td>
                                    <td 
                                      className="line-num new clickable"
                                      onClick={() => lineNum && setCommentEditorOpen({ file: file.fileName, line: lineNum })}
                                      title={lineNum ? 'Click to add a comment' : ''}
                                    >
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
                                              <span>Comment on line <strong>R{comment.line}</strong></span>
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
                                                    <PopoverPanel className="pending-comment-dropdown">
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
                                                  <ReactMarkdown>{comment.body}</ReactMarkdown>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {commentEditorOpen && commentEditorOpen.file === file.fileName && commentEditorOpen.line === lineNum && (
                                    <tr className="pending-comment-row">
                                      <td colSpan={3}>
                                        <div className="pending-comment-wrapper">
                                          <InlineCommentEditor
                                            avatar={user?.avatar_url}
                                            userName={user?.name || user?.login}
                                            fileName={file.fileName}
                                            lineNum={lineNum}
                                            onSubmit={(data) => handleInlineCommentSubmit(data, file.fileName, lineNum)}
                                            onCancel={() => setCommentEditorOpen(null)}
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
              {pullRequests.length === 0 ? 'No open pull requests' : 'Select a PR to view changes'}
            </div>
          )}
        </main>
      </div>

      <ReviewSidebar 
        owner={selectedRepo?.owner?.login}
        repo={selectedRepo?.name}
        prNumber={selectedPR?.number}
        chatKey={`${selectedRepo?.id}-${selectedPR?.number}`}
        userAvatar={user?.avatar_url}
        userName={user?.name || user?.login}
        onJumpToLine={handleJumpToLine}
        onApplyComment={handleApplyComment}
        viewedCount={viewedCount}
        totalFiles={parsedFiles.length}
        pendingComments={pendingComments}
      />

      {/* Electron Auth Modal - shown over blurred app when not authenticated */}
      {isElectron && !isAuthenticated && !loading && (
        <div className="electron-auth-overlay">
          <div className="electron-auth-modal">
            <h2 className="electron-auth-title">Connect to GitHub</h2>
            <p className="electron-auth-desc">
              Enter your Personal Access Token with <code>repo</code> scope.
            </p>
            <form onSubmit={handlePatSubmit}>
              <input
                type="password"
                className="electron-auth-input"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={patInput}
                onChange={e => setPatInput(e.target.value)}
                autoFocus
              />
              {patError && <p className="electron-auth-error">{patError}</p>}
              <button type="submit" className="electron-auth-btn" disabled={patLoading}>
                {patLoading ? 'Connecting...' : 'Connect to GitHub'}
              </button>
            </form>
            <a 
              href="https://github.com/settings/tokens/new?scopes=repo&description=Fresnel" 
              target="_blank" 
              rel="noopener noreferrer"
              className="electron-auth-link"
            >
              Create a new token →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppPage
