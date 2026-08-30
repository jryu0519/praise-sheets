import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import PdfViewer from './PdfViewer'

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

function Charts({ currentUserId, canManage }) {
  const [charts, setCharts] = useState([])
  const [sortBy, setSortBy] = useState('title') // 'title' | 'key' | 'date'
  const [title, setTitle] = useState('')
  const [musicalKey, setMusicalKey] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState(null)

  const loadCharts = () => {
    supabase
      .from('charts')
      .select('id, title, musical_key, storage_path, created_at')
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
      musical_key: musicalKey || null,
      storage_path: storagePath,
      uploaded_by: currentUserId,
    })

    if (insertError) {
      alert(`Could not save chart: ${insertError.message}`)
    } else {
      setTitle('')
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

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ textAlign: 'right' }}>
        <label>
          Sort by:{' '}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="title">Title (A-Z)</option>
            <option value="key">Key</option>
            <option value="date">Date uploaded (newest first)</option>
          </select>
        </label>
      </div>
      <ul>
        {sortCharts(charts, sortBy).map((c) => (
          <li key={c.id}>
            {c.title}
            {c.musical_key && ` — key of ${c.musical_key}`}{' '}
            <button onClick={() => viewChart(c.id, c.storage_path)}>View</button>
          </li>
        ))}
      </ul>

      {viewing && (
        <PdfViewer
          charts={[viewing]}
          currentUserId={currentUserId}
          canDrawShared={canManage}
          onClose={() => setViewing(null)}
        />
      )}

      {canManage && (
        <div>
          <h3>Upload a chart</h3>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder="Key (optional)"
            value={musicalKey}
            onChange={(e) => setMusicalKey(e.target.value)}
          />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files[0] ?? null)}
          />
          <button onClick={uploadChart} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      )}
    </div>
  )
}

export default Charts
