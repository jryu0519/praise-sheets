import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import PdfViewer from './PdfViewer'
import { colors, buttonStyle, primaryButtonStyle, inputStyle } from './theme'

function Sessions({ currentUserId, canManage }) {
  const [sessions, setSessions] = useState([])
  const [availableCharts, setAvailableCharts] = useState([])
  const [openSessionId, setOpenSessionId] = useState(null)
  const [title, setTitle] = useState('')
  const [selectedChartIds, setSelectedChartIds] = useState([])
  const [viewing, setViewing] = useState(null) // { charts: [{ id, url }] }

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

  const openSession = sessions.find((s) => s.id === openSessionId)

  return (
    <div style={{ maxWidth: '700px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Sessions</h1>

      {!openSession && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
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
              }}
            >
              <span style={{ fontWeight: 700 }}>{s.title}</span>
              <span style={{ color: colors.subtext, fontSize: '0.85rem' }}>
                {s.session_charts.length} chart{s.session_charts.length === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
      )}

      {openSession && (
        <div>
          <button onClick={() => setOpenSessionId(null)} style={buttonStyle}>
            ‹ Back to sessions
          </button>
          <h2 style={{ marginTop: '1rem' }}>{openSession.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {orderedCharts(openSession).map((sc) => (
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
                <div>
                  <div style={{ fontWeight: 700 }}>{sc.charts.title}</div>
                  {sc.charts.musical_key && (
                    <div style={{ color: colors.subtext, fontSize: '0.85rem' }}>Key of {sc.charts.musical_key}</div>
                  )}
                </div>
                <button onClick={() => openChart(sc.charts)} style={buttonStyle}>
                  View
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => openCombined(openSession)} style={{ ...primaryButtonStyle, marginTop: '1rem' }}>
            View all (combined)
          </button>
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
          <h3 style={{ marginTop: 0 }}>Create a session</h3>
          <input
            type="text"
            placeholder="Session title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {availableCharts.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
            Charts are added to the session in the order you check them.
          </p>
          <button onClick={createSession} style={primaryButtonStyle}>
            Create session
          </button>
        </div>
      )}
    </div>
  )
}

export default Sessions
