import { useState, Fragment, useMemo, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { ChatCircle, Wrench, Check, SpinnerGap, ArrowUp } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ScrollToBottom, { useScrollToBottom } from 'react-scroll-to-bottom'
import './ai-elements/ai-elements.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Auto-scroll to bottom when new messages arrive
function ScrollToBottomOnNewMessage({ numMessages }) {
  const scrollToBottom = useScrollToBottom()

  useEffect(() => {
    scrollToBottom()
  }, [numMessages, scrollToBottom])

  return null
}

// Simple message component
function Message({ from, children }) {
  return (
    <div className={`ai-message ai-message-${from}`}>
      <div className="ai-message-content">
        {children}
      </div>
    </div>
  )
}

// Custom table wrapper for horizontal scrolling
function TableWrapper({ children, ...props }) {
  return (
    <div className="table-wrapper">
      <table {...props}>{children}</table>
    </div>
  )
}

// Markdown response renderer with custom table handling
function MessageResponse({ children }) {
  return (
    <div className="ai-message-response">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          table: TableWrapper,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

// Tool call display
function ToolCall({ toolName, args, result, state }) {
  const [isOpen, setIsOpen] = useState(false)
  
  const getStateIcon = () => {
    switch (state) {
      case 'partial-call':
      case 'call':
        return <SpinnerGap className="ai-tool-spinner" size={14} />
      case 'result':
        return <Check size={14} className="ai-tool-success" />
      default:
        return <Wrench size={14} />
    }
  }

  return (
    <div className="ai-tool">
      <div className="ai-tool-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="ai-tool-header-left">
          {getStateIcon()}
          <span className="ai-tool-name">{toolName}</span>
        </div>
        <span className={`ai-tool-state ai-tool-state-${state}`}>
          {state === 'result' ? 'Complete' : state === 'call' ? 'Running...' : state}
        </span>
      </div>
      {isOpen && (
        <div className="ai-tool-content">
          {args && (
            <div className="ai-tool-input">
              <div className="ai-tool-section-label">Input</div>
              <pre className="ai-tool-code">{JSON.stringify(args, null, 2)}</pre>
            </div>
          )}
          {result && (
            <div className="ai-tool-output">
              <div className="ai-tool-section-label">Output</div>
              <pre className="ai-tool-code">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Reasoning display - minimal and animated like spellbook
function Reasoning({ children, isStreaming }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className={`ai-reasoning ${isOpen ? 'open' : ''} ${isStreaming ? 'streaming' : ''}`}>
      <div className="ai-reasoning-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span className={`ai-reasoning-chevron ${isOpen ? 'expanded' : ''}`}>›</span>
        <span className={`ai-reasoning-label ${isStreaming ? 'shimmer' : ''}`}>
          {isStreaming ? 'Thinking...' : 'Thought for a moment'}
        </span>
      </div>
      <div className={`ai-reasoning-content ${isOpen ? 'visible' : ''}`}>
        <div className="ai-reasoning-text">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function AIChat({ owner, repo, prNumber }) {
  const [input, setInput] = useState('')

  // Get GitHub token for API calls
  const getToken = () => localStorage.getItem('github_pat')

  // Build API URL with repo details in route
  const apiUrl = owner && repo && prNumber 
    ? `${API_URL}/api/repos/${owner}/${repo}/pulls/${prNumber}/chat`
    : null

  // Memoize transport with auth headers - recreate when repo changes
  const transport = useMemo(() => {
    if (!apiUrl) return null
    return new DefaultChatTransport({
      api: apiUrl,
      headers: () => ({
        'Authorization': `Bearer ${getToken()}`,
      }),
    })
  }, [apiUrl])

  const { messages, sendMessage, status, error } = useChat({
    transport: transport || undefined,
  })

  const isLoading = status === 'submitted' || status === 'streaming'
  const isReady = !!transport

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim() && !isLoading && isReady) {
      sendMessage({ text: input })
      setInput('')
    }
  }

  const hasMessages = messages.length > 0

  const chatInput = (
    <form onSubmit={handleSubmit} className="ai-chat-form">
      <div className="chat-input-container">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          placeholder="Ask about this PR..."
          disabled={isLoading || !isReady}
          rows={2}
        />
        <div className="chat-input-actions">
          <div className="chat-input-icons" />
          <button 
            className={`chat-submit-btn ${input.trim() ? 'active' : ''}`}
            type="submit"
            disabled={!input.trim() || isLoading || !isReady}
          >
            {isLoading ? <SpinnerGap size={16} className="spinning" /> : <ArrowUp size={16} weight="bold" />}
          </button>
        </div>
      </div>
    </form>
  )

  return (
    <div className={`ai-chat-container ${hasMessages ? 'has-messages' : ''}`}>
      {!hasMessages && chatInput}
      
      <ScrollToBottom
        className="ai-conversation"
        followButtonClassName="hidden"
      >
        <div className="ai-conversation-content">
          {!isReady ? (
            <div className="ai-empty-state">
              <ChatCircle size={40} />
              <h3 className="ai-empty-state-title">Select a PR</h3>
              <p className="ai-empty-state-description">
                Select a repository and pull request to start asking questions.
              </p>
            </div>
          ) : !hasMessages ? (
            <div className="ai-empty-state">
              <ChatCircle size={40} />
              <h3 className="ai-empty-state-title">Ask about this PR</h3>
              <p className="ai-empty-state-description">
                Ask questions about the code changes, request a review, or get explanations.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <Fragment key={message.id}>
                {message.parts?.map((part, i) => {
                  switch (part.type) {
                    case 'text':
                      return (
                        <Message key={`${message.id}-${i}`} from={message.role}>
                          {message.role === 'assistant' ? (
                            <MessageResponse>{part.text}</MessageResponse>
                          ) : (
                            <div className="whitespace-pre-wrap">{part.text}</div>
                          )}
                        </Message>
                      )
                    
                    case 'reasoning':
                      return (
                        <Reasoning 
                          key={`${message.id}-${i}`}
                          isStreaming={status === 'streaming' && i === message.parts.length - 1}
                        >
                          {part.text}
                        </Reasoning>
                      )
                    
                    case 'tool-invocation':
                      return (
                        <ToolCall
                          key={`${message.id}-${i}`}
                          toolName={part.toolInvocation.toolName}
                          args={part.toolInvocation.args}
                          result={part.toolInvocation.result}
                          state={part.toolInvocation.state}
                        />
                      )
                    
                    default:
                      return null
                  }
                })}
              </Fragment>
            ))
          )}

          {status === 'error' && (
            <div className="ai-error-message">
              <div className="ai-error-title">Request failed</div>
              <div className="ai-error-text">{error?.message ?? 'Unknown error'}</div>
            </div>
          )}
          <ScrollToBottomOnNewMessage numMessages={messages.length} />
        </div>
      </ScrollToBottom>

      {hasMessages && chatInput}
    </div>
  )
}
