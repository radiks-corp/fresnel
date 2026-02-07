import { useState, useEffect } from 'react'
import './FeedSidebar.css'

// Format time ago
function formatTimeAgo(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 30) return `${diffDays}d`
  return date.toLocaleDateString()
}

function FeedSidebar({ isOpen, onSelectPR }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchReviewRequests() {
      const token = localStorage.getItem('github_pat')
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(
          'https://api.github.com/search/issues?q=review-requested:@me+type:pr+state:open&per_page=50&sort=updated',
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
            },
          }
        )

        if (!response.ok) {
          throw new Error('Failed to fetch')
        }

        const data = await response.json()
        setRequests(data.items || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (isOpen) {
      fetchReviewRequests()
    }
  }, [isOpen])

  const handleClick = (pr) => {
    const match = pr.repository_url.match(/repos\/([^/]+)\/([^/]+)$/)
    if (match && onSelectPR) {
      const [, owner, repo] = match
      onSelectPR({ owner, repo, number: pr.number, title: pr.title })
    }
  }

  return (
    <aside className={`feed-sidebar ${isOpen ? 'open' : 'closed'}`}>
      <div className="feed-sidebar-header">
        Review Requests
      </div>
      <div className="feed-sidebar-content">
        {loading ? (
          <div className="feed-loading">Loading...</div>
        ) : error ? (
          <div className="feed-error">Failed to load: {error}</div>
        ) : requests.length === 0 ? (
          <div className="feed-empty">No pending review requests</div>
        ) : (
          <div className="feed-list">
            {requests.map((pr) => (
              <div
                key={pr.id}
                className="feed-card"
                onClick={() => handleClick(pr)}
              >
                <img
                  src={pr.user.avatar_url}
                  alt={pr.user.login}
                  className="feed-card-avatar"
                />
                <div className="feed-card-content">
                  <div className="feed-card-title">{pr.title}</div>
                  <div className="feed-card-meta">
                    {pr.user.login} · {formatTimeAgo(pr.updated_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

export default FeedSidebar
