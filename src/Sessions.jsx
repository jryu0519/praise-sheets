import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import PdfViewer from './PdfViewer'
import { colors, buttonStyle, primaryButtonStyle, inputStyle, iconButtonStyle } from './theme'
import {
  RefreshIcon,
  DocumentIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PlayIcon,
  PencilIcon,
  XIcon,
} from './icons'

function Sessions({ currentUserId, canManage }) {
  const [sessions, setSessions] = useState([])
  const [availableCharts, setAvailableCharts] = useState([])
  const [openSessionId, setOpenSessionId] = useState(null)
  const [title, setTitle] = useState('')
  const [selectedChartIds, setSelectedChartIds] = useState([])
  const [viewing, setViewing] = useState(null) // { charts: [{ id, url }] }
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [addChartIds, setAddChartIds] = useState([])

  const loadSessions = () => {
    supabase
      .from('sessions')
      .select('id, title, session_charts(position, chart_id, charts(id, title, musical_key, storage_path))')
      .then(({ data }) => setSessions(data ?? []))
  }

  const loadAvailableCharts = () => {
    supabase
      .from('charts')
      .select('id, title, musical_key')
      .eq('archived', false)
      .order('created_at', { ascending: true })
      .then(({ data }) => setAvailableCharts(data ?? []))
  }

  useEffect(() => {
    loadSessions()
    loadAvailableCharts()
  }, [])

  const toggleChart = (chartId) => {
    setSelectedChartIds((ids) =>
      ids.includes(chartId) ? ids.filter((id) => id !== chartId) : [...ids, chartId]
    )
  }

  const createSession = async () => {
    if (!title || selectedChartIds.length === 0) return

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({ title, created_by: currentUserId })
      .select()
      .single()

    if (sessionError) {
      alert(`Could not create session: ${sessionError.message}`)
      return
    }

    const rows = selectedChartIds.map((chart_id, index) => ({
      session_id: session.id,
      chart_id,
      position: index,
    }))
    const { error: linkError } = await supabase.from('session_charts').insert(rows)

    if (linkError) {
      alert(`Could not add charts to session: ${linkError.message}`)
      return
    }

    setTitle('')
    setSelectedChartIds([])
    loadSessions()
  }

  const orderedCharts = (session) =>
    [...session.session_charts].sort((a, b) => a.position - b.position)

  const openChart = async (chart) => {
    const { data, error } = await supabase.storage.from('charts').createSignedUrl(chart.storage_path, 300)
    if (error) {
      alert(`Could not open file: ${error.message}`)
      return
    }
    setViewing({ charts: [{ id: chart.id, url: data.signedUrl }] })
  }

  const openCombined = async (session) => {
    try {
      const signed = await Promise.all(
        orderedCharts(session).map(async (sc) => {
          const { data, error } = await supabase.storage
            .from('charts')
            .createSignedUrl(sc.charts.storage_path, 300)
          if (error) throw error
          return { id: sc.charts.id, url: data.signedUrl }
        })
      )
      setViewing({ charts: signed })
    } catch (err) {
      alert(`Could not open session: ${err.message}`)
    }
  }

  const startRename = (session) => {
    setEditingTitle(true)
    setTitleDraft(session.title)
  }

  const saveRename = async (session) => {
    if (!titleDraft) return
    const { error } = await supabase.from('sessions').update({ title: titleDraft }).eq('id', session.id)
    if (error) {
      alert(`Could not rename session: ${error.message}`)
      return
    }
    setEditingTitle(false)
    loadSessions()
  }

  const removeSong = async (session, chartId) => {
    const { error } = await supabase
      .from('session_charts')
      .delete()
      .eq('session_id', session.id)
      .eq('chart_id', chartId)
    if (error) alert(`Could not remove song: ${error.message}`)
    else loadSessions()
  }

  const moveSong = async (session, index, direction) => {
    const ordered = orderedCharts(session)
    const otherIndex = index + direction
    if (otherIndex < 0 || otherIndex >= ordered.length) return
    const a = ordered[index]
    const b = ordered[otherIndex]

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('session_charts').update({ position: b.position }).eq('session_id', session.id).eq('chart_id', a.chart_id),
      supabase.from('session_charts').update({ position: a.position }).eq('session_id', session.id).eq('chart_id', b.chart_id),
    ])
    if (e1 || e2) alert(`Could not reorder: ${(e1 || e2).message}`)
    else loadSessions()
  }

  const toggleAddChart = (chartId) => {
    setAddChartIds((ids) => (ids.includes(chartId) ? ids.filter((id) => id !== chartId) : [...ids, chartId]))
  }

  const addSongsToSession = async (session) => {
    if (addChartIds.length === 0) return
    const startPos = Math.max(-1, ...session.session_charts.map((sc) => sc.position)) + 1
    const rows = addChartIds.map((chart_id, i) => ({ session_id: session.id, chart_id, position: startPos + i }))
    const { error } = await supabase.from('session_charts').insert(rows)
    if (error) {
      alert(`Could not add songs: ${error.message}`)
      return
    }
    setAddChartIds([])
    loadSessions()
  }

  const openSession = sessions.find((s) => s.id === openSessionId)
  const chartsNotInSession = openSession
    ? availableCharts.filter((c) => !openSession.session_charts.some((sc) => sc.chart_id === c.id))
    : []

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      {!openSession && (
        <>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, textAlign: 'center' }}>Sessions</h1>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
            <span style={{ background: colors.card, color: colors.subtext, padding: '0.4rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem' }}>
              {sessions.length} session{sessions.length === 1 ? '' : 's'}
            </span>
            <button onClick={loadSessions} title="Refresh" style={{ ...iconButtonStyle(false), borderRadius: '999px' }}>
              <RefreshIcon />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setOpenSessionId(s.id)}
                style={{
                  background: colors.card,
                  color: colors.text,
                  border: 'none',
                  borderRadius: '14px',
                  padding: '0.9rem 1rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{s.title}</div>
                  <div style={{ color: colors.subtext, fontSize: '0.85rem' }}>
                    {s.session_charts.length} song{s.session_charts.length === 1 ? '' : 's'}
                  </div>
                </div>
                <span style={{ color: colors.subtext, flexShrink: 0 }}>
                  <ChevronRightIcon />
                </span>
              </button>
            ))}
            {sessions.length === 0 && (
              <p style={{ color: colors.subtext, textAlign: 'center' }}>No sessions yet.</p>
            )}
          </div>
        </>
      )}

      {openSession && (
        <div>
          <button
            onClick={() => {
              setOpenSessionId(null)
              setEditingTitle(false)
              setAddChartIds([])
            }}
            style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ChevronLeftIcon /> Sessions
          </button>

          {editingTitle ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                style={{ ...inputStyle, fontSize: '1.1rem' }}
              />
              <button onClick={() => saveRename(openSession)} style={primaryButtonStyle}>
                Save
              </button>
              <button onClick={() => setEditingTitle(false)} style={buttonStyle}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{openSession.title}</h2>
              {canManage && (
                <button onClick={() => startRename(openSession)} title="Rename session" style={iconButtonStyle(false)}>
                  <PencilIcon />
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => openCombined(openSession)}
            style={{ ...primaryButtonStyle, width: '100%', padding: '0.9rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem' }}
          >
            <PlayIcon /> View All (Combined)
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
            {orderedCharts(openSession).map((sc, index, arr) => (
              <div
                key={sc.chart_id}
                style={{
                  background: colors.card,
                  borderRadius: '14px',
                  padding: '0.9rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <span
                    style={{
                      background: colors.border,
                      color: colors.subtext,
                      width: '1.6rem',
                      height: '1.6rem',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sc.charts.title}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  {sc.charts.musical_key && (
                    <span style={{ background: colors.accentBg, color: colors.accent, borderRadius: '8px', padding: '0.25rem 0.6rem', fontSize: '0.85rem', fontWeight: 600 }}>
                      {sc.charts.musical_key}
                    </span>
                  )}
                  <button onClick={() => openChart(sc.charts)} title="View" style={iconButtonStyle(false)}>
                    <DocumentIcon />
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={() => moveSong(openSession, index, -1)}
                        disabled={index === 0}
                        title="Move up"
                        style={{ ...iconButtonStyle(false), opacity: index === 0 ? 0.4 : 1 }}
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        onClick={() => moveSong(openSession, index, 1)}
                        disabled={index === arr.length - 1}
                        title="Move down"
                        style={{ ...iconButtonStyle(false), opacity: index === arr.length - 1 ? 0.4 : 1 }}
                      >
                        <ChevronDownIcon />
                      </button>
                      <button
                        onClick={() => removeSong(openSession, sc.chart_id)}
                        title="Remove from session"
                        style={{ ...iconButtonStyle(false), color: colors.danger }}
                      >
                        <XIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {canManage && (
            <div style={{ marginTop: '1.5rem', background: colors.card, borderRadius: '14px', padding: '1rem' }}>
              <h3 style={{ marginTop: 0 }}>Add Songs</h3>
              {chartsNotInSession.length === 0 ? (
                <p style={{ color: colors.subtext, fontSize: '0.85rem' }}>
                  Every available song is already in this session.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {chartsNotInSession.map((c) => (
                      <label
                        key={c.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '8px',
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={addChartIds.includes(c.id)}
                          onChange={() => toggleAddChart(c.id)}
                        />
                        {c.title}
                      </label>
                    ))}
                  </div>
                  <button onClick={() => addSongsToSession(openSession)} style={{ ...primaryButtonStyle, marginTop: '0.75rem' }}>
                    Add Selected
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {viewing && (
        <PdfViewer
          charts={viewing.charts}
          currentUserId={currentUserId}
          canDrawShared={canManage}
          onClose={() => setViewing(null)}
        />
      )}

      {canManage && !openSession && (
        <div style={{ marginTop: '1.5rem', background: colors.card, borderRadius: '14px', padding: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Create a Session</h3>
          <input
            type="text"
            placeholder="Session title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {availableCharts.map((c) => (
              <label
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedChartIds.includes(c.id)}
                  onChange={() => toggleChart(c.id)}
                />
                {c.title}
              </label>
            ))}
          </div>
          <p style={{ color: colors.subtext, fontSize: '0.85rem' }}>
            Songs are added to the session in the order you check them.
          </p>
          <button onClick={createSession} style={primaryButtonStyle}>
            Create Session
          </button>
        </div>
      )}
    </div>
  )
}

export default Sessions
