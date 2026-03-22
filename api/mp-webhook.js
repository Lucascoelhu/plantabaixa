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

  try {
    const { type, data } = req.body

    if (type === 'payment') {
      const payment = new Payment(client)
      const info = await payment.get({ id: data.id })

      if (info.status === 'approved') {
        const uid = info.external_reference
        if (!uid) return res.json({ received: true })

        await db.collection('users').doc(uid).update({
          plan: 'pro',
          mpPaymentId: String(info.id),
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        console.log('User ' + uid + ' upgraded to PRO via MP')
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error('MP Webhook error:', err)
    res.status(500).json({ error: err.message })
  }
}
