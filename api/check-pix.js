const { MercadoPagoConfig, Payment } = require('mercadopago')
const { initializeApp, getApps, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

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

  const { paymentId, userId } = req.body
  if (!paymentId || !userId) return res.status(400).json({ error: 'Missing data' })

  try {
    const payment = new Payment(client)
    const info = await payment.get({ id: paymentId })

    if (info.status === 'approved') {
      await db.collection('users').doc(userId).update({
        plan: 'pro',
        mpPaymentId: String(info.id),
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      return res.json({ status: 'approved' })
    }

    res.json({ status: info.status })
  } catch (err) {
    console.error('Check PIX error:', err)
    res.status(500).json({ error: err.message })
  }
}
