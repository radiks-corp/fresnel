import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

export function usePRDiff(owner, repo, prNumber) {
  return useQuery({
    queryKey: ['diff', owner, repo, prNumber],
    queryFn: async () => {
      const res = await apiFetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/diff`)
      return res.text()
    },
    enabled: !!owner && !!repo && !!prNumber,
  })
}
