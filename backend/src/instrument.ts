import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'

dotenv.config()

Sentry.init({
  dsn: process.env.SENTRY_DSN || 'https://b515c61f3738d6ca86c1eaf89e50990e@o4510896900276224.ingest.us.sentry.io/4510896909385728',
  
  // Performance Monitoring
  tracesSampleRate: 1.0, // Adjust this value in production
  
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  
  environment: process.env.NODE_ENV || 'development',
})

export { Sentry }
