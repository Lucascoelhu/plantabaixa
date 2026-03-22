import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ERR = {
  'auth/user-not-found':       'Usuário não encontrado.',
  'auth/wrong-password':       'Senha incorreta.',
  'auth/email-already-in-use': 'E-mail já cadastrado.',
  'auth/weak-password':        'Senha muito fraca (mín. 6 caracteres).',
  'auth/invalid-email':        'E-mail inválido.',
  'auth/popup-closed-by-user': 'Login cancelado.',
  'auth/too-many-requests':    'Muitas tentativas. Tente mais tarde.',
  'auth/invalid-credential':   'E-mail ou senha incorretos.',
}

export default function LoginPage() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode]   = useState('login')
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg]     = useState('')
  const [busy, setBusy]   = useState(false)

  async function handleGoogle() {
    setBusy(true); setError('')
    try { await loginWithGoogle(); navigate('/app') }
    catch (e) { setError(ERR[e.code] || 'Erro ao entrar com Google.') }
    finally { setBusy(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setBusy(true); setError(''); setMsg('')
    try {
      if (mode === 'reset')    { await resetPassword(email); setMsg('E-mail de recuperação enviado!') }
      else if (mode === 'register') { await registerWithEmail(name, email, pass); navigate('/app') }
      else                     { await loginWithEmail(email, pass); navigate('/app') }
    } catch (e) { setError(ERR[e.code] || 'Ocorreu um erro. Tente novamente.') }
    finally { setBusy(false) }
  }

  const titles = { login: 'Entrar', register: 'Criar conta', reset: 'Recuperar senha' }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center',
      padding:20, background:'var(--bg)', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:420, background:'var(--surface)',
        border:'1px solid var(--border)', borderRadius:20, padding:'32px 28px' }}>

        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <div style={{ width:9, height:9, background:'var(--accent)', borderRadius:'50%',
            boxShadow:'0 0 10px var(--accent)' }} />
          <span style={{ fontSize:17, fontWeight:800, letterSpacing:-0.5 }}>PLANTA PRO</span>
        </div>
        <p style={{ fontSize:12, color:'var(--text2)', marginBottom:24 }}>
          Sistema profissional de planta baixa
        </p>

        <h2 style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>{titles[mode]}</h2>

        {mode !== 'reset' && (
          <button onClick={handleGoogle} disabled={busy} style={{
            width:'100%', padding:'12px 16px', background:'var(--surface2)',
            border:'1px solid var(--border)', borderRadius:12, color:'var(--text)',
            fontSize:14, fontWeight:600, cursor:'pointer', display:'flex',
            alignItems:'center', justifyContent:'center', gap:10, marginBottom:16,
          }}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continuar com Google
          </button>
        )}

        {mode !== 'reset' && (
          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'0 0 16px',
            color:'var(--text2)', fontSize:12 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
            ou
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {mode === 'register' && (
            <input style={inputStyle} type="text" placeholder="Seu nome"
              value={name} onChange={e => setName(e.target.value)} required />
          )}
          <input style={inputStyle} type="email" placeholder="E-mail"
            value={email} onChange={e => setEmail(e.target.value)} required />
          {mode !== 'reset' && (
            <input style={inputStyle} type="password" placeholder="Senha (mín. 6 caracteres)"
              value={pass} onChange={e => setPass(e.target.value)} required minLength={6} />
          )}
          {error && <p style={{ fontSize:12, color:'var(--accent3)', textAlign:'center' }}>{error}</p>}
          {msg   && <p style={{ fontSize:12, color:'#47ff8a', textAlign:'center' }}>{msg}</p>}
          <button type="submit" disabled={busy} style={{
            marginTop:4, padding:13, background:'var(--accent)', border:'none',
            borderRadius:12, color:'#0f0f12', fontSize:14, fontWeight:800, cursor:'pointer',
            opacity: busy ? 0.6 : 1,
          }}>
            {busy ? '...' : titles[mode]}
          </button>
        </form>

        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:16, alignItems:'center' }}>
          {mode === 'login' && <>
            <button style={linkStyle} onClick={() => { setMode('register'); setError('') }}>Criar conta grátis</button>
            <button style={linkStyle} onClick={() => { setMode('reset'); setError('') }}>Esqueci minha senha</button>
          </>}
          {mode === 'register' && <button style={linkStyle} onClick={() => { setMode('login'); setError('') }}>Já tenho conta → Entrar</button>}
          {mode === 'reset'    && <button style={linkStyle} onClick={() => { setMode('login'); setError('') }}>← Voltar para login</button>}
        </div>

        <div style={{ marginTop:20, padding:'10px 14px', background:'rgba(232,255,71,0.05)',
          border:'1px solid rgba(232,255,71,0.15)', borderRadius:10, textAlign:'center' }}>
          <span style={{ fontSize:12, color:'var(--text2)' }}>Plano </span>
          <span style={{ fontSize:12, color:'var(--accent)', fontWeight:700 }}>PRO</span>
          <span style={{ fontSize:12, color:'var(--text2)' }}> disponível após login · pagamento único</span>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width:'100%', padding:'12px 14px', background:'var(--surface2)',
  border:'1px solid var(--border)', borderRadius:10, color:'var(--text)',
  fontSize:14, outline:'none', WebkitAppearance:'none',
}
const linkStyle = {
  background:'none', border:'none', color:'var(--accent2)',
  fontSize:13, cursor:'pointer', textDecoration:'underline',
}
