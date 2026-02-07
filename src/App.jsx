import { HashRouter, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.jsx'
import Landing from './pages/Landing'
import AppPage from './pages/AppPage'

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

function App() {
  // Electron uses HashRouter (file:// protocol), goes directly to app (modal handles auth)
  if (isElectron) {
    return (
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/app" element={<AppPage />} />
            <Route path="/app/:repoId" element={<AppPage />} />
            <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    )
  }

  // Web uses BrowserRouter with the landing page
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppPage />} />
          <Route path="/app/:repoId" element={<AppPage />} />
          <Route path="/app/:repoId/:prNumber" element={<AppPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
