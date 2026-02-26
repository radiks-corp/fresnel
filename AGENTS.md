# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Fresnel (branded **ReviewGPT**) is an AI-powered GitHub code review workspace. It has three main components:

| Component | Location | Port | Dev command |
|-----------|----------|------|-------------|
| Frontend (React/Vite) | `/workspace` | 5173 | `npm run dev` |
| Backend (Express/TS) | `/workspace/backend` | 3001 | `npm run dev` |
| MongoDB | system service | 27017 | `mongod --dbpath /data/db --fork --logpath /var/log/mongod.log` |

### Starting services

1. **MongoDB** must be started first: `mongod --dbpath /data/db --fork --logpath /var/log/mongod.log`
2. **Backend**: `cd /workspace/backend && ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npm run dev &` (uses `tsx watch` for hot reload)
3. **Frontend**: `cd /workspace && npm run dev -- --host 0.0.0.0 &` (Vite dev server)

### Environment files

- `/workspace/.env` — needs `VITE_API_URL=http://localhost:3001`
- `/workspace/backend/.env` — needs `MONGODB_URI`, `PORT`, `FRONTEND_URL`, `BACKEND_URL`, and optionally `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`

The backend starts and serves API routes even without valid GitHub OAuth credentials or `ANTHROPIC_API_KEY`. OAuth and AI features will fail gracefully.

### Gotchas

- The backend `npm run lint` script references `eslint src --ext .ts` but no ESLint config file (`.eslintrc*`) exists in `backend/`. It will fail with a parse error. The root project has `eslint.config.js` (flat config) that works with `npx eslint .`.
- MongoDB runs without authentication in dev. The default `MONGODB_URI` should be `mongodb://localhost:27017/fresnel`.
- The frontend ESLint config requires `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh` as dev dependencies. Install with `--legacy-peer-deps` if you hit peer dependency conflicts.
- The `.env` files are gitignored. Create them from `.env.example` if missing.

### Build

- Frontend: `npm run build` (root) — produces `dist/`
- Backend: `cd backend && npm run build` — runs `tsc`, produces `backend/dist/`

### Testing

No automated test suite exists in this repository. Verify correctness by:
- Backend health: `curl http://localhost:3001/health` (should return `{"status":"ok", ... "mongodb":"connected"}`)
- Backend API: `curl http://localhost:3001/api` (returns `{"message":"Fresnel API"}`)
- Frontend: open `http://localhost:5173` in browser
