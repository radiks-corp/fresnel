import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './InlineCommentEditor.css'

export default function InlineCommentEditor({ avatar, userName, fileName, lineNum, onSubmit, onCancel, hasExistingComments, initialBody = '', editMode = false }) {
  const [mode, setMode] = useState('write')
  const [body, setBody] = useState(initialBody)

  const handleSubmit = (type) => {
    if (!body.trim()) return
    onSubmit({ body: body.trim(), type })
    setBody('')
  }

  return (
    <div className="inline-comment-editor">
      <div className="ice-header">
        <img
          className="ice-avatar"
          src={avatar || 'https://avatars.githubusercontent.com/u/0?v=4'}
          alt={userName || 'User'}
        />
        <span className="ice-title">
          Add a comment on line <strong>R{lineNum}</strong>
        </span>
      </div>

      <div className="ice-body">
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

        <div className="ice-content">
          {mode === 'write' ? (
            <textarea
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {body}
                </ReactMarkdown>
              ) : (
                <span className="ice-preview-empty">Nothing to preview</span>
              )}
            </div>
          )}
        </div>

        <div className="ice-footer">
          <div className="ice-footer-left" />
          <div className="ice-footer-right">
            <button className="ice-btn ice-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            {editMode ? (
              <button
                className="ice-btn ice-btn-review"
                onClick={() => handleSubmit('edit')}
                disabled={!body.trim()}
              >
                Update comment
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
    </div>
  )
}
