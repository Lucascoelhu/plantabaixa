import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth({ children }) {
  const { firebaseUser, loading } = useAuth()
  if (loading) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#0f0f12', color:'#8888a0', fontFamily:'monospace', fontSize:13 }}>
      Carregando...
    </div>
  )
  if (!firebaseUser) return <Navigate to="/login" replace />
  return children
}

export function RedirectIfAuth({ children }) {
  const { firebaseUser, loading } = useAuth()
  if (loading) return null
  if (firebaseUser) return <Navigate to="/app" replace />
  return children
}
