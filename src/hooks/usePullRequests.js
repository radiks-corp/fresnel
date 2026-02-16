import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

export function usePullRequests(owner, repo) {
  return useQuery({
    queryKey: ['pulls', owner, repo],
    queryFn: async () => {
      const res = await apiFetch(`/api/repos/${owner}/${repo}/pulls`)
      return res.json()
    },
    enabled: !!owner && !!repo,
  })
}
