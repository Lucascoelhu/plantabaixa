import { loadStripe } from '@stripe/stripe-js'

let stripePromise
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  return stripePromise
}

export async function createCheckoutSession(userId, email) {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, email }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error || 'Erro no checkout')
  }
  const { sessionId } = await res.json()
  const stripe = await getStripe()
  const { error } = await stripe.redirectToCheckout({ sessionId })
  if (error) throw new Error(error.message)
}
