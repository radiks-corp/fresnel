import { useRef, useEffect, useState, createContext, useContext } from 'react'
import { ArrowDown } from '@phosphor-icons/react'
import './ai-elements.css'

const ConversationContext = createContext(null)

export function Conversation({ children, className = '' }) {
  const scrollRef = useRef(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    })
  }

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100)
  }

  return (
    <ConversationContext.Provider value={{ scrollRef, scrollToBottom, showScrollButton }}>
      <div className={`ai-conversation ${className}`} ref={scrollRef} onScroll={handleScroll}>
        {children}
      </div>
    </ConversationContext.Provider>
  )
}

export function ConversationContent({ children, className = '' }) {
  const { scrollRef } = useContext(ConversationContext) || {}
  
  useEffect(() => {
    // Auto-scroll on new content
    scrollRef?.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    })
  })

  return (
    <div className={`ai-conversation-content ${className}`}>
      {children}
    </div>
  )
}

export function ConversationEmptyState({ icon, title, description }) {
  return (
    <div className="ai-empty-state">
      {icon && <div className="ai-empty-state-icon">{icon}</div>}
      {title && <h3 className="ai-empty-state-title">{title}</h3>}
      {description && <p className="ai-empty-state-description">{description}</p>}
    </div>
  )
}

export function ConversationScrollButton() {
  const { scrollToBottom, showScrollButton } = useContext(ConversationContext) || {}
  
  if (!showScrollButton) return null

  return (
    <button className="ai-scroll-button" onClick={scrollToBottom}>
      <ArrowDown size={16} weight="bold" />
    </button>
  )
}
