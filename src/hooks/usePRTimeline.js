import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

export function usePRTimeline(owner, repo, prNumber) {
  return useQuery({
    queryKey: ['timeline', owner, repo, prNumber],
    queryFn: async () => {
      const res = await apiFetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/timeline`)
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    enabled: !!owner && !!repo && !!prNumber,
  })
}
