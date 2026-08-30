import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import PdfViewer from './PdfViewer'
import { colors, buttonStyle, primaryButtonStyle, dangerButtonStyle, inputStyle, iconButtonStyle } from './theme'

const sortCharts = (charts, sortBy) => {
  const sorted = [...charts]
  if (sortBy === 'key') {
    sorted.sort((a, b) => {
      if (!a.musical_key && !b.musical_key) return a.title.localeCompare(b.title)
      if (!a.musical_key) return 1
      if (!b.musical_key) return -1
      return a.musical_key.localeCompare(b.musical_key) || a.title.localeCompare(b.title)
    })
  } else if (sortBy === 'date') {
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } else {
    sorted.sort((a, b) => a.title.localeCompare(b.title))
  }
  return sorted
}

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

const DocumentIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
)

function Charts({ currentUserId, canManage, isHost }) {
  const [charts, setCharts] = useState([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('title') // 'title' | 'key' | 'date'
  const [showArchived, setShowArchived] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [musicalKey, setMusicalKey] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')

  const loadCharts = () => {
    supabase
      .from('charts')
      .select('id, title, artist, musical_key, storage_path, created_at, archived, ready_for_week')
      .then(({ data }) => setCharts(data ?? []))
  }

  useEffect(() => {
    loadCharts()
  }, [])

  const uploadChart = async () => {
    if (!file || !title) return
    setUploading(true)

    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
    const storagePath = `${crypto.randomUUID()}${extension}`
    const { error: uploadError } = await supabase.storage
      .from('charts')
      .upload(storagePath, file)

    if (uploadError) {
      alert(`Could not upload file: ${uploadError.message}`)
      setUploading(false)
      return
    }

    const { error: insertError } = await supabase.from('charts').insert({
      title,
      artist: artist || null,
      musical_key: musicalKey || null,
      storage_path: storagePath,
      uploaded_by: currentUserId,
    })

    if (insertError) {
      alert(`Could not save chart: ${insertError.message}`)
    } else {
      setTitle('')
      setArtist('')
      setMusicalKey('')
      setFile(null)
      loadCharts()
    }
    setUploading(false)
  }

  const viewChart = async (chartId, storagePath) => {
    const { data, error } = await supabase.storage
      .from('charts')
      .createSignedUrl(storagePath, 300)

    if (error) {
      alert(`Could not open file: ${error.message}`)
      return
    }
    setViewing({ id: chartId, url: data.signedUrl })
  }

  const toggleReady = async (chart) => {
    const { error } = await supabase
      .from('charts')
      .update({ ready_for_week: !chart.ready_for_week })
      .eq('id', chart.id)
    if (error) alert(`Could not update: ${error.message}`)
    else loadCharts()
  }

  const startEdit = (chart) => {
    setEditingId(chart.id)
    setEditTitle(chart.title)
    setEditArtist(chart.artist || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async (chart) => {
    if (!editTitle) return
    const { error } = await supabase
      .from('charts')
      .update({ title: editTitle, artist: editArtist || null })
      .eq('id', chart.id)
    if (error) {
      alert(`Could not save changes: ${error.message}`)
      return
    }
    setEditingId(null)
    loadCharts()
  }

  const archiveChart = async (chart) => {
    const { error } = await supabase.from('charts').update({ archived: true }).eq('id', chart.id)
    if (error) alert(`Could not archive: ${error.message}`)
    else loadCharts()
  }

  const unarchiveChart = async (chart) => {
    const { error } = await supabase.from('charts').update({ archived: false }).eq('id', chart.id)
    if (error) alert(`Could not unarchive: ${error.message}`)
    else loadCharts()
  }

  const deleteChart = async (chart) => {
    if (!window.confirm(`Permanently delete "${chart.title}"? This cannot be undone.`)) return

    const { error: deleteError } = await supabase.from('charts').delete().eq('id', chart.id)
    if (deleteError) {
      alert(`Could not delete: ${deleteError.message}`)
      return
    }
    await supabase.storage.from('charts').remove([chart.storage_path])
    loadCharts()
  }

  const visibleCharts = sortCharts(
    charts.filter(
      (c) => !!c.archived === showArchived && c.title.toLowerCase().includes(search.toLowerCase())
    ),
    sortBy
  )

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, textAlign: 'center' }}>
        Pri Music Sheet List
      </h1>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
        <span style={{ background: colors.card, color: colors.subtext, padding: '0.4rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem' }}>
          {charts.filter((c) => !c.archived).length} songs
        </span>
        <button onClick={loadCharts} title="Refresh" style={{ ...iconButtonStyle(false), borderRadius: '999px' }}>
          <RefreshIcon />
        </button>
      </div>

      <input
        type="text"
        placeholder="Search songs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          background: colors.card,
          color: colors.text,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', fontSize: '0.85rem', color: colors.subtext }}>
        {isHost && (
          <label>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show
            archived
          </label>
        )}
        <label>
          Sort by:{' '}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ background: colors.card, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px' }}>
            <option value="title">Title (A-Z)</option>
            <option value="key">Key</option>
            <option value="date">Date uploaded (newest first)</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
        {visibleCharts.map((c) => (
          <div key={c.id} style={{ background: colors.card, borderRadius: '14px', padding: '0.9rem 1rem' }}>
            {editingId === c.id ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  placeholder="Artist (optional)"
                  style={inputStyle}
                />
                <button onClick={() => saveEdit(c)} style={primaryButtonStyle}>
                  Save
                </button>
                <button onClick={cancelEdit} style={buttonStyle}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.title}
                  </div>
                  {c.artist && <div style={{ color: colors.subtext, fontSize: '0.85rem' }}>{c.artist}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  {c.musical_key && (
                    <span style={{ background: colors.accentBg, color: colors.accent, borderRadius: '8px', padding: '0.25rem 0.6rem', fontSize: '0.85rem', fontWeight: 600 }}>
                      {c.musical_key}
                    </span>
                  )}
                  <button onClick={() => viewChart(c.id, c.storage_path)} title="View" style={iconButtonStyle(false)}>
                    <DocumentIcon />
                  </button>
                  {isHost && (
                    <>
                      <button onClick={() => startEdit(c)} title="Edit title/artist" style={iconButtonStyle(false)}>
                        <PencilIcon />
                      </button>
                      <button
                        onClick={() => toggleReady(c)}
                        title="Ready for this week"
                        style={iconButtonStyle(c.ready_for_week, colors.ready, colors.readyBg)}
                      >
                        <CheckIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {isHost && editingId !== c.id && (
              <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
                {c.archived ? (
                  <button onClick={() => unarchiveChart(c)} style={buttonStyle}>
                    Unarchive
                  </button>
                ) : (
                  <button onClick={() => archiveChart(c)} style={buttonStyle}>
                    Archive
                  </button>
                )}
                <button onClick={() => deleteChart(c)} style={dangerButtonStyle}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {viewing && (
        <PdfViewer
          charts={[viewing]}
          currentUserId={currentUserId}
          canDrawShared={canManage}
          onClose={() => setViewing(null)}
        />
      )}

      {canManage && (
        <div style={{ marginTop: '1.5rem', background: colors.card, borderRadius: '14px', padding: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Upload Song</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Artist (optional)"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Key (optional)"
              value={musicalKey}
              onChange={(e) => setMusicalKey(e.target.value)}
              style={inputStyle}
            />
            <input
              id="chart-file-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files[0] ?? null)}
              style={{ display: 'none' }}
            />
            <label htmlFor="chart-file-input" style={{ ...buttonStyle, display: 'inline-block', cursor: 'pointer' }}>
              Choose File
            </label>
            <span style={{ color: colors.subtext, fontSize: '0.85rem' }}>
              {file ? file.name : 'No file chosen'}
            </span>
            <button onClick={uploadChart} disabled={uploading} style={primaryButtonStyle}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Charts
