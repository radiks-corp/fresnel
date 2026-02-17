import { useState, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import './InlineCommentEditor.css'

function ToolbarButton({ children, title, onClick }) {
  return (
    <button
      type="button"
      className="ice-toolbar-btn"
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function InlineCommentEditor({ avatar, userName, fileName, lineNum, startLine, onSubmit, onCancel, hasExistingComments, initialBody = '', editMode = false, replyMode = false, isSubmitting = false }) {
  const [mode, setMode] = useState('write')
  const [body, setBody] = useState(initialBody)
  const textareaRef = useRef(null)

  const insertMarkdown = useCallback((prefix, suffix = '', placeholder = '') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = body.slice(start, end) || placeholder
    const before = body.slice(0, start)
    const after = body.slice(end)
    const inserted = `${prefix}${selected}${suffix}`
    setBody(before + inserted + after)
    requestAnimationFrame(() => {
      ta.focus()
      const cursorPos = start + prefix.length + selected.length
      ta.setSelectionRange(cursorPos, cursorPos)
    })
  }, [body])

  const handleSubmit = (type) => {
    if (!body.trim()) return
    onSubmit({ body: body.trim(), type })
    setBody('')
  }

  return (
    <div className="inline-comment-editor">
      {!replyMode && !editMode && (
        <div className="ice-header">
          <img
            className="ice-avatar"
            src={avatar || 'https://avatars.githubusercontent.com/u/0?v=4'}
            alt={userName || 'User'}
          />
          <span className="ice-title">
            Add a comment on {startLine ? <>lines <strong>R{startLine}</strong> to <strong>R{lineNum}</strong></> : <>line <strong>R{lineNum}</strong></>}
          </span>
        </div>
      )}

      <div className="ice-editor-box">
        <div className="ice-tabbar">
          <div className="ice-tabs">
            <button
              className={`ice-tab ${mode === 'write' ? 'active' : ''}`}
              onClick={() => setMode('write')}
            >
              Write
            </button>
            <button
              className={`ice-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              Preview
            </button>
          </div>
          {mode === 'write' && (
            <div className="ice-toolbar">
              <ToolbarButton title="Add heading" onClick={() => insertMarkdown('### ', '', 'Heading')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 2a.75.75 0 0 1 .75.75V7h7V2.75a.75.75 0 0 1 1.5 0v10.5a.75.75 0 0 1-1.5 0V8.5h-7v4.75a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 3.75 2Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Bold" onClick={() => insertMarkdown('**', '**', 'bold text')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h4.5a3.501 3.501 0 0 1 2.852 5.53A3.499 3.499 0 0 1 9.5 14H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm1 7v3h4.5a1.5 1.5 0 0 0 0-3Zm3.5-2a1.5 1.5 0 0 0 0-3H5v3Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Italic" onClick={() => insertMarkdown('_', '_', 'italic text')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2.75A.75.75 0 0 1 6.75 2h6.5a.75.75 0 0 1 0 1.5h-2.505l-3.858 9H9.25a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.505l3.858-9H6.75A.75.75 0 0 1 6 2.75Z"/></svg>
              </ToolbarButton>

              <div className="ice-toolbar-sep" />

              <ToolbarButton title="Quote" onClick={() => insertMarkdown('> ', '', 'quote')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 2.5h10.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Zm4 5h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5Zm-4 5h10.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5ZM1.75 7h.01a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1 0-1.5Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Code" onClick={() => insertMarkdown('`', '`', 'code')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Link" onClick={() => insertMarkdown('[', '](url)', 'link text')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/></svg>
              </ToolbarButton>

              <div className="ice-toolbar-sep" />

              <ToolbarButton title="Bulleted list" onClick={() => insertMarkdown('- ', '', 'item')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Numbered list" onClick={() => insertMarkdown('1. ', '', 'item')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 3.25Zm0 5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 8.25Zm0 5a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75ZM.924 10.32l.856-.67a.25.25 0 0 0-.075-.438l-.108-.027a.25.25 0 0 1 .108-.49h.22c.191 0 .354.124.41.305l.068.22a.25.25 0 0 1-.069.255l-.815.638a.25.25 0 0 0-.096.206v.1h1.3a.25.25 0 0 1 0 .5H.75a.75.75 0 0 1-.75-.75v-.01a.75.75 0 0 1 .289-.593ZM1 2.75a.25.25 0 0 1 .25-.25h.268a.25.25 0 0 1 .25.25v2h.5a.25.25 0 0 1 0 .5H.75a.25.25 0 0 1 0-.5h.5v-1.5H1.25A.25.25 0 0 1 1 2.75Z"/></svg>
              </ToolbarButton>
              <ToolbarButton title="Task list" onClick={() => insertMarkdown('- [ ] ', '', 'task')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 1.75v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H2.75a.25.25 0 0 0-.25.25Zm-1.5 0C1 .784 1.784 0 2.75 0h10.5C14.216 0 15 .784 15 1.75v12.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25ZM7.25 8a.75.75 0 0 1 .75-.75h3.25a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3.25a.75.75 0 0 0 0-1.5ZM7.25 4a.75.75 0 0 1 .75-.75h3.25a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 7.25 4ZM4.56 6.22a.749.749 0 0 1 0 1.06l-1 1a.749.749 0 0 1-1.06 0l-.5-.5a.749.749 0 1 1 1.06-1.06l-.97.97.47-.47a.749.749 0 0 1 1.06 0Z"/></svg>
              </ToolbarButton>
            </div>
          )}
        </div>

        {mode === 'write' ? (
          <textarea
            ref={textareaRef}
            className="ice-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Leave a comment"
            rows={4}
            autoFocus
          />
        ) : (
          <div className="ice-preview">
            {body.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
                {body}
              </ReactMarkdown>
            ) : (
              <span className="ice-preview-empty">Nothing to preview</span>
            )}
          </div>
        )}
      </div>

      <div className="ice-footer">
        <div className="ice-footer-right">
          <button className="ice-btn ice-btn-cancel" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          {editMode ? (
            <button
              className="ice-btn ice-btn-review"
              onClick={() => handleSubmit('edit')}
              disabled={!body.trim() || isSubmitting}
            >
              Update
            </button>
          ) : replyMode ? (
            <button
              className="ice-btn ice-btn-review"
              onClick={() => handleSubmit('reply')}
              disabled={!body.trim() || isSubmitting}
            >
              Reply
            </button>
          ) : (
            <button
              className="ice-btn ice-btn-review"
              onClick={() => handleSubmit('review')}
              disabled={!body.trim()}
            >
              {hasExistingComments ? 'Add review comment' : 'Start a review'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
