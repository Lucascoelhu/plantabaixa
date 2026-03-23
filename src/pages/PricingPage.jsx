import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createCheckoutSession } from '../lib/payment'

export default function PricingPage() {
  const { user, isPro, refreshUserDoc } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [pixModal, setPixModal] = useState(false)
  const [pixData, setPixData] = useState(null)
  const [pixBusy, setPixBusy] = useState(false)
  const [pixError, setPixError] = useState('')
  const [pixPaid, setPixPaid] = useState(false)
  const [copied, setCopied]   = useState(false)

  async function handleUpgrade() {
    if (!user) { navigate('/login'); return }
    setBusy(true); setError('')
    try { await createCheckoutSession(user.uid, user.email) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handlePix() {
    if (!user) { navigate('/login'); return }
    setPixBusy(true); setPixError(''); setPixData(null); setPixPaid(false)
    setPixModal(true)
    try {
      const res = await fetch('/api/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, email: user.email, name: user.name || 'Usuario' }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const data = await res.json()
      setPixData(data)

      // Poll every 5s to check if paid
      const interval = setInterval(async () => {
        const r = await fetch('/api/check-pix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: data.id, userId: user.uid }),
        })
        const result = await r.json()
        if (result.status === 'approved') {
          clearInterval(interval)
          setPixPaid(true)
          await refreshUserDoc()
          setTimeout(() => { setPixModal(false); navigate('/app') }, 2000)
        }
      }, 5000)

    } catch (e) {
      setPixError(e.message)
    } finally {
      setPixBusy(false)
    }
  }

  function copyPix() {
    if (!pixData?.qr_code) return
    navigator.clipboard.writeText(pixData.qr_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const Feature = ({ ok, pro, text }) => (
    <li style={{ display:'flex', alignItems:'center', gap:10, fontSize:13,
      color: ok ? 'var(--text)' : 'var(--text2)', opacity: ok ? 1 : 0.5 }}>
      <span style={{ color: ok ? (pro ? 'var(--accent)' : '#47ff8a') : 'var(--text2)', fontSize:12, flexShrink:0 }}>
        {ok ? 'OK' : 'X'}
      </span>
      {text}
    </li>
  )

  return (
    <div style={{ height:'100dvh', background:'var(--bg)', overflowY:'auto',
      display:'flex', flexDirection:'column', alignItems:'center', padding:'20px 16px 60px' }}>

      <button onClick={() => navigate('/app')} style={{ alignSelf:'flex-start', background:'none',
        border:'none', color:'var(--text2)', fontSize:13, cursor:'pointer', marginBottom:24 }}>
        Voltar ao app
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

        {/* FREE */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'28px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text2)', marginBottom:12 }}>FREE</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:20 }}>
            <span style={{ fontSize:32, fontWeight:800 }}>R$ 0</span>
            <span style={{ fontSize:13, color:'var(--text2)' }}>/ sempre</span>
          </div>
          <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
            <Feature ok   text="Ferramentas: Parede e Comodo" />
            <Feature ok   text="Grade, snap e linhas retas" />
            <Feature ok   text="Desfazer / refazer" />
            <Feature ok   text="Botao mover tela" />
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

        {/* PRO */}
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
            <span style={{ fontSize:32, fontWeight:800, color:'var(--accent)' }}>R$ 19,90</span>
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

          {isPro ? (
            <div style={{ textAlign:'center', padding:12, background:'rgba(232,255,71,0.1)',
              border:'1px solid rgba(232,255,71,0.3)', borderRadius:12, fontSize:13,
              fontWeight:700, color:'var(--accent)' }}>Voce é PRO!</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* Cartao / Boleto */}
              <button onClick={handleUpgrade} disabled={busy} style={{
                width:'100%', padding:14, background:'var(--accent)', border:'none',
                borderRadius:12, color:'#0f0f12', fontSize:14, fontWeight:800,
                cursor:'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Aguarde...' : 'Pagar com Cartao ou Boleto'}
              </button>

              {/* PIX */}
              <button onClick={handlePix} disabled={pixBusy} style={{
                width:'100%', padding:14, background:'rgba(71,196,255,0.15)',
                border:'1px solid var(--accent2)', borderRadius:12,
                color:'var(--accent2)', fontSize:14, fontWeight:800,
                cursor:'pointer', opacity: pixBusy ? 0.7 : 1 }}>
                {pixBusy ? 'Gerando PIX...' : 'Pagar com PIX'}
              </button>
            </div>
          )}
          {error && <p style={{ color:'var(--accent3)', fontSize:12, marginTop:8, textAlign:'center' }}>{error}</p>}
        </div>
      </div>

      <p style={{ marginTop:28, textAlign:'center', fontSize:12, color:'var(--text2)', lineHeight:1.7 }}>
        Pagamento unico e seguro via Mercado Pago.<br/>
        Aceita cartao, PIX e boleto.<br/>
        Pague uma vez, use para sempre.
      </p>

      {/* PIX MODAL */}
      {pixModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000,
          display:'flex', alignItems:'flex-end', justifyContent:'center',
          overflowY:'auto' }}
          onClick={() => !pixPaid && setPixModal(false)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:'20px 20px 0 0', padding:24, width:'100%', maxWidth:440,
            minHeight:'auto', marginTop:'auto' }}
            onClick={e => e.stopPropagation()}>

            {/* Botao fechar */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2, margin:'0 auto' }} />
              {!pixPaid && (
                <button onClick={() => setPixModal(false)} style={{
                  background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:8, color:'var(--text2)', fontSize:18,
                  width:32, height:32, cursor:'pointer', display:'flex',
                  alignItems:'center', justifyContent:'center', flexShrink:0 }}>x</button>
              )}
            </div>

            <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2, margin:'0 auto 20px' }} />

            {pixPaid ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>⚡</div>
                <h3 style={{ fontSize:22, fontWeight:800, color:'var(--accent)', marginBottom:8 }}>PIX Aprovado!</h3>
                <p style={{ color:'var(--text2)', fontSize:14 }}>Redirecionando para o app...</p>
              </div>
            ) : pixBusy ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
                <p style={{ color:'var(--text2)', fontSize:14 }}>Gerando QR Code PIX...</p>
              </div>
            ) : pixError ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <p style={{ color:'var(--accent3)', fontSize:14, marginBottom:16 }}>{pixError}</p>
                <button onClick={() => setPixModal(false)} style={{ padding:'10px 24px',
                  background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:10, color:'var(--text)', cursor:'pointer' }}>Fechar</button>
              </div>
            ) : pixData ? (
              <>
                <h3 style={{ fontSize:18, fontWeight:800, marginBottom:4, textAlign:'center' }}>
                  Pague R$ 19,90 via PIX
                </h3>
                <p style={{ fontSize:12, color:'var(--text2)', textAlign:'center', marginBottom:20 }}>
                  Escaneie o QR Code ou copie o codigo abaixo
                </p>

                {/* QR Code */}
                {pixData.qr_code_base64 && (
                  <div style={{ textAlign:'center', marginBottom:20 }}>
                    <img src={'data:image/png;base64,' + pixData.qr_code_base64}
                      alt="QR Code PIX"
                      style={{ width:200, height:200, borderRadius:12,
                        background:'white', padding:8 }} />
                  </div>
                )}

                {/* Copia e cola */}
                <p style={{ fontSize:11, color:'var(--text2)', marginBottom:8, fontFamily:'monospace' }}>
                  CODIGO PIX COPIA E COLA:
                </p>
                <div style={{ background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:10, padding:12, marginBottom:12,
                  fontSize:10, fontFamily:'monospace', color:'var(--text2)',
                  wordBreak:'break-all', lineHeight:1.6 }}>
                  {pixData.qr_code}
                </div>

                <button onClick={copyPix} style={{
                  width:'100%', padding:14, background: copied ? 'rgba(71,255,138,0.2)' : 'rgba(71,196,255,0.15)',
                  border:'1px solid ' + (copied ? '#47ff8a' : 'var(--accent2)'),
                  borderRadius:12, color: copied ? '#47ff8a' : 'var(--accent2)',
                  fontSize:14, fontWeight:800, cursor:'pointer', marginBottom:12 }}>
                  {copied ? 'Copiado!' : 'Copiar codigo PIX'}
                </button>

                <div style={{ textAlign:'center', padding:'10px', background:'rgba(232,255,71,0.05)',
                  border:'1px solid rgba(232,255,71,0.15)', borderRadius:10 }}>
                  <p style={{ fontSize:11, color:'var(--text2)', fontFamily:'monospace' }}>
                    Verificando pagamento automaticamente...
                  </p>
                  <p style={{ fontSize:10, color:'var(--text2)', marginTop:4 }}>
                    Apos pagar o PIX, sua conta sera ativada em ate 1 minuto
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
