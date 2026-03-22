const { MercadoPagoConfig, Preference } = require('mercadopago')

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { userId, email } = req.body
  if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' })

  const appUrl = process.env.VITE_APP_URL || 'http://localhost:3000'

  try {
    const preference = new Preference(client)
    const response = await preference.create({
      body: {
        items: [{
          id: 'planta-pro',
          title: 'Planta Pro — Acesso Vitalicio',
          description: 'Todas as funcionalidades PRO sem mensalidade.',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: 99.90,
        }],
        payer: { email },
        payment_methods: {
          excluded_payment_types: [],
        },
        back_urls: {
          success: appUrl + '/payment-success',
          failure: appUrl + '/pricing',
          pending: appUrl + '/payment-success',
        },
        auto_approve: true,
        auto_return: 'approved',
        external_reference: userId,
        notification_url: appUrl + '/api/mp-webhook',
      }
    })

    res.json({ url: response.init_point })
  } catch (err) {
    console.error('MP Checkout error:', err)
    res.status(500).json({ error: err.message })
  }
}
