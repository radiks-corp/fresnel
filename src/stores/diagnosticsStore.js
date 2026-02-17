import { create } from 'zustand'

const MAX_EVENTS = 1200
const PERF_BUCKETS = [50, 100, 250, 500, 1000, 2000]

function clampEvents(events) {
  if (events.length <= MAX_EVENTS) return events
  return events.slice(events.length - MAX_EVENTS)
}

function classifyDuration(ms) {
  if (ms == null) return 'unknown'
  if (ms < 50) return '<50ms'
  for (const bucket of PERF_BUCKETS) {
    if (ms <= bucket) return `<=${bucket}ms`
  }
  return '>2000ms'
}

function nowIso() {
  return new Date().toISOString()
}

function makeEvent(partial) {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    isoTime: nowIso(),
    category: partial.category || 'app',
    level: partial.level || 'info',
    action: partial.action || 'event',
    message: partial.message || '',
    tags: partial.tags || {},
    context: partial.context || {},
    durationMs: partial.durationMs,
    route: typeof window !== 'undefined' ? window.location.pathname : '',
  }
}

export const useDiagnosticsStore = create((set, get) => ({
  enabled: typeof window !== 'undefined' ? localStorage.getItem('diagnosticsEnabled') === '1' : false,
  isPanelOpen: false,
  events: [],
  activeSpans: {},
  filterText: '',
  filterLevel: 'all',
  filterCategory: 'all',
  selectedEventId: null,

  setEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('diagnosticsEnabled', enabled ? '1' : '0')
    }
    set({ enabled })
  },

  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
  setFilterText: (filterText) => set({ filterText }),
  setFilterLevel: (filterLevel) => set({ filterLevel }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
  setSelectedEventId: (selectedEventId) => set({ selectedEventId }),

  clearEvents: () => set({ events: [], activeSpans: {}, selectedEventId: null }),

  addEvent: (partial) => {
    const state = get()
    if (!state.enabled) return null
    const event = makeEvent(partial)
    set((s) => ({
      events: clampEvents([...s.events, event]),
      selectedEventId: s.selectedEventId || event.id,
    }))
    return event.id
  },

  startSpan: (action, details = {}) => {
    const state = get()
    if (!state.enabled) return null
    const spanId = crypto.randomUUID()
    const startedAt = performance.now()
    const startedEpoch = Date.now()

    set((s) => ({
      activeSpans: {
        ...s.activeSpans,
        [spanId]: {
          spanId,
          action,
          details,
          startedAt,
          startedEpoch,
        },
      },
    }))

    get().addEvent({
      category: details.category || 'perf',
      level: 'info',
      action: `${action}:start`,
      message: details.message || '',
      tags: details.tags || {},
      context: details.context || {},
    })

    return spanId
  },

  endSpan: (spanId, result = {}) => {
    const span = get().activeSpans[spanId]
    if (!span) return null

    const durationMs = Math.max(0, Math.round(performance.now() - span.startedAt))
    const level = result.level || (durationMs > 2000 ? 'warn' : 'info')

    set((s) => {
      const next = { ...s.activeSpans }
      delete next[spanId]
      return { activeSpans: next }
    })

    return get().addEvent({
      category: result.category || span.details.category || 'perf',
      level,
      action: `${span.action}:end`,
      message: result.message || span.details.message || '',
      tags: {
        ...(span.details.tags || {}),
        ...(result.tags || {}),
        perfBucket: classifyDuration(durationMs),
      },
      context: {
        ...(span.details.context || {}),
        ...(result.context || {}),
      },
      durationMs,
    })
  },
}))

export function recordDiagnosticEvent(event) {
  return useDiagnosticsStore.getState().addEvent(event)
}

export function startDiagnosticSpan(action, details) {
  return useDiagnosticsStore.getState().startSpan(action, details)
}

export function endDiagnosticSpan(spanId, result) {
  return useDiagnosticsStore.getState().endSpan(spanId, result)
}

export function withDiagnosticSpan(action, details, fn) {
  const spanId = startDiagnosticSpan(action, details)
  const startedAt = performance.now()

  return Promise.resolve()
    .then(fn)
    .then((value) => {
      endDiagnosticSpan(spanId, {
        ...details,
        level: details?.level || 'info',
        tags: {
          ...(details?.tags || {}),
          ok: true,
        },
        durationMs: Math.round(performance.now() - startedAt),
      })
      return value
    })
    .catch((error) => {
      endDiagnosticSpan(spanId, {
        ...details,
        level: 'error',
        message: error?.message || 'Unknown diagnostics span error',
        tags: {
          ...(details?.tags || {}),
          ok: false,
          errorName: error?.name || 'Error',
        },
        context: {
          ...(details?.context || {}),
          stack: error?.stack,
        },
      })
      throw error
    })
}

export function getDiagnosticsSnapshot() {
  const state = useDiagnosticsStore.getState()
  const byLevel = { info: 0, warn: 0, error: 0 }
  const byCategory = {}

  for (const evt of state.events) {
    byLevel[evt.level] = (byLevel[evt.level] || 0) + 1
    byCategory[evt.category] = (byCategory[evt.category] || 0) + 1
  }

  const performanceEvents = state.events.filter((evt) => typeof evt.durationMs === 'number')
  const avgMs = performanceEvents.length
    ? Math.round(performanceEvents.reduce((sum, evt) => sum + evt.durationMs, 0) / performanceEvents.length)
    : 0

  return {
    generatedAt: nowIso(),
    eventCount: state.events.length,
    byLevel,
    byCategory,
    avgMs,
    activeSpanCount: Object.keys(state.activeSpans).length,
    routesSeen: [...new Set(state.events.map((evt) => evt.route).filter(Boolean))],
  }
}
