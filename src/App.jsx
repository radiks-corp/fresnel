import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.jsx'

const Landing = lazy(() => import('./pages/Landing'))
const AppPage = lazy(() => import('./pages/AppPage'))

// app.reviewgpt.ca or Electron — skip the landing page, go straight to the app
const isAppSubdomain = typeof window !== 'undefined' && window.location.hostname === 'app.reviewgpt.ca'
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron

function App() {
  if (isAppSubdomain || isElectron) {
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
