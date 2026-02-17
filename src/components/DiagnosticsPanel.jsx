import { useMemo, useState } from 'react'
import { Bug, ClockCounterClockwise, X, Waveform, Funnel, Broom, FloppyDisk } from '@phosphor-icons/react'
import { useDiagnostics } from '../hooks/useDiagnostics'
import { useBackendDiagnostics, useClearBackendDiagnostics } from '../hooks/useBackendDiagnostics'
import './DiagnosticsPanel.css'

function formatDuration(ms) {
  if (typeof ms !== 'number') return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function MetricCard({ label, value, tone = 'neutral' }) {
  return (
    <div className={`diag-metric diag-metric-${tone}`}>
      <div className="diag-metric-label">{label}</div>
      <div className="diag-metric-value">{value}</div>
    </div>
  )
}

function EventRow({ event, selected, onSelect }) {
  return (
    <button type="button" className={`diag-event-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(event.id)}>
      <span className={`diag-level ${event.level}`}>{event.level}</span>
      <span className="diag-event-time">{formatTime(event.ts)}</span>
      <span className="diag-event-action">{event.action}</span>
      <span className="diag-event-route">{event.route || '-'}</span>
      <span className="diag-event-duration">{formatDuration(event.durationMs)}</span>
    </button>
  )
}

export default function DiagnosticsPanel() {
  const {
    enabled,
    setEnabled,
    isPanelOpen,
    setPanelOpen,
    filteredEvents,
    selectedEvent,
    categories,
    snapshot,
    topSlowEvents,
    filterText,
    filterLevel,
    filterCategory,
    setFilterText,
    setFilterLevel,
    setFilterCategory,
    setSelectedEventId,
    clearEvents,
  } = useDiagnostics()

  const [activeTab, setActiveTab] = useState('events')
  const { data: backendDiagnostics } = useBackendDiagnostics(enabled)
  const clearBackendDiagnostics = useClearBackendDiagnostics()

  const exportPayload = useMemo(
    () => ({
      snapshot,
      filters: { filterText, filterLevel, filterCategory },
      selectedEvent,
      events: filteredEvents,
    }),
    [snapshot, filterText, filterLevel, filterCategory, selectedEvent, filteredEvents]
  )

  const downloadExport = () => {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fresnel-diagnostics-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isPanelOpen) return null

  return (
    <aside className="diag-panel">
      <header className="diag-header">
        <div className="diag-header-title">
          <Bug size={15} />
          <span>Diagnostics Mode</span>
        </div>
        <div className="diag-header-actions">
          <label className="diag-toggle">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>{enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          <button type="button" className="diag-icon-btn" onClick={downloadExport} title="Export">
            <FloppyDisk size={15} />
          </button>
          <button type="button" className="diag-icon-btn" onClick={() => setPanelOpen(false)} title="Close">
            <X size={15} />
          </button>
        </div>
      </header>

      <nav className="diag-tabs">
        <button type="button" className={activeTab === 'events' ? 'active' : ''} onClick={() => setActiveTab('events')}>Events</button>
        <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button type="button" className={activeTab === 'perf' ? 'active' : ''} onClick={() => setActiveTab('perf')}>Perf</button>
      </nav>

      {activeTab === 'overview' && (
        <div className="diag-overview">
          <div className="diag-metrics-grid">
            <MetricCard label="Events" value={snapshot.eventCount} />
            <MetricCard label="Errors" value={snapshot.byLevel.error || 0} tone="error" />
            <MetricCard label="Warnings" value={snapshot.byLevel.warn || 0} tone="warn" />
            <MetricCard label="Avg Duration" value={formatDuration(snapshot.avgMs)} />
          </div>

          <section className="diag-overview-section">
            <h4>Categories</h4>
            <div className="diag-pill-list">
              {Object.entries(snapshot.byCategory).map(([name, count]) => (
                <span key={name} className="diag-pill">{name}: {count}</span>
              ))}
            </div>
          </section>

          <section className="diag-overview-section">
            <h4>Routes Seen</h4>
            <ul className="diag-route-list">
              {snapshot.routesSeen.map((route) => (
                <li key={route}>{route}</li>
              ))}
            </ul>
          </section>

          <section className="diag-overview-section">
            <h4>Backend Sample</h4>
            <div className="diag-pill-list">
              <span className="diag-pill">events: {backendDiagnostics?.count ?? '-'}</span>
              <span className="diag-pill">errors: {backendDiagnostics?.errorCount ?? '-'}</span>
              <span className="diag-pill">avg: {formatDuration(backendDiagnostics?.avgDurationMs)}</span>
            </div>
            <button
              type="button"
              className="diag-text-btn"
              onClick={clearBackendDiagnostics}
              style={{ marginTop: 8 }}
            >
              Clear backend diagnostics
            </button>
          </section>
        </div>
      )}

      {activeTab === 'events' && (
        <>
          <div className="diag-toolbar">
            <div className="diag-toolbar-filter">
              <Funnel size={14} />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Search message/tags/context..."
              />
            </div>
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
              <option value="all">All levels</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((cat) => <option value={cat} key={cat}>{cat}</option>)}
            </select>
            <button type="button" className="diag-icon-btn" onClick={clearEvents} title="Clear">
              <Broom size={15} />
            </button>
          </div>

          <div className="diag-events">
            {filteredEvents.length === 0 ? (
              <div className="diag-empty">No events match the current filters.</div>
            ) : (
              filteredEvents
                .slice()
                .reverse()
                .map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    selected={selectedEvent?.id === event.id}
                    onSelect={setSelectedEventId}
                  />
                ))
            )}
          </div>

          <div className="diag-detail">
            {selectedEvent ? (
              <>
                <div className="diag-detail-header">
                  <ClockCounterClockwise size={14} />
                  <span>{selectedEvent.action}</span>
                </div>
                <pre>{JSON.stringify(selectedEvent, null, 2)}</pre>
              </>
            ) : (
              <div className="diag-empty">Select an event to inspect details.</div>
            )}
          </div>
        </>
      )}

      {activeTab === 'perf' && (
        <div className="diag-perf">
          <div className="diag-perf-header">
            <Waveform size={15} />
            <span>Slowest captured events</span>
          </div>
          {topSlowEvents.length === 0 ? (
            <div className="diag-empty">No performance events recorded yet.</div>
          ) : (
            topSlowEvents.map((event) => (
              <div key={event.id} className="diag-perf-row">
                <div>
                  <div className="diag-perf-action">{event.action}</div>
                  <div className="diag-perf-meta">{event.category} · {event.route || '-'}</div>
                </div>
                <strong>{formatDuration(event.durationMs)}</strong>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  )
}
