import { useState, useEffect, createContext, useContext } from 'react'
import { identifyUser, resetAnalytics, trackEvent } from './useAnalytics'

const AuthContext = createContext(null)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const TOKEN_KEY = 'github_token'
const AUTH_METHOD_KEY = 'github_auth_method'
const LEGACY_PAT_KEY = 'github_pat'

const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron
}

const startElectronPolling = (token) => {
  if (isElectron() && token) {
    window.electronAPI.startReviewPolling(token)
  }
}

const stopElectronPolling = () => {
  if (isElectron()) {
    window.electronAPI.stopReviewPolling()
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState(null)
  const [authMethod, setAuthMethod] = useState(null)

  const saveAuth = (newToken, method) => {
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(AUTH_METHOD_KEY, method)
    localStorage.setItem(LEGACY_PAT_KEY, newToken)
    setToken(newToken)
    setAuthMethod(method)
  }

  const clearAuth = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(AUTH_METHOD_KEY)
    localStorage.removeItem(LEGACY_PAT_KEY)
    setToken(null)
    setAuthMethod(null)
    setUser(null)
  }

  const fetchUser = async (accessToken) => {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        identifyUser(userData)
        trackEvent('User Logged In', {
          github_login: userData.login,
          app_type: isElectron() ? 'electron' : 'web',
        })
        startElectronPolling(accessToken)
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
    const legacyPat = localStorage.getItem(LEGACY_PAT_KEY)
    const storedToken = localStorage.getItem(TOKEN_KEY) || legacyPat

    if (storedToken) {
      const method = localStorage.getItem(AUTH_METHOD_KEY) || 'pat'
      fetchUser(storedToken).then(success => {
        if (success) {
          saveAuth(storedToken, method)
        } else {
          clearAuth()
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
    if (success) {
      saveAuth(pat, 'pat')
    }
    setLoading(false)
    return success
  }

  const loginWithOAuth = async (accessToken) => {
    setLoading(true)
    const success = await fetchUser(accessToken)
    if (success) {
      saveAuth(accessToken, 'oauth')
    }
    setLoading(false)
    return success
  }

  const exchangeOAuthCode = async (code) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/github/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await response.json()
      if (!response.ok || !data.access_token) {
        return { success: false, error: data.error || 'Token exchange failed' }
      }
      const success = await loginWithOAuth(data.access_token)
      return { success, error: success ? null : 'Failed to authenticate with GitHub' }
    } catch (error) {
      console.error('OAuth code exchange failed:', error)
      return { success: false, error: 'Network error during authentication' }
    }
  }

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
    clearAuth()
    resetAnalytics()
    stopElectronPolling()
  }

  const getToken = () => {
    return token || localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_PAT_KEY)
  }

  const value = {
    user,
    loading,
    authMethod,
    login,
    loginWithOAuth,
    exchangeOAuthCode,
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
