import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

const PULLS_PER_PAGE = 30

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

export function useInboxPulls(repos, username, searchQuery = '', reviewFilter = null) {
  const repoParam = repos?.length > 0 ? buildRepoParam(repos) : ''

  return useInfiniteQuery({
    queryKey: ['inbox-pulls', repoParam, username, searchQuery, reviewFilter, PULLS_PER_PAGE],
    queryFn: async ({ pageParam = 1 }) => {
      if (!repoParam || !username) return { items: [], hasNextPage: false, page: 1, totalCount: 0 }

      const params = new URLSearchParams({ repos: repoParam, username, page: String(pageParam), per_page: String(PULLS_PER_PAGE) })
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      if (reviewFilter) params.set('review_filter', reviewFilter)

      const res = await apiFetch(`/api/inbox/pulls?${params}`)
      return res.json()
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    enabled: !!repoParam && !!username,
    select: (data) => {
      const allPulls = data.pages.flatMap((p) => p.items ?? [])
      const totalCount = data.pages[0]?.totalCount ?? 0
      const lastPage = data.pages[data.pages.length - 1]
      return {
        pulls: allPulls,
        totalCount,
        hasMore: lastPage?.hasNextPage ?? false,
      }
    },
  })
}
