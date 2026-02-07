import { useState } from 'react'
import { CaretDown, CaretRight, Wrench, Check, Spinner, X } from '@phosphor-icons/react'
import './ai-elements.css'

export function Tool({ children, defaultOpen = false, className = '' }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  return (
    <div className={`ai-tool ${isOpen ? 'open' : ''} ${className}`}>
      <div className="ai-tool-children" onClick={() => setIsOpen(!isOpen)}>
        {children}
      </div>
    </div>
  )
}

export function ToolHeader({ type, state, className = '' }) {
  // Extract tool name from type (e.g., "tool-getWeather" -> "getWeather")
  const toolName = type?.replace(/^tool-/, '') || 'Unknown Tool'
  
  const getStateIcon = () => {
    switch (state) {
      case 'input-streaming':
      case 'partial-call':
        return <Spinner className="ai-tool-spinner" size={14} />
      case 'output-available':
        return <Check size={14} className="ai-tool-success" />
      case 'output-error':
        return <X size={14} className="ai-tool-error" />
      default:
        return <Wrench size={14} />
    }
  }

  const getStateLabel = () => {
    switch (state) {
      case 'input-streaming':
      case 'partial-call':
        return 'Running...'
      case 'input-available':
        return 'Ready'
      case 'output-available':
        return 'Complete'
      case 'output-error':
        return 'Error'
      default:
        return state
    }
  }

  return (
    <div className={`ai-tool-header ${className}`}>
      <div className="ai-tool-header-left">
        {getStateIcon()}
        <span className="ai-tool-name">{toolName}</span>
      </div>
      <span className={`ai-tool-state ai-tool-state-${state}`}>
        {getStateLabel()}
      </span>
    </div>
  )
}

export function ToolContent({ children, className = '' }) {
  return (
    <div className={`ai-tool-content ${className}`}>
      {children}
    </div>
  )
}

export function ToolInput({ input, className = '' }) {
  const formatted = typeof input === 'string' 
    ? input 
    : JSON.stringify(input, null, 2)

  return (
    <div className={`ai-tool-input ${className}`}>
      <div className="ai-tool-section-label">Input</div>
      <pre className="ai-tool-code">{formatted}</pre>
    </div>
  )
}

export function ToolOutput({ output, errorText, className = '' }) {
  if (errorText) {
    return (
      <div className={`ai-tool-output ai-tool-output-error ${className}`}>
        <div className="ai-tool-section-label">Error</div>
        <pre className="ai-tool-code ai-tool-error-text">{errorText}</pre>
      </div>
    )
  }

  return (
    <div className={`ai-tool-output ${className}`}>
      <div className="ai-tool-section-label">Output</div>
      <div className="ai-tool-output-content">{output}</div>
    </div>
  )
}
