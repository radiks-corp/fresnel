import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { AuthProvider } from './hooks/useAuth.jsx'

const Landing = lazy(() => import('./pages/Landing'))
const AppPage = lazy(() => import('./pages/AppPage'))
const InboxPage = lazy(() => import('./pages/InboxPage'))
const AppLayout = lazy(() => import('./layouts/AppLayout'))

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

// app.reviewgpt.ca or Electron — skip the landing page, go straight to the app
const isAppSubdomain = typeof window !== 'undefined' && window.location.hostname === 'app.reviewgpt.ca'
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron

function App() {
  if (isAppSubdomain || isElectron) {
    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <AuthProvider>
          <BrowserRouter>
            <Suspense>
              <Routes>
                <Route path="/" element={<Navigate to="/app" replace />} />
                <Route element={<AppLayout />}>
                  <Route path="/app" element={<InboxPage />} />
                  <Route path="/app/:repoId" element={<AppPage />} />
                  <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
                </Route>
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
          <Suspense>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route element={<AppLayout />}>
                <Route path="/app" element={<InboxPage />} />
                <Route path="/app/:repoId" element={<AppPage />} />
                <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}

export default App
