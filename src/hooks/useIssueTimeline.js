import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

export function useIssueTimeline(owner, repo, issueNumber) {
  return useQuery({
    queryKey: ['issueTimeline', owner, repo, issueNumber],
    queryFn: async () => {
      const res = await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}/timeline`)
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    enabled: !!owner && !!repo && !!issueNumber,
  })
}
