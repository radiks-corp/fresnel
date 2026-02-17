import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

export function useIssueDetails(owner, repo, issueNumber) {
  return useQuery({
    queryKey: ['issueDetails', owner, repo, issueNumber],
    queryFn: async () => {
      const res = await apiFetch(`/api/repos/${owner}/${repo}/issues/${issueNumber}`)
      return await res.json()
    },
    enabled: !!owner && !!repo && !!issueNumber,
  })
}
