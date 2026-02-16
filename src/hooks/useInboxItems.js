import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

function buildRepoParam(repos) {
  return repos.map(r => `${r.owner.login}/${r.name}`).join(',')
}

export function useInboxIssues(repos, searchQuery = '') {
  const repoParam = repos?.length > 0 ? buildRepoParam(repos) : ''

  return useQuery({
    queryKey: ['inbox-issues', repoParam, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ repos: repoParam })
      if (searchQuery.trim()) params.set('q', searchQuery.trim())

      const res = await apiFetch(`/api/inbox/issues?${params}`)
      return res.json()
    },
    enabled: !!repoParam,
  })
}

export function useInboxPulls(repos, username, searchQuery = '') {
  const repoParam = repos?.length > 0 ? buildRepoParam(repos) : ''

  return useQuery({
    queryKey: ['inbox-pulls', repoParam, username, searchQuery],
    queryFn: async () => {
      if (!repoParam || !username) return []

      const params = new URLSearchParams({ repos: repoParam, username })
      if (searchQuery.trim()) params.set('q', searchQuery.trim())

      const res = await apiFetch(`/api/inbox/pulls?${params}`)
      return res.json()
    },
    enabled: !!repoParam && !!username,
  })
}
