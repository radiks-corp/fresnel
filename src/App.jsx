import { lazy, Suspense } from 'react'
import { HashRouter, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.jsx'

const Landing = lazy(() => import('./pages/Landing'))
const AppPage = lazy(() => import('./pages/AppPage'))

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

// app.reviewgpt.ca hosts the app only (no landing page)
const isAppSubdomain = typeof window !== 'undefined' && window.location.hostname === 'app.reviewgpt.ca'

function App() {
  // Electron uses HashRouter (file:// protocol), goes directly to app (modal handles auth)
  if (isElectron) {
    return (
      <AuthProvider>
        <HashRouter>
          <Suspense>
            <Routes>
              <Route path="/" element={<Navigate to="/app" replace />} />
              <Route path="/app" element={<AppPage />} />
              <Route path="/app/:repoId" element={<AppPage />} />
              <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    )
  }

  // app.reviewgpt.ca skips the landing page, goes straight to the app
  if (isAppSubdomain) {
    return (
      <AuthProvider>
        <BrowserRouter>
          <Suspense>
            <Routes>
              <Route path="/" element={<Navigate to="/app" replace />} />
              <Route path="/app" element={<AppPage />} />
              <Route path="/app/:repoId" element={<AppPage />} />
              <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    )
  }

  // reviewgpt.ca — landing page + app routes
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<AppPage />} />
            <Route path="/app/:repoId" element={<AppPage />} />
            <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
