import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { colors, buttonStyle, primaryButtonStyle, inputStyle } from './theme'

function Team({ currentUserId, isHost }) {
  const [members, setMembers] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')

  const loadMembers = () => {
    supabase
      .from('memberships')
      .select('user_id, email, role')
      .order('created_at', { ascending: true })
      .then(({ data }) => setMembers(data ?? []))
  }

  useEffect(() => {
    loadMembers()
  }, [])

  const changeRole = (user_id, role) => {
    supabase
      .from('memberships')
      .update({ role })
      .eq('user_id', user_id)
      .then(() => loadMembers())
  }

  const transferHost = (user_id) => {
    supabase
      .from('memberships')
      .update({ role: 'host' })
      .eq('user_id', user_id)
      .then(() =>
        supabase
          .from('memberships')
          .update({ role: 'editor' })
          .eq('user_id', currentUserId)
          .then(() => loadMembers())
      )
  }

  const sendInvite = () => {
    if (!inviteEmail) return
    supabase
      .from('invites')
      .upsert({ email: inviteEmail, role: inviteRole, invited_by: currentUserId })
      .then(({ error }) => {
        if (error) {
          alert(`Could not save invite: ${error.message}`)
          return
        }
        const subject = encodeURIComponent('Join us on Praise Sheets')
        const body = encodeURIComponent(
          `Hey! Sign in at ${window.location.origin} with this Gmail address to join the team.`
        )
        window.location.href = `mailto:${inviteEmail}?subject=${subject}&body=${body}`
        setInviteEmail('')
      })
  }

  const selectStyle = { ...inputStyle, padding: '0.4rem 0.5rem' }

  return (
    <div style={{ maxWidth: '700px' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Team</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {members.map((m) => (
          <div
            key={m.user_id}
            style={{
              background: colors.card,
              borderRadius: '14px',
              padding: '0.9rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{m.email}</div>
              <div style={{ color: colors.subtext, fontSize: '0.85rem' }}>{m.role}</div>
            </div>
            {isHost && m.user_id !== currentUserId && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} style={selectStyle}>
                  <option value="member">member</option>
                  <option value="editor">editor</option>
                </select>
                <button onClick={() => transferHost(m.user_id)} style={buttonStyle}>
                  Make host
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isHost && (
        <div style={{ marginTop: '1.5rem', background: colors.card, borderRadius: '14px', padding: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Invite someone</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="email"
              placeholder="teammate@gmail.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={inputStyle}
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={selectStyle}>
              <option value="member">member</option>
              <option value="editor">editor</option>
            </select>
            <button onClick={sendInvite} style={primaryButtonStyle}>
              Send Gmail invite
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Team
