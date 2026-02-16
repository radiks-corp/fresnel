import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'

dotenv.config()

const isProduction = process.env.NODE_ENV === 'production'

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://5920d77c84eb2c867e7459e869b902af@o4510896900276224.ingest.us.sentry.io/4510897009393664',
  
  enabled: isProduction,
  
  // Performance Monitoring
  tracesSampleRate: 1.0,
  
  sendDefaultPii: true,
  
  environment: process.env.NODE_ENV || 'development',
})

export { Sentry }
