// POST /functions/v1/paymongo-webhook
// Called by PayMongo, not by users. Records online payments as verified.
//
// Trust chain: the request must carry a valid Paymongo-Signature for our
// webhook secret, and even then the payload is not used for money: the
// checkout session is fetched again from PayMongo's API with our secret key
// and only payments PayMongo reports as "paid" are recorded. Recording is
// idempotent on PayMongo's payment id, so retried or replayed deliveries are
// harmless. Answering 5xx makes PayMongo retry later.
import { adminClient, env } from '../_shared/auth.ts'
import { json } from '../_shared/http.ts'
import { fromCentavos, getCheckoutSession, methodFrom, verifySignature } from '../_shared/paymongo.ts'

const HANDLED = new Set(['checkout_session.payment.paid'])

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const raw = await req.text()
  if (!(await verifySignature(req.headers.get('Paymongo-Signature'), raw, env('PAYMONGO_WEBHOOK_SECRET')))) {
    return json({ error: 'Invalid signature' }, 401)
  }

  let event: { data?: { attributes?: { type?: string; data?: { id?: string } } } }
  try {
    event = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const type = event.data?.attributes?.type ?? ''
  const sessionId = event.data?.attributes?.data?.id
  if (!HANDLED.has(type) || !sessionId) return json({ ignored: type })

  try {
    const session = await getCheckoutSession(sessionId)
    const admin = adminClient()
    const { data: settings } = await admin.from('app_settings').select('timezone').single()
    const timeZone = settings?.timezone ?? 'Asia/Manila'

    const recorded: string[] = []
    for (const payment of session.attributes.payments ?? []) {
      if (payment.attributes.status !== 'paid') continue
      const paidAt = payment.attributes.paid_at ? new Date(payment.attributes.paid_at * 1000) : new Date()
      const { data, error } = await admin.rpc('_confirm_provider_payment', {
        p_provider: 'paymongo',
        p_session_id: session.id,
        p_provider_payment_id: payment.id,
        p_amount: fromCentavos(payment.attributes.amount),
        p_method: methodFrom(payment.attributes.source?.type ?? session.attributes.payment_method_used),
        // en-CA formats as YYYY-MM-DD.
        p_paid_on: paidAt.toLocaleDateString('en-CA', { timeZone }),
      })
      if (error) {
        // Not one of ours (another app on the same PayMongo account): acknowledge and move on.
        if (error.code === 'P0002') return json({ ignored: 'unknown checkout session' })
        throw error
      }
      recorded.push(data as string)
    }
    return json({ recorded })
  } catch (err) {
    console.error('paymongo-webhook failed:', err)
    return json({ error: 'Could not record the payment; please retry' }, 500)
  }
})
