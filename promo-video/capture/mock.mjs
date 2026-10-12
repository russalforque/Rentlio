import * as D from './data.mjs'

let receiptPng = null
export const setReceiptPng = (buf) => { receiptPng = buf }

const tables = {
  profiles: D.profiles, app_settings: [D.settings], room_overview: D.rooms, rooms: D.rooms, tenant_overview: D.tenantOverview,
  bill_overview: D.bills, bill_items: D.billItems, payment_overview: D.payments, billing_runs: D.billingRuns,
  bed_types: D.bedTypes, room_beds: D.roomBeds, deposit_balances: D.depositBalances, leases: D.leases,
  deposit_transactions: [], tenant_documents: [],
}

const parseValue = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v)
const cmp = (a, b) => {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function applyFilter(rows, col, expr) {
  const negate = expr.startsWith('not.')
  if (negate) expr = expr.slice(4)
  const dot = expr.indexOf('.')
  const op = expr.slice(0, dot)
  const raw = expr.slice(dot + 1)
  const test = (row) => {
    const v = row[col]
    switch (op) {
      case 'eq': return String(v) === raw
      case 'neq': return String(v) !== raw
      case 'gt': return cmp(v, isNaN(raw) ? raw : Number(raw)) > 0
      case 'gte': return cmp(v, isNaN(raw) ? raw : Number(raw)) >= 0
      case 'lt': return cmp(v, isNaN(raw) ? raw : Number(raw)) < 0
      case 'lte': return cmp(v, isNaN(raw) ? raw : Number(raw)) <= 0
      case 'is': return v === parseValue(raw) || (raw === 'null' && v === undefined)
      case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v))
      case 'ilike': return String(v ?? '').toLowerCase().includes(raw.replace(/\*/g, '').toLowerCase())
      default: return true
    }
  }
  return rows.filter((r) => (negate ? !test(r) : test(r)))
}

export function makeHandler(role, userId) {
  const scope = (name, rows) => {
    if (role !== 'tenant') return rows
    if (name === 'profiles') return rows.filter((r) => r.id === userId)
    if (['bill_overview', 'payment_overview', 'leases', 'deposit_balances', 'tenant_overview'].includes(name))
      return rows.filter((r) => (r.tenant_id ?? r.id) === userId)
    if (name === 'bill_items') {
      const mine = new Set(D.bills.filter((b) => b.tenant_id === userId).map((b) => b.id))
      return rows.filter((r) => mine.has(r.bill_id))
    }
    return rows
  }

  return async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const json = (body, status = 200, headers = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) })

    if (req.method() === 'OPTIONS') return json({})

    if (path.startsWith('/auth/v1/')) {
      const user = D.profiles.find((p) => p.id === userId)
      return json({ id: userId, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: user.created_at })
    }

    if (path.startsWith('/storage/v1/object/sign/') && req.method() === 'POST') {
      const rest = path.replace('/storage/v1/object/sign/', '')
      return json({ signedURL: `/object/sign/${rest}?token=demo` })
    }
    if (path.startsWith('/storage/v1/object/') && req.method() === 'POST') {
      return json({ Key: path.replace('/storage/v1/object/', ''), Id: 'upload-1' })
    }
    if (path.startsWith('/storage/v1/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: receiptPng })
    }

    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()
      const body = req.postDataJSON?.() ?? {}
      if (fn === 'meter_reading_sheet') return json(D.readingSheet(body.p_period ?? url.searchParams.get('p_period')))
      if (fn === 'property_today') return json(D.TODAY)
      if (fn === 'review_payment') {
        const p = D.payments.find((x) => x.id === body.p_payment_id)
        const bill = D.bills.find((b) => b.id === p.bill_id)
        Object.assign(p, { status: 'verified', reviewed_at: '2026-10-08T10:25:00+08:00', reviewed_by: userId })
        bill.amount_paid += p.amount
        bill.balance = bill.total_amount - bill.amount_paid
        bill.status = bill.balance <= 0 ? 'paid' : 'partial'
        bill.pending_payments = 0
        bill.pending_amount = 0
        Object.assign(p, { bill_status: bill.status, bill_balance: bill.balance })
        const room = D.rooms.find((r) => r.id === bill.room_id)
        room.outstanding_balance = Math.max(0, room.outstanding_balance - p.amount)
        return json(null)
      }
      if (fn === 'submit_payment') {
        const bill = D.bills.find((b) => b.id === body.p_bill_id)
        bill.pending_payments = 1
        bill.pending_amount = body.p_amount
        D.payments.push({
          id: '99999999-0000-4000-8000-000000000001', bill_id: bill.id, bill_number: bill.bill_number, period: bill.period,
          room_number: bill.room_number, tenant_id: bill.tenant_id, tenant_name: bill.tenant_name, amount: body.p_amount,
          method: body.p_method, paid_on: body.p_paid_on, status: 'pending', reference_number: body.p_reference_number,
          proof_path: body.p_proof_path, recorded_by_landlord: false, notes: null, rejection_reason: null,
          submitted_by: userId, reviewed_by: null, reviewed_at: null, created_at: '2026-10-08T10:24:00+08:00',
          bill_status: bill.status, bill_balance: bill.balance,
        })
        return json('99999999-0000-4000-8000-000000000001')
      }
      return json(null)
    }

    const name = path.replace('/rest/v1/', '')
    let rows = scope(name, tables[name] ?? [])
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return json(rows.slice(0, 1))
    for (const [key, value] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue
      if (key === 'or' || key === 'and') continue
      rows = applyFilter(rows, key, value)
    }
    const order = url.searchParams.get('order')
    if (order) {
      const keys = order.split(',').map((o) => o.split('.'))
      rows = [...rows].sort((a, b) => {
        for (const [col, dir] of keys) {
          const c = cmp(a[col], b[col])
          if (c) return dir === 'desc' ? -c : c
        }
        return 0
      })
    }
    const limit = url.searchParams.get('limit')
    if (limit) rows = rows.slice(0, Number(limit))
    const headers = { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` }
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
      if (rows.length !== 1) return json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null }, 406)
      return json(rows[0], 200, headers)
    }
    return json(rows, 200, headers)
  }
}

export function receiptSvg() {
  const pay = D.payments.find((p) => p.status === 'pending')
  const amount = `₱${pay.amount.toLocaleString('en-US')}.00`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#eef2f7"/>
  <rect x="40" y="80" width="640" height="1120" rx="36" fill="#ffffff"/>
  <circle cx="360" cy="230" r="70" fill="#1f9d5a"/>
  <path d="M325 232l25 25 48-52" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="360" y="370" font-family="Arial, sans-serif" font-size="34" fill="#475569" text-anchor="middle">Transfer successful</text>
  <text x="360" y="450" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#0f172a" text-anchor="middle">${amount}</text>
  <line x1="90" y1="520" x2="630" y2="520" stroke="#e2e8f0" stroke-width="3"/>
  ${[['Sent to', 'A. Dela Cruz'], ['Account', '0917 ••• 0128'], ['Reference', pay.reference_number ?? 'REF0000'], ['Date', pay.paid_on], ['Note', `Room ${pay.room_number} rent`]]
    .map(([k, v], i) => `<text x="90" y="${600 + i * 90}" font-family="Arial, sans-serif" font-size="30" fill="#64748b">${k}</text><text x="630" y="${600 + i * 90}" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#0f172a" text-anchor="end">${v}</text>`).join('')}
</svg>`
}
