import { useState, useEffect, createContext, useContext } from 'react'
import { identifyUser, resetAnalytics, trackEvent } from './useAnalytics'

const AuthContext = createContext(null)

// Helper to check if running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron
}

// Start Electron notification polling
const startElectronPolling = (pat) => {
  if (isElectron() && pat) {
    console.log('Starting Electron review request polling...')
    window.electronAPI.startReviewPolling(pat)
  }
}

// Stop Electron notification polling
const stopElectronPolling = () => {
  if (isElectron()) {
    console.log('Stopping Electron review request polling...')
    window.electronAPI.stopReviewPolling()
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(null)

  const fetchUser = async (pat) => {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        setToken(pat)
        localStorage.setItem('github_pat', pat)
        // Identify user for analytics (no PAT stored)
        identifyUser(userData)
        trackEvent('User Logged In', {
          github_login: userData.login,
          app_type: isElectron() ? 'electron' : 'web',
        })
        // Start Electron polling when authenticated
        startElectronPolling(pat)
        return true
      }
      trackEvent('User Login Failed')
      return false
    } catch (error) {
      console.error('Failed to fetch user:', error)
      return false
    }
  }

  useEffect(() => {
    // Check for existing PAT on mount
    const storedPat = localStorage.getItem('github_pat')
    const urlToken = new URLSearchParams(window.location.search).get('token')
    
    if (urlToken) {
      fetchUser(urlToken).then(success => {
        if (!success) {
          console.warn('Failed to auto-login from URL token')
        }
        setLoading(false)
      })
    } else if (storedPat) {
      fetchUser(storedPat).then(success => {
        if (!success) {
          localStorage.removeItem('github_pat')
        } else {
          // Re-identify on page reload (fetchUser already calls identifyUser)
        }
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (pat) => {
    setLoading(true)
    const success = await fetchUser(pat)
    setLoading(false)
    return success
  }

  // Validate a PAT without saving it
  const validateToken = async (pat) => {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })
      return response.ok
    } catch {
      return false
    }
  }

  const logout = () => {
    trackEvent('User Logged Out')
    localStorage.removeItem('github_pat')
    setUser(null)
    setToken(null)
    resetAnalytics()
    // Stop Electron polling on logout
    stopElectronPolling()
  }

  const getToken = () => {
    return token || localStorage.getItem('github_pat')
  }

  const value = {
    user,
    loading,
    login,
    logout,
    getToken,
    validateToken,
    isAuthenticated: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
