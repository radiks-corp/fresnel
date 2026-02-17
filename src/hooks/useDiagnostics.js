import { useMemo } from 'react'
import {
  useDiagnosticsStore,
  recordDiagnosticEvent,
  startDiagnosticSpan,
  endDiagnosticSpan,
  getDiagnosticsSnapshot,
} from '../stores/diagnosticsStore'

function normalizeText(value) {
  return String(value || '').toLowerCase().trim()
}

function eventMatchesText(event, text) {
  if (!text) return true
  const body = [
    event.category,
    event.level,
    event.action,
    event.message,
    JSON.stringify(event.tags || {}),
    JSON.stringify(event.context || {}),
    event.route,
  ].join(' ').toLowerCase()
  return body.includes(text)
}

export function useDiagnostics() {
  const enabled = useDiagnosticsStore((s) => s.enabled)
  const isPanelOpen = useDiagnosticsStore((s) => s.isPanelOpen)
  const events = useDiagnosticsStore((s) => s.events)
  const filterText = useDiagnosticsStore((s) => s.filterText)
  const filterLevel = useDiagnosticsStore((s) => s.filterLevel)
  const filterCategory = useDiagnosticsStore((s) => s.filterCategory)
  const selectedEventId = useDiagnosticsStore((s) => s.selectedEventId)

  const setEnabled = useDiagnosticsStore((s) => s.setEnabled)
  const togglePanel = useDiagnosticsStore((s) => s.togglePanel)
  const setPanelOpen = useDiagnosticsStore((s) => s.setPanelOpen)
  const setFilterText = useDiagnosticsStore((s) => s.setFilterText)
  const setFilterLevel = useDiagnosticsStore((s) => s.setFilterLevel)
  const setFilterCategory = useDiagnosticsStore((s) => s.setFilterCategory)
  const setSelectedEventId = useDiagnosticsStore((s) => s.setSelectedEventId)
  const clearEvents = useDiagnosticsStore((s) => s.clearEvents)

  const normalizedText = normalizeText(filterText)

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filterLevel !== 'all' && event.level !== filterLevel) return false
      if (filterCategory !== 'all' && event.category !== filterCategory) return false
      return eventMatchesText(event, normalizedText)
    })
  }, [events, filterLevel, filterCategory, normalizedText])

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return filteredEvents[filteredEvents.length - 1] || null
    return filteredEvents.find((evt) => evt.id === selectedEventId) || null
  }, [filteredEvents, selectedEventId])

  const categories = useMemo(() => {
    const set = new Set(events.map((evt) => evt.category))
    return [...set].sort()
  }, [events])

  const snapshot = useMemo(() => getDiagnosticsSnapshot(), [events])

  const topSlowEvents = useMemo(() => {
    return events
      .filter((evt) => typeof evt.durationMs === 'number')
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, 12)
  }, [events])

  return {
    enabled,
    isPanelOpen,
    events,
    filteredEvents,
    selectedEvent,
    categories,
    snapshot,
    topSlowEvents,
    filterText,
    filterLevel,
    filterCategory,
    setEnabled,
    togglePanel,
    setPanelOpen,
    setFilterText,
    setFilterLevel,
    setFilterCategory,
    setSelectedEventId,
    clearEvents,
  }
}

export function useDiagnosticTrackers() {
  return {
    record: recordDiagnosticEvent,
    startSpan: startDiagnosticSpan,
    endSpan: endDiagnosticSpan,
  }
}
