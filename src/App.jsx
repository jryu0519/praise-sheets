import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const signOut = () => {
    supabase.auth.signOut()
  }

  if (loading) return null

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Praise Sheets</h1>
      {session ? (
        <div>
          <p>Signed in as {session.user.email}</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      ) : (
        <button onClick={signInWithGoogle}>Sign in with Google</button>
      )}
    </div>
  )
}

export default App
