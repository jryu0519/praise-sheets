import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import PdfViewer from './PdfViewer'

function Charts({ currentUserId, canManage }) {
  const [charts, setCharts] = useState([])
  const [title, setTitle] = useState('')
  const [musicalKey, setMusicalKey] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState(null)

  const loadCharts = () => {
    supabase
      .from('charts')
      .select('id, title, musical_key, storage_path')
      .order('created_at', { ascending: true })
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
    setViewing({ chartId, url: data.signedUrl })
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2>Charts</h2>
      <ul>
        {charts.map((c) => (
          <li key={c.id}>
            {c.title}
            {c.musical_key && ` — key of ${c.musical_key}`}{' '}
            <button onClick={() => viewChart(c.id, c.storage_path)}>View</button>
          </li>
        ))}
      </ul>

      {viewing && (
        <PdfViewer
          url={viewing.url}
          chartId={viewing.chartId}
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
