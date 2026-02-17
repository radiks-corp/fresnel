import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './useGitHubAPI'
import { recordDiagnosticEvent } from '../stores/diagnosticsStore'

export function useBackendDiagnostics(enabled) {
  return useQuery({
    queryKey: ['backendDiagnostics'],
    queryFn: async () => {
      const res = await apiFetch('/api/diagnostics')
      const data = await res.json()
      recordDiagnosticEvent({
        category: 'backend',
        level: 'info',
        action: 'backend-diagnostics-poll',
        message: 'Fetched backend diagnostics snapshot',
        tags: { count: data?.count || 0, errorCount: data?.errorCount || 0 },
      })
      return data
    },
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    staleTime: 10_000,
  })
}

export function useClearBackendDiagnostics() {
  const queryClient = useQueryClient()
  return async function clearBackendDiagnostics() {
    const res = await apiFetch('/api/diagnostics', { method: 'DELETE' })
    await res.json()
    await queryClient.invalidateQueries({ queryKey: ['backendDiagnostics'] })
    recordDiagnosticEvent({
      category: 'backend',
      level: 'warn',
      action: 'backend-diagnostics-cleared',
      message: 'Backend diagnostics buffer was cleared',
    })
  }
}
