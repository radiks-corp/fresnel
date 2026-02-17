import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'
import { recordDiagnosticEvent } from '../stores/diagnosticsStore'

export function useIssueTimeline(owner, repo, issueNumber) {
  return useQuery({
    queryKey: ['issueTimeline', owner, repo, issueNumber],
    queryFn: async () => {
      const startedAt = performance.now()
      const res = await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}/timeline`)
      const data = await res.json()
      recordDiagnosticEvent({
        category: 'issue',
        level: 'info',
        action: 'issue-timeline-loaded',
        message: `Loaded issue timeline for ${issueNumber}`,
        tags: { owner, repo, issueNumber, entries: Array.isArray(data) ? data.length : 0 },
        durationMs: Math.round(performance.now() - startedAt),
      })
      return Array.isArray(data) ? data : []
    },
    enabled: !!owner && !!repo && !!issueNumber,
  })
}
