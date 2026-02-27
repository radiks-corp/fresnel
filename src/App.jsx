import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { AuthProvider } from './hooks/useAuth.jsx'

const Landing = lazy(() => import('./pages/Landing'))
const AppPage = lazy(() => import('./pages/AppPage'))
const InboxPage = lazy(() => import('./pages/InboxPage'))
const IssuePage = lazy(() => import('./pages/IssuePage'))
const AppLayout = lazy(() => import('./layouts/AppLayout'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : null,
})

const APP_HOSTNAME = 'app.reviewgpt.ca'
const ROOT_HOSTNAMES = new Set(['reviewgpt.ca', 'www.reviewgpt.ca'])

// app.reviewgpt.ca or Electron — skip the landing page, go straight to the app
const isAppSubdomain = typeof window !== 'undefined' && window.location.hostname === APP_HOSTNAME
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron
const isRootDomain = typeof window !== 'undefined' && ROOT_HOSTNAMES.has(window.location.hostname)
const isAppPath =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/'))
const shouldRedirectToAppSubdomain = isRootDomain && isAppPath && !isElectron

if (shouldRedirectToAppSubdomain) {
  const { pathname, search, hash } = window.location
  window.location.replace(`https://${APP_HOSTNAME}${pathname}${search}${hash}`)
}

function App() {
  const fallback = <div style={{ padding: 24, fontFamily: 'Barlow, sans-serif' }}>Loading…</div>
  if (shouldRedirectToAppSubdomain) return fallback

  if (isAppSubdomain || isElectron) {
    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={fallback}>
              <Routes>
                <Route path="/" element={<Navigate to="/app" replace />} />
                <Route path="/auth/callback" element={<OAuthCallback />} />
                <Route path="/app" element={<InboxPage />} />
                <Route path="/app/:repoId/chat" element={<ChatPage />} />
                <Route element={<AppLayout />}>
                  <Route path="/app/:repoId/issues/:issueNumber" element={<IssuePage />} />
                  <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
                  <Route path="/app/:repoId" element={<AppPage />} />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </PersistQueryClientProvider>
    )
  }

  // reviewgpt.ca — landing page + app routes
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={fallback}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth/callback" element={<OAuthCallback />} />
              <Route path="/app" element={<InboxPage />} />
              <Route path="/app/:repoId/chat" element={<ChatPage />} />
              <Route element={<AppLayout />}>
                <Route path="/app/:repoId/issues/:issueNumber" element={<IssuePage />} />
                <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
                <Route path="/app/:repoId" element={<AppPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}

export default App
