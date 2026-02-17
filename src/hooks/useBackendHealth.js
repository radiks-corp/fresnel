import { useState, useEffect } from 'react'
import { recordDiagnosticEvent } from '../stores/diagnosticsStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function useBackendHealth() {
  const [isConnected, setIsConnected] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)

  useEffect(() => {
    let mounted = true
    let timeoutId

    const checkHealth = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

        const response = await fetch(`${API_URL}/health`, {
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (mounted) {
          setIsConnected(response.ok)
          setLastChecked(new Date())
          recordDiagnosticEvent({
            category: 'backend',
            level: response.ok ? 'info' : 'warn',
            action: 'backend-health-check',
            message: response.ok ? 'Backend health check passed' : 'Backend health check failed',
            tags: { status: response.status },
          })
        }
      } catch (error) {
        if (mounted) {
          setIsConnected(false)
          setLastChecked(new Date())
          recordDiagnosticEvent({
            category: 'backend',
            level: 'error',
            action: 'backend-health-check-error',
            message: error?.message || 'Backend health check threw',
          })
        }
      }

      // Check again in 30 seconds
      if (mounted) {
        timeoutId = setTimeout(checkHealth, 30000)
      }
    }

    // Initial check
    checkHealth()

    // Also check when window regains focus
    const handleFocus = () => checkHealth()
    window.addEventListener('focus', handleFocus)

    return () => {
      mounted = false
      clearTimeout(timeoutId)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return { isConnected, lastChecked }
}
