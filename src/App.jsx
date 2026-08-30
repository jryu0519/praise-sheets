import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Team from './Team'
import Home from './Home'
import Sessions from './Sessions'
import { colors, pageStyle, cardStyle, primaryButtonStyle } from './theme'

function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [page, setPage] = useState('home') // 'home' | 'sessions' | 'team'
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const access_token = hashParams.get('access_token')
    const refresh_token = hashParams.get('refresh_token')

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

  if (loading) return <div style={pageStyle} />

  const canManage = role === 'host' || role === 'editor'

  const menuItemStyle = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    color: colors.text,
    padding: '0.6rem 1rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
  }

  if (!session) {
    return (
      <div style={{ ...pageStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Praise Sheets</h1>
        <button onClick={signInWithGoogle} style={primaryButtonStyle}>
          Sign in with Google
        </button>
        {authError && <p style={{ color: colors.danger }}>Auth error: {authError}</p>}
      </div>
    )
  }

  return (
    <div style={{ ...pageStyle, padding: '2rem' }}>
      {role && (
        <div style={{ position: 'fixed', top: '1rem', left: '1rem', zIndex: 10 }}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            style={{ ...primaryButtonStyle, borderRadius: '999px' }}
          >
            ☰ Menu
          </button>
          {menuOpen && (
            <div
              style={{
                ...cardStyle,
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                left: 0,
                padding: '0.5rem',
                minWidth: '220px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <button
                style={menuItemStyle}
                onClick={() => {
                  setPage('home')
                  setMenuOpen(false)
                }}
              >
                Home
              </button>
              <button
                style={menuItemStyle}
                onClick={() => {
                  setPage('sessions')
                  setMenuOpen(false)
                }}
              >
                Sessions
              </button>
              <button
                style={menuItemStyle}
                onClick={() => {
                  setPage('team')
                  setMenuOpen(false)
                }}
              >
                Team member organization
              </button>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          ...cardStyle,
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          padding: '0.6rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.8rem',
          color: colors.subtext,
        }}
      >
        <span>
          {session.user.email} · {role ?? 'loading...'}
        </span>
        <button
          onClick={signOut}
          style={{ background: colors.border, color: colors.text, border: 'none', borderRadius: '8px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          Sign out
        </button>
      </div>

      {role && page === 'home' && (
        <Home currentUserId={session.user.id} canManage={canManage} isHost={role === 'host'} />
      )}
      {role && page === 'sessions' && (
        <Sessions currentUserId={session.user.id} canManage={canManage} />
      )}
      {role && page === 'team' && (
        <Team currentUserId={session.user.id} isHost={role === 'host'} />
      )}
    </div>
  )
}

export default App
