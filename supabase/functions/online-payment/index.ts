// POST /functions/v1/online-payment
// Tenant-only. Opens a hosted checkout at the payment provider for one bill.
//   { action: 'start', bill_id, amount }  -> { checkout_url }
//   { action: 'cancel', checkout_id }     -> { status }
//
// The database decides everything about money (start_online_payment runs as
// the tenant: own finalized bill, amount within the balance, one checkout per
// bill). This function only talks to the provider. The payment itself is
// recorded later by paymongo-webhook, never from the browser's return trip.
import { z } from 'zod'
import { dbError, requireUser } from '../_shared/auth.ts'
import { HttpError, json, readJson, serve } from '../_shared/http.ts'
import { createCheckoutSession, expireCheckoutSession, isConfigured } from '../_shared/paymongo.ts'

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    bill_id: z.uuid(),
    amount: z.number().positive().max(9_999_999_999).multipleOf(0.01),
  }),
  z.object({ action: z.literal('cancel'), checkout_id: z.uuid() }),
])

interface Checkout {
  id: string
  bill_id: string
  amount: number
  currency_code: string
  status: string
  provider_session_id: string | null
  checkout_url: string | null
}

/** Where the provider sends the tenant back after checkout. */
function appUrl(): string {
  const configured = Deno.env.get('APP_URL')
  if (configured) return configured.replace(/\/+$/, '')
  throw new HttpError(500, 'APP_URL is not configured')
}

serve(async (req) => {
  if (!isConfigured()) throw new HttpError(503, 'Online payments are not set up yet. Pay in person or upload proof of a transfer.')
  const { userClient, admin } = await requireUser(req)

  const parsed = bodySchema.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request')
  const body = parsed.data

  if (body.action === 'cancel') {
    const { data, error } = await userClient.rpc('cancel_online_payment', { p_checkout_id: body.checkout_id })
    if (error) throw dbError(error)
    const checkout = data as Checkout
    if (checkout.status === 'cancelled' && checkout.provider_session_id) {
      // Best effort: if it was already paid, the webhook still records it.
      await expireCheckoutSession(checkout.provider_session_id).catch((err) => console.warn('Expire failed:', err))
    }
    return json({ status: checkout.status })
  }

  const { data, error } = await userClient.rpc('start_online_payment', { p_bill_id: body.bill_id, p_amount: body.amount })
  if (error) throw dbError(error)
  const checkout = data as Checkout
  if (checkout.status === 'open' && checkout.checkout_url) return json({ checkout_url: checkout.checkout_url })
  if (checkout.currency_code !== 'PHP') throw new HttpError(400, 'Online payments are only available for bills in PHP.')

  const { data: bill, error: billError } = await userClient
    .from('bill_overview')
    .select('bill_number, period, room_number, balance')
    .eq('id', checkout.bill_id)
    .single()
  if (billError) throw dbError(billError)

  const month = new Date(`${bill.period}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const partial = checkout.amount < bill.balance
  const base = appUrl()
  let session
  try {
    session = await createCheckoutSession({
      amount: checkout.amount,
      currency: checkout.currency_code,
      name: `${month} bill #${bill.bill_number}${partial ? ' (partial payment)' : ''}`,
      description: `Room ${bill.room_number} · rent and utilities for ${month}`,
      reference: String(bill.bill_number),
      successUrl: `${base}/my/bills/${checkout.bill_id}?checkout=success`,
      cancelUrl: `${base}/my/bills/${checkout.bill_id}?checkout=cancelled&ref=${checkout.id}`,
      metadata: { checkout_id: checkout.id, bill_id: checkout.bill_id },
    })
  } catch (err) {
    await admin.rpc('_fail_checkout', { p_checkout_id: checkout.id, p_reason: String(err instanceof Error ? err.message : err) })
    throw err
  }

  const { data: opened, error: attachError } = await admin.rpc('_attach_checkout_session', {
    p_checkout_id: checkout.id,
    p_session_id: session.id,
    p_url: session.attributes.checkout_url,
  })
  if (attachError) throw dbError(attachError)
  const url = (opened as Checkout).checkout_url
  if (!url) throw new HttpError(409, 'This checkout is no longer available. Please start again.')
  return json({ checkout_url: url })
})
