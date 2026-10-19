import { createCheckoutSession, fromCentavos, toCentavos, verifySignature } from './paymongo.ts'

function equal(actual: unknown, expected: unknown) {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)
}
function rejectsValue(run: () => unknown) {
  let rejected = false
  try { run() } catch { rejected = true }
  equal(rejected, true)
}

Deno.test('provider money converts integer centavos exactly and refuses invalid currency/precision', () => {
  equal(toCentavos(5345.25), 534525)
  equal(fromCentavos(534525, 'PHP'), 5345.25)
  equal(toCentavos(0.29), 29)
  for (const value of [NaN, Infinity, -1, 0, 1.001, 0.001]) rejectsValue(() => toCentavos(value))
  for (const value of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) rejectsValue(() => fromCentavos(value, 'PHP'))
  rejectsValue(() => fromCentavos(100, 'USD'))
  rejectsValue(() => fromCentavos(100))
})

Deno.test('webhook signatures reject forged bodies, wrong secrets and malformed headers', async () => {
  const raw = '{"data":{"attributes":{"type":"checkout_session.payment.paid"}}}'
  const timestamp = '1800000000'
  const secret = 'fictional-local-webhook-secret'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`))
  const signature = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
  equal(await verifySignature(`t=${timestamp},te=${signature}`, raw, secret), true)
  equal(await verifySignature(`t=${timestamp},li=${signature}`, raw, secret), true)
  equal(await verifySignature(`t=${timestamp},te=${signature}`, raw + ' ', secret), false)
  equal(await verifySignature(`t=${timestamp},te=${signature}`, raw, 'wrong-secret'), false)
  for (const header of [null, '', 'bad', `te=${signature}`, `t=${timestamp},li=bad`]) {
    equal(await verifySignature(header, raw, secret), false)
  }
})

Deno.test('provider checkout retries carry the same idempotency key and integer-centavo amount', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = Deno.env.get('PAYMONGO_SECRET_KEY')
  const requests: { id: string | null; amount: number }[] = []
  try {
    Deno.env.set('PAYMONGO_SECRET_KEY', 'local-unit-test-placeholder')
    globalThis.fetch = (_url, init) => {
      const body = JSON.parse(String(init?.body))
      requests.push({ id: new Headers(init?.headers).get('Idempotency-Key'), amount: body.data.attributes.line_items[0].amount })
      return Promise.resolve(new Response(JSON.stringify({ data: { id: 'cs_fixture', attributes: { checkout_url: 'https://checkout.example/fixture' } } }), { status: 200 }))
    }
    const input = { amount: 5345.25, currency: 'PHP', name: 'Fixture bill', description: 'Fictional', reference: '1',
      successUrl: 'https://app.example/success', cancelUrl: 'https://app.example/cancel', metadata: { checkout_id: 'stable-checkout-fixture' } }
    await createCheckoutSession(input)
    await createCheckoutSession(input)
    equal(requests.length, 2)
    equal(requests[0].id, 'stable-checkout-fixture')
    equal(requests[1].id, requests[0].id)
    equal(requests[0].amount, 534525)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) Deno.env.delete('PAYMONGO_SECRET_KEY')
    else Deno.env.set('PAYMONGO_SECRET_KEY', originalKey)
  }
})
