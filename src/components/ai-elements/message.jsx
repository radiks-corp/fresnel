import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import './ai-elements.css'

export function Message({ children, from, className = '' }) {
  return (
    <div className={`ai-message ai-message-${from} ${className}`}>
      {children}
    </div>
  )
}

export function MessageContent({ children, className = '' }) {
  return (
    <div className={`ai-message-content ${className}`}>
      {children}
    </div>
  )
}

export function MessageResponse({ children, className = '' }) {
  return (
    <div className={`ai-message-response ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
