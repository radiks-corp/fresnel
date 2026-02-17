import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { initAnalytics } from './hooks/useAnalytics'
import { initSentry } from './sentry'

// Initialize Sentry before rendering
initSentry()

// Initialize Mixpanel before rendering
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
