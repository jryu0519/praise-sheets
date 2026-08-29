import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [status, setStatus] = useState('checking...')

  useEffect(() => {
    supabase.auth.getSession().then(({ error }) => {
      setStatus(error ? `error: ${error.message}` : 'connected to Supabase ✅')
    })
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Praise Sheets</h1>
      <p>Supabase status: {status}</p>
    </div>
  )
}

export default App
