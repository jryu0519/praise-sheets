import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

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

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2>Team</h2>
      <ul>
        {members.map((m) => (
          <li key={m.user_id}>
            {m.email} — {m.role}
            {isHost && m.user_id !== currentUserId && (
              <>
                {' '}
                <select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)}>
                  <option value="member">member</option>
                  <option value="editor">editor</option>
                </select>{' '}
                <button onClick={() => transferHost(m.user_id)}>Make host</button>
              </>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <div>
          <h3>Invite someone</h3>
          <input
            type="email"
            placeholder="teammate@gmail.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            <option value="member">member</option>
            <option value="editor">editor</option>
          </select>
          <button onClick={sendInvite}>Send Gmail invite</button>
        </div>
      )}
    </div>
  )
}

export default Team
