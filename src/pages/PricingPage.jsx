import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createCheckoutSession } from '../lib/stripe'

export default function PricingPage() {
  const { user, isPro } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  async function handleUpgrade() {
    if (!user) { navigate('/login'); return }
    setBusy(true); setError('')
    try { await createCheckoutSession(user.uid, user.email) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const Feature = ({ ok, pro, text }) => (
    <li style={{ display:'flex', alignItems:'center', gap:10, fontSize:13,
      color: ok ? 'var(--text)' : 'var(--text2)', opacity: ok ? 1 : 0.5 }}>
      <span style={{ color: ok ? (pro ? 'var(--accent)' : '#47ff8a') : 'var(--text2)', fontSize:12, flexShrink:0 }}>
        {ok ? (pro ? '⚡' : '✓') : '✕'}
      </span>
      {text}
    </li>
  )

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)', padding:'20px 16px 40px',
      overflowY:'auto', display:'flex', flexDirection:'column', alignItems:'center' }}>

      <button onClick={() => navigate('/app')} style={{ alignSelf:'flex-start', background:'none',
        border:'none', color:'var(--text2)', fontSize:13, cursor:'pointer', marginBottom:24 }}>
        ← Voltar ao app
      </button>

      <div style={{ textAlign:'center', marginBottom:32 }}>
        <div style={{ display:'inline-block', background:'rgba(232,255,71,0.1)',
          border:'1px solid rgba(232,255,71,0.3)', color:'var(--accent)',
          fontSize:11, fontFamily:'monospace', letterSpacing:2,
          padding:'4px 12px', borderRadius:20, marginBottom:12 }}>PLANOS</div>
        <h1 style={{ fontSize:28, fontWeight:800, marginBottom:8 }}>Escolha seu plano</h1>
        <p style={{ color:'var(--text2)', fontSize:14 }}>Comece grátis. Upgrade quando precisar.</p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:16, width:'100%', maxWidth:440 }}>

        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'28px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text2)', marginBottom:12 }}>FREE</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:20 }}>
            <span style={{ fontSize:32, fontWeight:800 }}>R$ 0</span>
            <span style={{ fontSize:13, color:'var(--text2)' }}>/ sempre</span>
          </div>
          <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
            <Feature ok   text="Ferramentas: Parede e Cômodo" />
            <Feature ok   text="Grade e snap automático" />
            <Feature ok   text="Desfazer / refazer" />
            <Feature      text="Máx. 10 elementos" />
            <Feature      text="Sem exportar PNG" />
            <Feature      text="Sem porta, janela, escada, texto" />
          </ul>
          {!isPro && (
            <div style={{ textAlign:'center', padding:12, background:'var(--surface2)',
              border:'1px solid var(--border)', borderRadius:12, fontSize:13, color:'var(--text2)' }}>
              Plano atual
            </div>
          )}
        </div>

        <div style={{ position:'relative', background:'var(-
