import { useState, useEffect, createContext, useContext } from 'react'

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
        // Start Electron polling when authenticated
        startElectronPolling(pat)
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to fetch user:', error)
      return false
    }
  }

  useEffect(() => {
    // Check for existing PAT on mount
    const storedPat = localStorage.getItem('github_pat')
    
    if (storedPat) {
      fetchUser(storedPat).then(success => {
        if (!success) {
          localStorage.removeItem('github_pat')
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

  const logout = () => {
    localStorage.removeItem('github_pat')
    setUser(null)
    setToken(null)
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
