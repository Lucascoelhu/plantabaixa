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
        <p style={{ color:'var(--text2)', fontSize:14 }}>Comece gratis. Upgrade quando precisar.</p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:16, width:'100%', maxWidth:440 }}>

        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'28px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text2)', marginBottom:12 }}>FREE</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:20 }}>
            <span style={{ fontSize:32, fontWeight:800 }}>R$ 0</span>
            <span style={{ fontSize:13, color:'var(--text2)' }}>/ sempre</span>
          </div>
          <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
            <Feature ok   text="Ferramentas: Parede e Comodo" />
            <Feature ok   text="Grade e snap automatico" />
            <Feature ok   text="Desfazer / refazer" />
            <Feature      text="Max. 10 elementos" />
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

        <div style={{ position:'relative', background:'var(--surface)',
          border:'1px solid rgba(232,255,71,0.3)', borderRadius:20, padding:'28px 24px', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-60, right:-60, width:180, height:180,
            background:'radial-gradient(circle, rgba(232,255,71,0.12) 0%, transparent 70%)',
            pointerEvents:'none' }} />

          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <span style={{ fontSize:14, fontWeight:800, color:'var(--accent)' }}>PRO</span>
            <div style={{ background:'var(--accent)', color:'#0f0f12', fontSize:9,
              fontWeight:800, fontFamily:'monospace', padding:'2px 8px', borderRadius:20 }}>POPULAR</div>
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:4 }}>
            <span style={{ fontSize:32, fontWeight:800, color:'var(--accent)' }}>R$ 99,90</span>
            <span style={{ fontSize:13, color:'var(--text2)' }}>unica vez</span>
          </div>
          <div style={{ fontSize:11, color:'var(--accent)', fontFamily:'monospace',
            letterSpacing:0.5, marginBottom:20 }}>ACESSO VITALICIO - SEM MENSALIDADE</div>

          <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
            <Feature ok pro text="Tudo do plano Free" />
            <Feature ok pro text="Elementos ilimitados" />
            <Feature ok pro text="Exportar PNG em alta qualidade" />
            <Feature ok pro text="Porta com arco de abertura" />
            <Feature ok pro text="Janelas com detalhes" />
            <Feature ok pro text="Escadas com degraus" />
            <Feature ok pro text="Linha de medida / cota" />
            <Feature ok pro text="Texto / etiqueta de comodos" />
          </ul>

          {isPro
            ? <div style={{ textAlign:'center', padding:12, background:'rgba(232,255,71,0.1)',
                border:'1px solid rgba(232,255,71,0.3)', borderRadius:12, fontSize:13,
                fontWeight:700, color:'var(--accent)' }}>Voce e PRO!</div>
            : <button onClick={handleUpgrade} disabled={busy} style={{
                width:'100%', padding:14, background:'var(--accent)', border:'none',
                borderRadius:12, color:'#0f0f12', fontSize:14, fontWeight:800,
                cursor:'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Aguarde...' : 'Comprar acesso vitalicio'}
              </button>
          }
          {error && <p style={{ color:'var(--accent3)', fontSize:12, marginTop:8, textAlign:'center' }}>{error}</p>}
        </div>
      </div>

      <p style={{ marginTop:28, textAlign:'center', fontSize:12, color:'var(--text2)', lineHeight:1.7 }}>
        Pagamento unico e seguro via Stripe. Pague uma vez, use para sempre.
      </p>
    </div>
  )
}
