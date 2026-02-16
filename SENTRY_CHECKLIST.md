# Sentry Setup Checklist

Use this checklist to complete your Sentry integration.

## ✅ Installation (Completed)

- [x] Install @sentry/react for frontend
- [x] Install @sentry/node for backend
- [x] Install @sentry/electron for Electron app
- [x] Install @sentry/vite-plugin for sourcemap upload
- [x] Install @sentry/cli for backend sourcemap upload
- [x] Create Sentry initialization files
- [x] Configure build tools for sourcemap generation
- [x] Update GitHub Actions workflows
- [x] Create documentation

## 🔑 GitHub Secrets Setup (Required)

**Go to:** `Settings → Secrets and variables → Actions`

- [ ] Create `SENTRY_AUTH_TOKEN`
  1. Visit: https://sentry.io/orgredirect/organizations/fresnel-un/settings/auth-tokens/
  2. Click "Create New Token"
  3. Name: `GitHub Actions CI/CD`
  4. Scopes: `project:read`, `project:releases`, `org:read`
  5. Copy token and add to GitHub secrets

- [ ] Create `SENTRY_ORG` with value: `fresnel-un`

- [ ] Create `SENTRY_PROJECT_FRONTEND` with value: `react`

- [ ] Create `SENTRY_PROJECT_BACKEND` with value: `node-express`

## 🧪 Testing (Required)

### Frontend Test

- [ ] Add test button to a component:
```javascript
import { Sentry } from './sentry';

const handleTest = () => {
  Sentry.captureException(new Error("Test Frontend Error"));
  alert("Check Sentry dashboard!");
};

<button onClick={handleTest}>Test Sentry</button>
```

- [ ] Click the test button
- [ ] Check [Frontend Project](https://sentry.io/organizations/fresnel-un/projects/react/) for the error

### Backend Test

- [ ] Add test route to `backend/src/index.ts`:
```typescript
app.get('/api/test-sentry', (req, res) => {
  throw new Error('Test Backend Error');
});
```

- [ ] Make request: `curl http://localhost:3001/api/test-sentry`
- [ ] Check [Backend Project](https://sentry.io/organizations/fresnel-un/projects/node-express/) for the error

### Electron Test

- [ ] Add test IPC handler to `electron/main.cjs`:
```javascript
ipcMain.on('test-sentry', () => {
  Sentry.captureException(new Error("Test Electron Error"));
});
```

- [ ] Trigger from renderer process
- [ ] Check [Electron Project](https://sentry.io/organizations/fresnel-un/projects/electron/) for the error

## 📦 Production Deployment (Required)

- [ ] Deploy backend to production
  - [ ] Verify deploy succeeds
  - [ ] Check GitHub Actions logs for Sentry upload
  - [ ] Trigger a test error in production
  - [ ] Verify error appears in Sentry with source code

- [ ] Deploy frontend to production
  - [ ] Verify build succeeds with Sentry plugin
  - [ ] Check GitHub Actions logs for sourcemap upload
  - [ ] Trigger a test error in production
  - [ ] Verify error appears with readable stack traces

## 👤 User Context Integration (Recommended)

- [ ] Add user context on login:
```javascript
// Frontend - after successful login
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.login,
});
```

- [ ] Clear user context on logout:
```javascript
// Frontend - on logout
Sentry.setUser(null);
```

## 📊 Sentry Dashboard Configuration (Recommended)

### Alerts

- [ ] Set up alert for new issues
  1. Go to: https://sentry.io/organizations/fresnel-un/alerts/rules/
  2. Click "Create Alert"
  3. Configure for critical errors
  4. Add notification channel (email, Slack, etc.)

- [ ] Set up alert for error spike
  1. Create new alert
  2. Select "Issues" category
  3. Condition: "The issue is seen more than X times in Y minutes"
  4. Add notification

### Integrations

- [ ] Connect Slack
  1. Go to: https://sentry.io/organizations/fresnel-un/integrations/
  2. Search for "Slack"
  3. Install and configure channel

- [ ] Connect GitHub (optional)
  1. Go to integrations
  2. Install GitHub app
  3. Enable issue creation from Sentry

### Teams

- [ ] Invite team members
  1. Go to: https://sentry.io/settings/fresnel-un/members/
  2. Invite via email
  3. Assign to projects

## 🎯 Performance Optimization (Optional - For Later)

### Adjust Sample Rates

Once you have enough data, reduce sample rates:

- [ ] Frontend (`src/sentry.js`):
```javascript
tracesSampleRate: 0.1,  // 10% of transactions
replaysSessionSampleRate: 0.01,  // 1% of sessions
replaysOnErrorSampleRate: 1.0,  // 100% of error sessions
```

- [ ] Backend (`backend/src/instrument.ts`):
```javascript
tracesSampleRate: 0.1,  // 10% of transactions
```

### Add Custom Instrumentation

- [ ] Instrument critical user flows
- [ ] Add custom spans for key operations
- [ ] Add breadcrumbs for important events

Example:
```javascript
// Instrument checkout flow
Sentry.startSpan(
  { op: "checkout", name: "Process Checkout" },
  async (span) => {
    span.setAttribute("items", cartItems.length);
    await processPayment();
  }
);
```

## 📈 Monitoring Setup (Optional - For Later)

- [ ] Create custom dashboard for key metrics
- [ ] Set up weekly/monthly reports
- [ ] Configure release tracking with commits
- [ ] Set up deploy notifications
- [ ] Create issue grouping rules

## 🔍 Advanced Configuration (Optional)

### Environment-Based Config

- [ ] Add environment detection:
```javascript
Sentry.init({
  dsn: "...",
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,
});
```

### Filtering Sensitive Data

- [ ] Configure `beforeSend` hook to filter PII:
```javascript
Sentry.init({
  beforeSend(event) {
    // Modify event to remove sensitive data
    return event;
  },
});
```

### Custom Error Grouping

- [ ] Set up `fingerprint` for better error grouping:
```javascript
Sentry.captureException(error, {
  fingerprint: ['database-connection-error']
});
```

## 📚 Team Training (Recommended)

- [ ] Share `SENTRY_QUICK_REFERENCE.md` with team
- [ ] Review `.cursorrules` for coding standards
- [ ] Demonstrate error capture in team meeting
- [ ] Show how to use Sentry dashboard
- [ ] Explain when to use spans vs. logs vs. errors

## 🎓 Documentation Review

Make sure everyone on the team has access to:

- [ ] `SENTRY_SETUP.md` - Complete setup guide
- [ ] `SENTRY_QUICK_REFERENCE.md` - Code examples
- [ ] `SENTRY_INSTALLATION_SUMMARY.md` - What was installed
- [ ] `.cursorrules` - Coding standards
- [ ] This checklist!

## 📞 Support Resources

- **Sentry Docs:** https://docs.sentry.io/
- **React SDK:** https://docs.sentry.io/platforms/javascript/guides/react/
- **Node SDK:** https://docs.sentry.io/platforms/node/
- **Electron SDK:** https://docs.sentry.io/platforms/javascript/guides/electron/
- **Community:** https://forum.sentry.io/
- **Status:** https://status.sentry.io/

## ✨ Success Criteria

You'll know Sentry is working correctly when:

- ✅ Errors appear in Sentry dashboard within seconds
- ✅ Stack traces show actual source code (not minified)
- ✅ User context appears with errors
- ✅ Performance spans show up in Sentry
- ✅ Logs are captured and searchable
- ✅ Sourcemaps upload successfully in CI/CD
- ✅ Team receives alerts for new issues

---

**Priority:** 
1. 🔑 GitHub Secrets Setup (Required for CI/CD)
2. 🧪 Testing (Required to verify it works)
3. 📦 Production Deployment (Required to see real value)
4. 👤 User Context (High value, quick to implement)
5. 📊 Alerts (High value, prevents missed issues)

**Estimated time to complete essentials:** 30-45 minutes
