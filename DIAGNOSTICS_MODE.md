# Diagnostics Mode

Diagnostics Mode is an app-level observability surface for Fresnel. It captures
client-side runtime events, measures operation duration, and exposes a rolling
backend request sample from the API process.

## Goals

- Make local triage faster without opening devtools every time.
- Capture breadcrumbs around issue/PR/inbox navigation transitions.
- Surface API retry and rate-limit behavior with timing.
- Provide lightweight export for incident reports and bug writeups.

## What Was Added

### Frontend

- New store: `src/stores/diagnosticsStore.js`
  - Global event buffer with caps.
  - Span helpers (`startSpan`, `endSpan`) for timing.
  - Snapshot helpers for counts and perf summary.
- New hook: `src/hooks/useDiagnostics.js`
  - Filtering and projection logic for panel UI.
  - Selection model for event details.
- New hook: `src/hooks/useBackendDiagnostics.js`
  - Polls `/api/diagnostics` every 15s when enabled.
  - Adds clear endpoint action.
- New UI: `src/components/DiagnosticsPanel.jsx`
  - Events tab for raw event stream.
  - Overview tab for metrics + backend sample.
  - Perf tab for highest-latency entries.
  - JSON export button.
- New styles: `src/components/DiagnosticsPanel.css`

### Backend

- Added in-memory diagnostics ring buffer in `backend/src/index.ts`.
- Request timing middleware records:
  - method
  - path
  - status
  - duration
  - request id
  - safe query params (token/secret/auth keys redacted)
- New endpoints:
  - `GET /api/diagnostics`
  - `DELETE /api/diagnostics`

## Keyboard and UI controls

- Header button: `Diagnostics`
- Shortcut: `Cmd/Ctrl + Shift + D`

## Event Categories

- `app`
- `analytics`
- `navigation`
- `network`
- `ui`
- `review`
- `issue`
- `operations`
- `backend`

## Data Retention

- Frontend event buffer is capped (`MAX_EVENTS`, default `1200`).
- Backend request sample is capped by `DIAGNOSTICS_BUFFER_SIZE` (`500` default).
- Buffers are intentionally ephemeral and process-local.

## Security Notes

- Query sanitization redacts common sensitive key names.
- Export payload only includes captured diagnostics events.
- Diagnostics do not include auth tokens by design.

## Suggested Follow-ups

1. Add server-side persistence switch for diagnostics during staging incidents.
2. Add label/tag dimensions for repo + issue + pr identifiers in all key events.
3. Gate export with explicit user confirmation for shared screenshots.
4. Add sampling controls to reduce noise for long sessions.
5. Add chart rendering for p50/p95 duration buckets.

## Manual Validation Checklist

- Open app and toggle diagnostics panel from header.
- Toggle with keyboard shortcut.
- Navigate inbox -> issue -> PR and back.
- Trigger comment submission and operation execution.
- Verify events appear in panel and export JSON works.
- Validate backend diagnostics endpoint returns rolling entries.
- Clear backend diagnostics and recheck counts.
