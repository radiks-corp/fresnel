import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'
import { recordDiagnosticEvent } from '../stores/diagnosticsStore'

export function useIssueDetails(owner, repo, issueNumber) {
  return useQuery({
    queryKey: ['issueDetails', owner, repo, issueNumber],
    queryFn: async () => {
      const startedAt = performance.now()
      const res = await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}`)
      const payload = await res.json()
      recordDiagnosticEvent({
        category: 'issue',
        level: 'info',
        action: 'issue-details-loaded',
        message: `Loaded issue ${issueNumber}`,
        tags: { owner, repo, issueNumber },
        durationMs: Math.round(performance.now() - startedAt),
      })
      return payload
    },
    enabled: !!owner && !!repo && !!issueNumber,
  })
}
