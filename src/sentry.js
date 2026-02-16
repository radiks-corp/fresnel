import * as Sentry from '@sentry/react'

const isProduction = import.meta.env.PROD

export function initSentry() {
  Sentry.init({
    dsn: 'https://79022c5722addfd7e6eb180ddd268469@o4510896900276224.ingest.us.sentry.io/4510897006182400',
    
    enabled: isProduction,
    
    // Performance Monitoring
    tracesSampleRate: 1.0,
    
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Enable logging
    enableLogs: true,
    
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    
    environment: import.meta.env.MODE || 'development',
  })
}

export { Sentry }
