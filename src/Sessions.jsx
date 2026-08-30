import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import PdfViewer from './PdfViewer'

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
    <div style={{ marginTop: '2rem' }}>
      <h1>Sessions</h1>

      {!openSession && (
        <ul>
          {sessions.map((s) => (
            <li key={s.id}>
              <button onClick={() => setOpenSessionId(s.id)}>{s.title}</button>{' '}
              ({s.session_charts.length} chart{s.session_charts.length === 1 ? '' : 's'})
            </li>
          ))}
        </ul>
      )}

      {openSession && (
        <div>
          <button onClick={() => setOpenSessionId(null)}>‹ Back to sessions</button>
          <h2>{openSession.title}</h2>
          <ul>
            {orderedCharts(openSession).map((sc) => (
              <li key={sc.chart_id}>
                {sc.charts.title}
                {sc.charts.musical_key && ` — key of ${sc.charts.musical_key}`}{' '}
                <button onClick={() => openChart(sc.charts)}>View</button>
              </li>
            ))}
          </ul>
          <button onClick={() => openCombined(openSession)}>View all (combined)</button>
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
        <div style={{ marginTop: '1.5rem' }}>
          <h2>Create a session</h2>
          <input
            type="text"
            placeholder="Session title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <ul>
            {availableCharts.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedChartIds.includes(c.id)}
                    onChange={() => toggleChart(c.id)}
                  />{' '}
                  {c.title}
                </label>
              </li>
            ))}
          </ul>
          <p>Charts are added to the session in the order you check them.</p>
          <button onClick={createSession}>Create session</button>
        </div>
      )}
    </div>
  )
}

export default Sessions
