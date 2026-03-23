const { MercadoPagoConfig, Payment } = require('mercadopago')

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
})

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { userId, email, name } = req.body
  if (!userId || !email) return res.status(400).json({ error: 'Missing data' })

  try {
    const payment = new Payment(client)
    const response = await payment.create({
      body: {
        transaction_amount: 9.90,
        description: 'Planta Pro - Acesso Vitalicio',
        payment_method_id: 'pix',
        payer: {
          email,
          first_name: name || 'Usuario',
        },
        external_reference: userId,
        notification_url: (process.env.VITE_APP_URL || 'https://plantabaixa.vercel.app') + '/api/mp-webhook',
      }
    })

    res.json({
      id: response.id,
      qr_code: response.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
      status: response.status,
    })
  } catch (err) {
    console.error('PIX error:', err)
    res.status(500).json({ error: err.message })
  }
}
