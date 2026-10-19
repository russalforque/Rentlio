// PayMongo (https://developers.paymongo.com) for online payments: GCash, Maya,
// cards and QR Ph through a hosted checkout page. Only the server ever holds
// the secret key; the browser only sees the checkout URL.
import { env } from './auth.ts'
import { HttpError } from './http.ts'

const API = 'https://api.paymongo.com/v1'

export type PaymentMethod = 'gcash' | 'maya' | 'card' | 'bank_transfer' | 'other'

export interface CheckoutSession {
  id: string
  attributes: {
    checkout_url: string
    status: string
    payment_method_used?: string | null
    payments: Array<{
      id: string
      attributes: {
        amount: number
        currency: string
        status: string
        paid_at?: number | null
        source?: { type?: string } | null
      }
    }>
  }
}

/** Whether online payments are configured on this deployment. */
export function isConfigured(): boolean {
  return !!Deno.env.get('PAYMONGO_SECRET_KEY')
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${env('PAYMONGO_SECRET_KEY')}:`)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = payload?.errors?.[0]?.detail ?? `HTTP ${res.status}`
    console.error(`PayMongo ${method} ${path} failed:`, detail)
    throw new HttpError(502, 'The payment provider is not responding. Please try again in a moment.')
  }
  return payload.data as T
}

export function createCheckoutSession(input: {
  amount: number
  currency: string
  name: string
  description: string
  reference: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}): Promise<CheckoutSession> {
  return request<CheckoutSession>('POST', '/checkout_sessions', {
    data: {
      attributes: {
        line_items: [{ currency: input.currency, amount: toCentavos(input.amount), name: input.name, quantity: 1 }],
        payment_method_types: ['gcash', 'paymaya', 'card', 'qrph'],
        description: input.description,
        reference_number: input.reference,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        metadata: input.metadata,
      },
    },
  }, input.metadata.checkout_id)
}

export function getCheckoutSession(id: string): Promise<CheckoutSession> {
  if (!/^cs_[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, 'Invalid checkout session')
  return request<CheckoutSession>('GET', `/checkout_sessions/${id}`)
}

export async function expireCheckoutSession(id: string): Promise<void> {
  await request('POST', `/checkout_sessions/${id}/expire`)
}

/** Amounts are numeric(12,2) pesos in the database and integer centavos at PayMongo. */
export function toCentavos(amount: number): number {
  const centavos = Math.round(amount * 100)
  if (!Number.isFinite(amount) || !Number.isSafeInteger(centavos) || centavos <= 0
      || Math.abs(amount * 100 - centavos) > 0.000001) {
    throw new HttpError(400, 'Enter a positive amount with at most two decimal places.')
  }
  return centavos
}

export function fromCentavos(centavos: number, currency?: string): number {
  if (currency !== 'PHP' || !Number.isSafeInteger(centavos) || centavos <= 0) {
    throw new Error('The provider returned an invalid payment amount or currency')
  }
  return centavos / 100
}

export function methodFrom(type: string | null | undefined): PaymentMethod {
  switch (type) {
    case 'gcash':
      return 'gcash'
    case 'paymaya':
      return 'maya'
    case 'card':
      return 'card'
    case 'dob':
    case 'dob_ubp':
    case 'brankas_bdo':
    case 'brankas_landbank':
    case 'brankas_metrobank':
      return 'bank_transfer'
    default:
      return 'other'
  }
}

/**
 * Checks the Paymongo-Signature header ("t=<unix>,te=<test sig>,li=<live sig>"):
 * HMAC-SHA256 of "<t>.<raw body>" with the webhook's secret key.
 */
export async function verifySignature(header: string | null, rawBody: string, secret: string): Promise<boolean> {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=')
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    }),
  )
  const timestamp = parts.t
  const given = [parts.te, parts.li].filter((s): s is string => !!s)
  if (!timestamp || given.length === 0) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return given.some((sig) => timingSafeEqual(sig, expected))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
