import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { RequireAuth, RedirectIfAuth } from './components/Guards'
import LoginPage          from './pages/LoginPage'
import AppPage            from './pages/AppPage'
import PricingPage        from './pages/PricingPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import './styles/global.css'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
          <Route path="/app"   element={<RequireAuth><AppPage /></RequireAuth>} />
          <Route path="/pricing" element={<RequireAuth><PricingPage /></RequireAuth>} />
          <Route path="/payment-success" element={<RequireAuth><PaymentSuccessPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
