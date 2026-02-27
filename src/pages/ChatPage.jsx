import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { ArrowUp, ArrowLeft } from '@phosphor-icons/react'
import { jelly } from 'ldrs'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRepos } from '../hooks/useRepos'
import { trackEvent } from '../hooks/useAnalytics'
import './ChatPage.css'

jelly.register()

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function TableWrapper({ children, ...props }) {
  return (
    <div className="chat-table-wrapper">
      <table {...props}>{children}</table>
    </div>
  )
}

function MessageContent({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      components={{
        table: TableWrapper,
        pre({ children }) {
          const child = Array.isArray(children) ? children[0] : children
          if (child?.props?.className?.includes('language-')) {
            return <>{children}</>
          }
          return <pre>{children}</pre>
        },
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          if (!inline && match) {
            return (
              <SyntaxHighlighter
                style={oneLight}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: '8px 0',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          }
          return <code className={className} {...props}>{children}</code>
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

export default function ChatPage() {
  const { repoId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { data: repos = [] } = useRepos()
  const [input, setInput] = useState('')
  const initialPromptSent = useRef(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const selectedRepo = useMemo(() => {
    if (repoId) return repos.find(r => r.id.toString() === repoId) || null
    return null
  }, [repos, repoId])

  const owner = selectedRepo?.owner?.login
  const repo = selectedRepo?.name

  const getToken = () => localStorage.getItem('github_token') || localStorage.getItem('github_pat')

  const chatApiUrl = owner && repo
    ? `${API_URL}/api/repos/${owner}/${repo}/chat`
    : null

  const transport = useMemo(() => {
    if (!chatApiUrl) return null
    return new DefaultChatTransport({
      api: chatApiUrl,
      headers: () => ({
        'Authorization': `Bearer ${getToken()}`,
      }),
    })
  }, [chatApiUrl])

  const {
    messages,
    sendMessage,
    status,
    error,
  } = useChat({
    transport: transport || undefined,
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (initialPromptSent.current || !transport) return
    const prompt = searchParams.get('q')
    if (prompt) {
      initialPromptSent.current = true
      trackEvent('Chat Started from Homepage', { repo: `${owner}/${repo}` })
      sendMessage({ text: prompt })
    }
  }, [transport, searchParams, sendMessage, owner, repo])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!input.trim() || isLoading || !transport) return
    trackEvent('Chat Message Sent', { repo: `${owner}/${repo}` })
    sendMessage({ text: input })
    setInput('')
  }

  if (authLoading) return null

  return (
    <div className="chat-page">
      <div className="chat-page-content">
        <div className="chat-messages">
          {messages.map((msg) => {
            const textParts = msg.parts?.filter(p => p.type === 'text' && p.text) || []
            if (textParts.length === 0 && msg.role === 'assistant') return null
            return textParts.map((part, i) => (
              <div key={`${msg.id}-${i}`} className={`chat-msg chat-msg-${msg.role}`}>
                {msg.role === 'user' ? (
                  <div className="chat-msg-bubble chat-msg-user-bubble">
                    {part.text}
                  </div>
                ) : (
                  <div className="chat-msg-bubble chat-msg-assistant-bubble">
                    <MessageContent>{part.text}</MessageContent>
                  </div>
                )}
              </div>
            ))
          })}
          {isLoading && (() => {
            const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
            const hasContent = lastAssistant?.parts?.some(p => p.type === 'text' && p.text)
            return !hasContent
          })() && (
            <div className="chat-msg chat-msg-assistant">
              <div className="chat-msg-bubble chat-msg-assistant-bubble">
                <l-jelly size="20" speed="0.9" color="#9c9b99" />
              </div>
            </div>
          )}
          {error && (
            <div className="chat-msg-error">
              Something went wrong. Please try again.
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-bar">
          <button className="chat-back-btn" onClick={() => navigate('/app')}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="chat-input-form">
          <div className="chat-input-box" onClick={() => inputRef.current?.focus()}>
            <textarea
              ref={inputRef}
              className="chat-input-field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder="Ask a follow-up..."
              rows={2}
              disabled={!transport}
            />
            <button
              className={`chat-send-btn${input.trim() ? ' active' : ''}`}
              type="submit"
              disabled={!input.trim() || isLoading || !transport}
              aria-label="Send message"
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
