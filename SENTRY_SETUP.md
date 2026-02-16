# Sentry Setup Guide

This document outlines the Sentry integration setup for the Fresnel project.

## Overview

Sentry has been configured for three parts of the application:

1. **Frontend (React)** - Project: `react`
2. **Backend (Node/Express)** - Project: `node-express`
3. **Electron App** - Project: `electron`

## Configuration Files

### Frontend

- **`src/sentry.js`** - Sentry initialization for React app
- **`src/main.jsx`** - Imports and initializes Sentry before React renders
- **`vite.config.js`** - Includes Sentry Vite plugin for sourcemap upload
- **`sentry.properties`** - Sentry org and project configuration

### Backend

- **`backend/src/instrument.ts`** - Sentry initialization for Express server
- **`backend/src/index.ts`** - Imports instrument.ts and sets up error handler
- **`backend/sentry.properties`** - Sentry org and project configuration

### Electron

- **`electron/main.cjs`** - Sentry initialization for Electron main process (uses `@sentry/electron/main`)
- **Renderer process** - Uses the React SDK already configured in `src/sentry.js`

## DSN Keys

- **Frontend**: `https://15afb3114176ac49260d18d0272c909b@o4510896900276224.ingest.us.sentry.io/4510896902045696`
- **Backend**: `https://b515c61f3738d6ca86c1eaf89e50990e@o4510896900276224.ingest.us.sentry.io/4510896909385728`
- **Electron**: `https://1313505948be789d210f934165505f77@o4510896900276224.ingest.us.sentry.io/4510896915939328`

## GitHub Secrets Required

To enable Sentry releases and sourcemap uploads in CI/CD, add these secrets to your GitHub repository:

1. Go to: **Settings → Secrets and variables → Actions**
2. Add the following secrets:

### Required Secrets

- **`SENTRY_AUTH_TOKEN`** - Organization auth token from Sentry
  - Create at: https://sentry.io/orgredirect/organizations/fresnel-un/settings/auth-tokens/
  - Scopes needed: `project:read`, `project:releases`, `org:read`

- **`SENTRY_ORG`** - `fresnel-un`

- **`SENTRY_PROJECT_FRONTEND`** - `react`

- **`SENTRY_PROJECT_BACKEND`** - `node-express`

## GitHub Actions Workflows

### Automatic Sourcemap Upload

Sourcemaps are automatically uploaded during production builds:

- **Frontend**: `app-cd.yml` - Vite plugin uploads during build
- **Backend**: `backend-cd.yml` - CLI uploads after TypeScript compilation

### Dedicated Sentry Release Workflow

A standalone workflow is also available at `.github/workflows/sentry-release.yml` for manual release creation.

## Features Enabled

### Error Tracking

Errors are automatically captured and sent to Sentry using:
- `Sentry.captureException(error)` in try-catch blocks
- Automatic error boundaries in React
- Express error handler middleware

### Performance Monitoring

Performance tracing is enabled with custom spans for:
- UI interactions (button clicks, form submissions)
- API calls (HTTP requests)
- Database operations

### Session Replay (Frontend Only)

- 10% of sessions are recorded
- 100% of sessions with errors are recorded

### Logging

Console logging integration captures:
- `console.log()`
- `console.warn()`
- `console.error()`

Structured logging available via `Sentry.logger`:
```javascript
const { logger } = Sentry;
logger.info("Event occurred", { userId: 123 });
```

## Local Development

Sentry is configured to run in all environments. To disable in development:

1. Set environment-based conditions in initialization:
   ```javascript
   Sentry.init({
     dsn: "...",
     enabled: process.env.NODE_ENV === 'production',
   });
   ```

2. Or use a `.env` file to override the DSN:
   ```bash
   SENTRY_DSN=""  # Empty to disable
   ```

## Testing Sentry Integration

### Frontend Test

```javascript
import { Sentry } from './sentry';

// Test error capture
try {
  throw new Error("Test error");
} catch (error) {
  Sentry.captureException(error);
}

// Test performance tracing
Sentry.startSpan({ op: "test", name: "Test Span" }, () => {
  console.log("Testing Sentry span");
});
```

### Backend Test

```javascript
// GET /api/test-sentry to trigger a test error
app.get('/api/test-sentry', (req, res) => {
  throw new Error('Test Sentry Error');
});
```

### Electron Test

```javascript
// In main process
const Sentry = require("@sentry/electron");
Sentry.captureException(new Error("Test Electron error"));
```

## Useful Links

- [Sentry Dashboard](https://sentry.io/organizations/fresnel-un/)
- [Frontend Project](https://sentry.io/organizations/fresnel-un/projects/react/)
- [Backend Project](https://sentry.io/organizations/fresnel-un/projects/node-express/)
- [Electron Project](https://sentry.io/organizations/fresnel-un/projects/electron/)
- [Sentry Documentation](https://docs.sentry.io/)

## Troubleshooting

### Sourcemaps not working

1. Ensure `SENTRY_AUTH_TOKEN` is set in GitHub secrets
2. Check that builds are running with `NODE_ENV=production`
3. Verify sourcemaps are being generated (`build.sourcemap: true` in Vite)
4. Check GitHub Actions logs for upload errors

### Events not appearing in Sentry

1. Verify the DSN is correct
2. Check network requests in browser DevTools
3. Ensure Sentry is initialized before any errors occur
4. Check that errors are being captured (not silently caught)

### Rate limiting

Adjust sample rates in production:
- `tracesSampleRate: 0.1` (10% of transactions)
- `replaysSessionSampleRate: 0.01` (1% of sessions)

## Next Steps

1. Add GitHub secrets for CI/CD integration
2. Test error reporting in each environment
3. Set up Sentry alerts for critical errors
4. Configure issue assignment and notifications
5. Integrate with Slack/Discord for error notifications
