import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function PaymentSuccessPage() {
  const { refreshUserDoc, isPro } = useAuth()
  const navigate = useNavigate()
  const [dots, setDots] = useState('.')

  useEffect(() => {
    let tries = 0
    const timer = setInterval(async () => {
      tries++
      await refreshUserDoc()
      setDots('.'.repeat((tries % 3) + 1))
      if (tries > 15) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (isPro) setTimeout(() => navigate('/app'), 1500)
  }, [isPro])

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)', padding:20 }}>
      <div style={{ textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:20, padding:'40px 32px', maxWidth:380, width:'100%' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>{isPro ? '⚡' : '⏳'}</div>
        <h2 style={{ fontSize:24, fontWeight:800, marginBottom:10 }}>
          {isPro ? 'Você é PRO!' : 'Confirmando pagamento' + dots}
        </h2>
        <p style={{ color:'var(--text2)', fontSize:14, marginBottom:24, lineHeight:1.6 }}>
          {isPro
            ? 'Todas as funcionalidades desbloqueadas. Redirecionando...'
            : 'Aguarde, estamos ativando sua conta PRO.'}
        </p>
        <button onClick={() => navigate('/app')} style={{
          padding:'12px 32px', background:'var(--accent)', border:'none',
          borderRadius:12, color:'#0f0f12', fontWeight:800, fontSize:14, cursor:'pointer' }}>
          Ir para o app
        </button>
      </div>
    </div>
  )
}
