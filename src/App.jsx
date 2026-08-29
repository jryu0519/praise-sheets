import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [debugInfo, setDebugInfo] = useState(null)

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const access_token = hashParams.get('access_token')
    const refresh_token = hashParams.get('refresh_token')

    const checkChars = (label, str) => {
      if (!str) return `${label}: missing`
      for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) > 255) {
          return `${label}: bad char at index ${i}, code ${str.charCodeAt(i)}`
        }
      }
      return `${label}: OK, length ${str.length}`
    }
    if (access_token || refresh_token) {
      setDebugInfo(`${checkChars('access_token', access_token)} | ${checkChars('refresh_token', refresh_token)}`)
    }

    const init = access_token && refresh_token
      ? supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
          window.history.replaceState(null, '', window.location.pathname)
          if (error) setAuthError(error.message)
        })
      : Promise.resolve()

    init.then(() =>
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session)
        setLoading(false)
      })
    )

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setRole(null)
      return
    }
    supabase
      .from('memberships')
      .select('role')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        setRole(error ? `error: ${error.message}` : data.role)
      })
  }, [session])

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
          <p>Role: {role ?? 'loading...'}</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      ) : (
        <div>
          <button onClick={signInWithGoogle}>Sign in with Google</button>
          {authError && <p style={{ color: 'red' }}>Auth error: {authError}</p>}
          {debugInfo && <p style={{ color: 'blue' }}>Debug: {debugInfo}</p>}
        </div>
      )}
    </div>
  )
}

export default App
