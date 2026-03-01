# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Fresnel (branded ReviewGPT) is an AI-powered GitHub code review workspace with three deployment targets sharing one codebase: a React/Vite frontend (port 5173), an Express/TypeScript backend (port 3001), and an Electron desktop wrapper. See `README.md` for the full stack description and script reference.

### Running services

- **MongoDB**: Required for backend persistence (OAuth sessions, user quotas). Run via Docker: `sudo docker run -d --name fresnel-mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=fresnel -e MONGO_INITDB_ROOT_PASSWORD=fresnel_dev_password -e MONGO_INITDB_DATABASE=fresnel mongo:7`. The backend will start without MongoDB but logs a warning and some features (OAuth sessions, AI quotas) won't persist.
- **Backend**: `npm run dev` in `backend/` (uses `tsx watch`). Starts on port 3001. Connects to MongoDB non-blockingly.
- **Frontend**: `npm run dev` in root (uses Vite). Starts on port 5173.
- **Docker**: Must be installed and configured with `fuse-overlayfs` storage driver and `iptables-legacy` for the nested container environment. See the setup steps used during initial environment provisioning.

### Environment files

- Root `.env`: set `VITE_API_URL=http://localhost:3001`
- `backend/.env`: set `NODE_ENV=development`, `PORT=3001`, `MONGODB_URI=mongodb://fresnel:fresnel_dev_password@localhost:27017/fresnel?authSource=admin`, `FRONTEND_URL=http://localhost:5173`, `BACKEND_URL=http://localhost:3001`. GitHub OAuth and Anthropic API keys are optional for basic dev but required for auth and AI features.

### Build and test commands

- **Frontend build**: `npm run build` (root)
- **Backend build**: `npm run build` (in `backend/`, runs `tsc`)
- **Backend TypeScript check**: `npx tsc --noEmit` (in `backend/`)
- **Backend lint**: `npm run lint` (in `backend/`) — note: ESLint is referenced in `package.json` but not installed as a dependency; the command will fail with "eslint: not found"
- **Frontend lint**: ESLint config exists at `eslint.config.js` but required plugins (`@eslint/js`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) are not in `package.json` devDependencies

### Gotchas

- The frontend distinguishes between hostnames: `app.reviewgpt.ca` skips the landing page, while `localhost` shows the landing page at `/` and the app at `/app`.
- Sentry is disabled in development (`enabled: isProduction` in `backend/src/instrument.ts`).
- The backend starts the HTTP server before connecting to MongoDB — a MongoDB connection failure does not prevent the server from running.
- No automated test suite exists in the repo (no test runner or test files).
