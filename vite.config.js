import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    // Put the Sentry vite plugin after all other plugins
    sentryVitePlugin({
      org: 'fresnel-un',
      project: 'react',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Sourcemaps are only uploaded in production builds
      disable: process.env.NODE_ENV !== 'production',
    }),
  ],
  base: '/',
  build: {
    sourcemap: true, // Enable sourcemaps for production builds
  },
})
