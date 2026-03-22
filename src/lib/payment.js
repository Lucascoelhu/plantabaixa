export async function createCheckoutSession(userId, email) {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, email }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error || 'Erro ao iniciar pagamento')
  }
  const { url } = await res.json()
  window.location.href = url
}
