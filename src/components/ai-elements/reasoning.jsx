import { useState } from 'react'
import { Brain, CaretDown, CaretRight } from '@phosphor-icons/react'
import './ai-elements.css'

export function Reasoning({ children, isStreaming = false, className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className={`ai-reasoning ${isOpen ? 'open' : ''} ${isStreaming ? 'streaming' : ''} ${className}`}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {children}
      </div>
    </div>
  )
}

export function ReasoningTrigger({ className = '' }) {
  return (
    <div className={`ai-reasoning-trigger ${className}`}>
      <Brain size={14} />
      <span>Reasoning</span>
      <CaretDown size={12} className="ai-reasoning-caret" />
    </div>
  )
}

export function ReasoningContent({ children, className = '' }) {
  return (
    <div className={`ai-reasoning-content ${className}`}>
      {children}
    </div>
  )
}
