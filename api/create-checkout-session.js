const Stripe = require('stripe')
const { initializeApp, getApps, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const db = getFirestore()

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { userId, email } = req.body
  if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' })

  try {
    const userRef  = db.collection('users').doc(userId)
    const userSnap = await userRef.get()
    let customerId = userSnap.data()?.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { firebaseUid: userId } })
      customerId = customer.id
      await userRef.update({ stripeCustomerId: customerId })
    }

    const appUrl = process.env.VITE_APP_URL || 'http://localhost:5173'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          unit_amount: 9990,
          product_data: {
            name: 'Planta Pro — Acesso Vitalício',
            description: 'Todas as funcionalidades PRO sem mensalidade.',
          },
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/pricing`,
      metadata: { firebaseUid: userId },
      payment_intent_data: { metadata: { firebaseUid: userId } },
    })

    res.json({ sessionId: session.id })
  } catch (err) {
    console.error('Checkout error:', err)
    res.status(500).json({ error: err.message })
  }
}
