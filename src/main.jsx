import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { initAnalytics } from './hooks/useAnalytics'
import { initSentry } from './sentry'
import { recordDiagnosticEvent } from './stores/diagnosticsStore'

// Initialize Sentry before rendering
initSentry()

// Initialize Mixpanel before rendering
initAnalytics()

recordDiagnosticEvent({
  category: 'app',
  level: 'info',
  action: 'app-bootstrap',
  message: 'Fresnel frontend bootstrapped',
  tags: {
    mode: import.meta.env.MODE,
    electron: !!window.electronAPI?.isElectron,
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
