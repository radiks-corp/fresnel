# Fresnel

Fresnel is an AI-assisted GitHub review workspace focused on pull-request and
issue triage. It ships a React/Vite frontend, an Electron wrapper, and an
Express backend that brokers GitHub + model APIs.

## Stack

- Frontend: React 18, Vite, React Query, Zustand
- Desktop wrapper: Electron
- Backend: Express + TypeScript (`backend/`)
- AI SDK: `ai`, Anthropic model provider
- Observability: Sentry + Diagnostics Mode (local runtime panel)

## Quick Start

### Frontend only

```bash
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

### Electron dev

```bash
npm run electron:dev
```

## Environment

Key variables used in local development:

- `VITE_API_URL` (frontend -> backend URL)
- `FRONTEND_URL` (backend CORS origin)
- `MONGODB_URI` (backend persistence)
- `ANTHROPIC_API_KEY` (review/chat)
- Sentry variables (`SENTRY_DSN`, release/env tags)

Use `.env.example` as baseline and adjust for local/dev/prod workflows.

## App Surfaces

- `/app` inbox for open PRs + issues
- `/app/:repoId/:prNumber` pull request review workspace
- `/app/:repoId/issues/:issueNumber` issue detail + timeline + action composer

## Diagnostics Mode

Diagnostics Mode is a runtime panel for debugging and incident triage.

- Toggle button in shared header
- Shortcut: `Cmd/Ctrl + Shift + D`
- Captures client events by category (`network`, `review`, `operations`, etc.)
- Polls backend request sample (`GET /api/diagnostics`)
- Exports filtered event payload to JSON

See [DIAGNOSTICS_MODE.md](./DIAGNOSTICS_MODE.md) for details.

## Scripts

Top-level scripts:

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run electron:dev`
- `npm run electron:build`

Backend scripts (run in `backend/`):

- `npm run dev`
- `npm run build`
- `npm run start`

## Notes for Contributors

- Prefer React Query cache invalidation over ad-hoc local fetch state.
- Keep issue/PR navigation transitions explicit; route changes are a major UX path.
- Avoid logging sensitive token-like payload fields in backend logs.
- Keep instrumentation additive and low-overhead.

## License

No license file is currently defined in this repository.
