import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

export function usePRDetails(owner, repo, prNumber) {
  return useQuery({
    queryKey: ['prDetails', owner, repo, prNumber],
    queryFn: async () => {
      const res = await apiFetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}`)
      return res.json()
    },
    enabled: !!owner && !!repo && !!prNumber,
  })
}
