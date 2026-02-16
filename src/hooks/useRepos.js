import { useQuery } from '@tanstack/react-query'
import { apiFetch, getToken } from './useGitHubAPI'

export function useRepos() {
  return useQuery({
    queryKey: ['repos'],
    queryFn: async () => {
      const res = await apiFetch('/api/repos')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      return data
    },
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000,
  })
}
