import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'

dotenv.config()

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://5920d77c84eb2c867e7459e869b902af@o4510896900276224.ingest.us.sentry.io/4510897009393664',
  
  // Performance Monitoring
  tracesSampleRate: 1.0, // Adjust this value in production
  
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  
  environment: process.env.NODE_ENV || 'development',
})

export { Sentry }
