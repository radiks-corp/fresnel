import * as Sentry from '@sentry/react'

export function initSentry() {
  Sentry.init({
    dsn: 'https://15afb3114176ac49260d18d0272c909b@o4510896900276224.ingest.us.sentry.io/4510896902045696',
    
    // Performance Monitoring
    tracesSampleRate: 1.0, // Adjust this value in production
    
    // Session Replay
    replaysSessionSampleRate: 0.1, // Sample 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions with errors
    
    // Enable logging
    enableLogs: true,
    
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
      // send console.log, console.warn, and console.error calls as logs to Sentry
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    
    environment: import.meta.env.MODE || 'development',
  })
}

export { Sentry }
