export const colors = {
  bg: '#0d0d0f',
  card: '#1c1c1f',
  cardHover: '#232326',
  border: '#2a2a2e',
  text: '#f5f5f5',
  subtext: '#8a8a8f',
  accent: '#3b82f6',
  accentBg: '#1e2a44',
  ready: '#22c55e',
  readyBg: '#123821',
  danger: '#ef4444',
  ping: '#f59e0b',
}

export const pageStyle = {
  background: colors.bg,
  color: colors.text,
  minHeight: '100vh',
  fontFamily: 'sans-serif',
  boxSizing: 'border-box',
}

export const cardStyle = {
  background: colors.card,
  borderRadius: '16px',
  padding: '1.5rem',
}

export const buttonStyle = {
  background: colors.border,
  color: colors.text,
  border: 'none',
  borderRadius: '10px',
  padding: '0.5rem 0.9rem',
  cursor: 'pointer',
  fontSize: '0.9rem',
}

export const primaryButtonStyle = {
  ...buttonStyle,
  background: colors.accent,
  color: '#fff',
  fontWeight: 600,
}

export const dangerButtonStyle = {
  ...buttonStyle,
  color: colors.danger,
}

export const inputStyle = {
  background: colors.bg,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  padding: '0.5rem 0.75rem',
  boxSizing: 'border-box',
}

export const iconButtonStyle = (active, activeColor, activeBg) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2.1rem',
  height: '2.1rem',
  borderRadius: '10px',
  border: 'none',
  cursor: 'pointer',
  background: active ? activeBg : colors.border,
  color: active ? activeColor : colors.subtext,
})
