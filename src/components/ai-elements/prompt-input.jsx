import { PaperPlaneTilt, Stop } from '@phosphor-icons/react'
import './ai-elements.css'

export function PromptInput({ children, className = '' }) {
  return (
    <div className={`ai-prompt-input ${className}`}>
      {children}
    </div>
  )
}

export function PromptInputTextarea({ 
  value, 
  onChange, 
  onKeyDown,
  placeholder = 'Type a message...', 
  disabled = false,
  rows = 1,
  className = '' 
}) {
  return (
    <textarea
      className={`ai-prompt-textarea ${className}`}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
    />
  )
}

export function PromptInputSubmit({ 
  status = 'ready', 
  disabled = false, 
  onClick,
  className = '' 
}) {
  const isStreaming = status === 'streaming'
  
  return (
    <button 
      className={`ai-prompt-submit ${isStreaming ? 'streaming' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      type="submit"
    >
      {isStreaming ? <Stop size={16} weight="fill" /> : <PaperPlaneTilt size={16} weight="fill" />}
    </button>
  )
}
