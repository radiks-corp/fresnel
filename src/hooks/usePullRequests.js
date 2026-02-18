import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'

export function usePullRequests(owner, repo, reviewFilter = null) {
  return useInfiniteQuery({
    queryKey: ['pulls', owner, repo, reviewFilter],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({ page: pageParam, per_page: 30 })
      if (reviewFilter) params.set('review_filter', reviewFilter)
      const res = await apiFetch(`/api/repos/${owner}/${repo}/pulls?${params}`)
      return res.json()
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.hasNextPage) {
        return lastPage.page + 1
      }
      return undefined
    },
    enabled: !!owner && !!repo,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      pullRequests: data.pages.flatMap((page) => page.items),
    }),
  })
}
