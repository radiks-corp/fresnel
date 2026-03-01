import { useState, useEffect, createContext, useContext } from 'react'
import { identifyUser, resetAnalytics, trackEvent } from './useAnalytics'

const AuthContext = createContext(null)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Unified token key — both OAuth and PAT tokens are stored here
const TOKEN_KEY = 'github_token'
const AUTH_METHOD_KEY = 'github_auth_method'

// Legacy key for migration
const LEGACY_PAT_KEY = 'github_pat'

const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron
}

const getNotificationPermission = async (prompt = false) => {
  if (!isElectron() || typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported'
  }

  const current = window.Notification.permission
  if (!prompt || current !== 'default') return current

  try {
    return await window.Notification.requestPermission()
  } catch {
    return window.Notification.permission || 'default'
  }
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
  const [authMethod, setAuthMethod] = useState(null) // 'oauth' | 'pat'

  const saveAuth = (newToken, method) => {
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(AUTH_METHOD_KEY, method)
    // Keep legacy key in sync so existing useGitHubAPI.js getToken() works
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

  const fetchUser = async (accessToken, options = {}) => {
    const { promptForNotifications = false } = options
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
        const notificationPermission = await getNotificationPermission(promptForNotifications)
        if (notificationPermission === 'denied') {
          trackEvent('Desktop Notifications Disabled', { app_type: 'electron' })
        }
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
    // Migrate legacy PAT key if needed
    const legacyPat = localStorage.getItem(LEGACY_PAT_KEY)
    const storedToken = localStorage.getItem(TOKEN_KEY) || legacyPat

    if (storedToken) {
      const method = localStorage.getItem(AUTH_METHOD_KEY) || 'pat'
      fetchUser(storedToken, { promptForNotifications: false }).then(success => {
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

  // Login with PAT
  const login = async (pat) => {
    setLoading(true)
    const success = await fetchUser(pat, { promptForNotifications: true })
    if (success) {
      saveAuth(pat, 'pat')
    }
    setLoading(false)
    return success
  }

  // Login with OAuth token (already exchanged)
  const loginWithOAuth = async (accessToken) => {
    setLoading(true)
    const success = await fetchUser(accessToken, { promptForNotifications: true })
    if (success) {
      saveAuth(accessToken, 'oauth')
    }
    setLoading(false)
    return success
  }

  // Exchange OAuth code for token, then login
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
