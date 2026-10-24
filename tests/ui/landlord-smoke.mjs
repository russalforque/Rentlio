// Run against a local Vite server configured with the synthetic Supabase URL below.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation; no live data is used.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5186'
assert.equal(new URL(base).hostname, '127.0.0.1', 'QA must run locally')
const output = path.resolve('artifacts/landlord-qa')
await fs.mkdir(output, { recursive: true })
const today = '2026-10-20'
const period = '2026-10-01'
const now = `${today}T04:00:00Z`
const uid = '10000000-0000-4000-8000-000000000001'
const profile = { id: uid, user_id: uid, role: 'landlord', full_name: 'Alex Santos', email: 'landlord@example.test',
  is_active: true, suspended_at: null, avatar_path: null, phone: '09170000000', created_at: now }
const settings = { id: true, property_name: 'Rentlio Residences', property_address: 'Sample property address',
  currency_code: 'PHP', timezone: 'Asia/Manila', electricity_rate: 12.5, water_mode: 'flat', water_rate: 100,
  billing_day: 1, due_days: 7, auto_billing_enabled: true, rent_reminders_enabled: true,
  reminder_days_before: 3, reminder_on_due_date: true, reminder_days_after: 3,
  payment_instructions: 'Use the reference on your bill.', online_payments_enabled: false,
  contact_name: 'Alex Santos', contact_phone: '09170000000', contact_email: 'landlord@example.test', house_rules: 'Keep shared areas clean.' }
const rooms = Array.from({ length: 28 }, (_, index) => ({ id: `room-${index}`, room_number: String((index < 14 ? 101 : 201) + index % 14),
  floor: index < 14 ? 1 : 2, monthly_rent: 5000, lease_rent: index < 24 ? 5000 : null, capacity: 2,
  occupancy: index < 24 ? 'occupied' : index === 27 ? 'maintenance' : 'vacant',
  tenant_id: index < 24 ? `tenant-${index}` : null, tenant_name: index < 24 ? `Sample Tenant ${index + 1}` : null,
  lease_id: index < 24 ? `lease-${index}` : null, lease_start_date: '2026-01-05',
  outstanding_balance: index < 8 ? 5500 : 0, electricity_meters: ['aircon', 'outlet', 'light'], description: 'Sample room' }))
const tenants = rooms.slice(0, 24).map((room, index) => ({ ...profile, id: `tenant-${index}`, user_id: null,
  role: 'tenant', full_name: room.tenant_name, email: `tenant${index}@example.test`,
  account_status: index === 23 ? 'no_portal' : 'active', room_number: room.room_number, room_id: room.id,
  lease_id: room.lease_id, lease_start_date: room.lease_start_date, lease_rent: 5000, outstanding_balance: room.outstanding_balance,
  deposit_balance: 5000, has_portal_access: index !== 23, invited_at: null }))
const bills = tenants.map((tenant, index) => ({ id: `bill-${index}`, tenant_id: tenant.id, tenant_name: tenant.full_name,
  lease_id: tenant.lease_id, room_id: tenant.room_id, room_number: tenant.room_number, bill_number: index + 1, period,
  issue_date: '2026-10-01', due_date: '2026-10-10', total_amount: 5500, balance: index < 8 ? 5500 : 0,
  amount_paid: index < 8 ? 0 : 5500, status: index < 8 ? 'unpaid' : 'paid', is_overdue: index < 8,
  is_finalized: true, finalized_at: '2026-10-01T01:00:00Z', revision: 1, missing_charges: [], pending_payments: index === 0 ? 1 : 0,
  pending_amount: index === 0 ? 1000 : 0, rent_amount: 5000, electricity_amount: 400, water_amount: 100, other_amount: 0,
  rent_paid: index < 8 ? 0 : 5000, electricity_paid: index < 8 ? 0 : 400, water_paid: index < 8 ? 0 : 100, other_paid: 0 }))
const payments = [{ id: 'payment-pending', bill_id: 'bill-0', tenant_id: 'tenant-0', tenant_name: tenants[0].full_name,
  room_number: '101', period, status: 'pending', amount: 1000, method: 'gcash', paid_on: today, created_at: now,
  proof_path: null, reference_number: 'SYNTHETIC-1000', bill_balance: 5500 },
  { id: 'payment-verified', bill_id: 'bill-9', tenant_id: 'tenant-9', tenant_name: tenants[9].full_name,
    room_number: rooms[9].room_number, period, status: 'verified', amount: 5500, method: 'cash', paid_on: today,
    created_at: now, reviewed_at: now, proof_path: null }]
const transactions = [
  ...Array.from({ length: 28 }, (_, index) => ({ id: `cash-${index}`, amount: 5500, category: 'Rental Income',
    description: `Sample collection ${index + 1}`, payment_id: `sample-payment-${index}`, room_number: rooms[index].room_number,
    source: 'payment', tenant_name: `Sample Tenant ${index + 1}`, transaction_date: today, created_at: now,
    transaction_type: 'income', method: 'cash', receipt_path: null, room_id: rooms[index].id, tenant_id: `tenant-${index}` })),
  { id: 'expense-1', amount: 1234.56, category: 'Maintenance', description: 'Replacement plumbing supplies and maintenance for the shared kitchen',
    payment_id: null, room_number: null, source: 'manual', tenant_name: null, transaction_date: today, created_at: now,
    transaction_type: 'expense', method: 'cash', receipt_path: null, room_id: null, tenant_id: null },
]
const readings = rooms.map((room) => ({ room_id: room.id, room_number: room.room_number, tenant_name: room.tenant_name,
  is_billable: room.occupancy === 'occupied', reading_id: null, bill_finalized: false, electricity_meters: room.electricity_meters,
  aircon_previous: 100, aircon_current: null, aircon_event: 'normal', aircon_reset: false,
  outlet_previous: 200, outlet_current: null, outlet_event: 'normal', outlet_reset: false,
  light_previous: 300, light_current: null, light_event: 'normal', light_reset: false }))
const registration = { id: 'request-1', full_name: 'Sample Applicant', email: 'applicant@example.test',
  phone: '09170000000', requested_room: '202', status: 'pending', email_verified_at: now, created_at: now }

const data = { profiles: [profile], app_settings: [settings], room_overview: rooms, rooms, tenant_overview: tenants,
  bill_overview: bills, payment_overview: payments, financial_transaction_overview: transactions,
  daily_cash_adjustments: [], daily_cash_openings: [], financial_categories: [], bed_types: [], room_beds: [],
  billing_runs: [], water_rate_schedule: [], notification_preferences: [], notifications: [],
  registration_requests: [registration], bill_due_date_audit: [], landlord_payment_accounts: [],
  deposit_transactions: [], account_audit_log: [], lease_occupant_audit: [], payment_allocations: [],
  leases: tenants.map((tenant) => ({ id: tenant.lease_id, tenant_id: tenant.id, room_id: tenant.room_id, start_date: tenant.lease_start_date,
    monthly_rent: 5000, status: 'active', occupant_count: 1, rooms: { room_number: tenant.room_number, capacity: 2 } })),
  bill_items: [
    { id: 'item-rent', bill_id: 'bill-0', kind: 'rent', description: 'Monthly rent', amount: 5000, quantity: 1, unit_price: 5000 },
    { id: 'item-electric', bill_id: 'bill-0', kind: 'electricity', description: 'Electricity', amount: 400, quantity: 32, unit_price: 12.5 },
    { id: 'item-water', bill_id: 'bill-0', kind: 'water', description: 'Water', amount: 100, quantity: 1, unit_price: 100 },
  ] }
let scenario = 'populated'
let writes = []
let unknown = new Set()
const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
// Every external request is mocked or blocked, including websocket connections.
await context.routeWebSocket('**/*', (socket) => socket.close())
await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.origin === new URL(base).origin) return route.continue()
  if (url.origin !== 'http://127.0.0.1:54321') { unknown.add(url.origin); return route.abort() }
  const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
  const resource = url.pathname.split('/').at(-1)
  let rows = data[resource]
  if (url.pathname.includes('/rpc/')) {
    if (resource === 'meter_reading_sheet') rows = readings
    else if (resource === 'payment_receipt') return route.fulfill({ headers, body: JSON.stringify({
      receipt_number: 1, payment: { id: 'sample', amount: 5500, method: 'cash', paid_on: today, reference_number: null,
        provider: null, verified_at: now, recorded_by_landlord: true }, bill: bills[9], tenant_name: tenants[9].full_name,
      room_number: rooms[9].room_number, property: { name: settings.property_name, address: settings.property_address,
        currency_code: 'PHP', contact_name: profile.full_name, contact_phone: profile.phone, contact_email: profile.email },
      lines: [{ kind: 'rent', description: 'Monthly rent', amount: 5000, applied: 5000, remaining: 0, paid_before: 0 },
        { kind: 'electricity', description: 'Electricity', amount: 400, applied: 400, remaining: 0, paid_before: 0 },
        { kind: 'water', description: 'Water', amount: 100, applied: 100, remaining: 0, paid_before: 0 }],
      balance_before: 5500, balance_after: 0,
    }) })
    else if (resource === 'get_demo_data_summary') rows = []
    else if (request.method() === 'POST') {
      // Fail closed on unexpected mutations; successful tests explicitly allow only the payment RPC.
      if (resource === 'record_payment') { writes.push({ resource, body: request.postDataJSON() }); return route.fulfill({ headers, body: JSON.stringify('sample-recorded-payment') }) }
      rows = []
    }
  } else if (!['GET', 'HEAD'].includes(request.method())) {
    writes.push({ resource, body: request.postDataJSON() })
    return route.fulfill({ status: 400, headers, body: JSON.stringify({ message: 'Synthetic QA blocks this write' }) })
  }
  if (scenario === 'error' && !['profiles', 'app_settings'].includes(resource)) return route.fulfill({ status: 500, headers, body: JSON.stringify({ message: 'Synthetic connection failure' }) })
  if (!rows) { unknown.add(resource); rows = [] }
  rows = structuredClone(rows)
  if (scenario === 'empty' && !['profiles', 'app_settings'].includes(resource)) rows = []
  for (const [field, expression] of url.searchParams) {
    if (expression.startsWith('eq.')) rows = rows.filter((row) => String(row[field]) === expression.slice(3))
    else if (expression.startsWith('neq.')) rows = rows.filter((row) => String(row[field]) !== expression.slice(4))
    else if (expression.startsWith('lt.')) rows = rows.filter((row) => String(row[field]) < expression.slice(3))
    else if (expression.startsWith('in.(')) rows = rows.filter((row) => expression.slice(4, -1).split(',').includes(String(row[field])))
  }
  headers['content-range'] = rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0'
  const body = request.headers().accept?.includes('application/vnd.pgrst.object') ? rows[0] ?? null : rows
  return route.fulfill({ headers, body: request.method() === 'HEAD' ? '' : JSON.stringify(body) })
})
await context.addInitScript(({ profile, uid }) => {
  const payload = btoa(JSON.stringify({ sub: uid, exp: 9999999999, role: 'authenticated' }))
  localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`,
    refresh_token: 'synthetic', expires_at: 9999999999, expires_in: 999999, token_type: 'bearer',
    user: { id: uid, aud: 'authenticated', role: 'authenticated', email: profile.email } }))
}, { profile, uid })
const page = await context.newPage()
await page.clock.install({ time: new Date(now) })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const checks = []
async function checkLayout(label) {
  const result = await page.evaluate(() => ({ width: globalThis.innerWidth, scroll: globalThis.document.documentElement.scrollWidth,
    overflow: [...globalThis.document.querySelectorAll('main *, [role="dialog"] *')].filter((el) => {
      const rect = el.getBoundingClientRect()
      const style = globalThis.getComputedStyle(el)
      if (rect.width === 0 || style.position === 'fixed' || style.position === 'absolute') return false
      if (el.closest('[data-slot="table-container"], .workspace-filter, .overflow-x-auto')) return false
      return rect.right > globalThis.innerWidth + 2 || rect.left < -2
    }).map((el) => `${el.tagName}.${el.className}`).slice(0, 8) }))
  assert.ok(result.scroll <= result.width + 1, `${label}: horizontal overflow ${JSON.stringify(result)}`)
  assert.equal(result.overflow.length, 0, `${label}: clipped content ${result.overflow.join(', ')}`)
  checks.push({ label, ...result })
}
const routes = ['/dashboard', '/rooms', '/tenants', '/tenants/tenant-0', '/registrations', '/billing',
  '/billing/readings', '/billing/bills/bill-0', '/payments', '/payments?tab=history', '/finances', '/reports', '/settings', '/account', '/notifications', '/receipts/sample']
try {
  for (const width of (process.env.QA_WIDTHS ?? '320,375,430,768,1024,1440,1920').split(',').map(Number)) {
    await page.setViewportSize({ width, height: width < 768 ? 900 : 1080 })
    for (const route of routes) {
      console.log(`Checking ${width} ${route}`)
      await page.goto(base + route)
      await page.locator('h1, h2, h3, [data-slot="card-title"], [role="alert"]').first().waitFor()
      await page.waitForTimeout(180)
      assert.ok(!(await page.getByText('Unexpected Application Error').count()), `Route crashed: ${route}`)
      await checkLayout(`${width} ${route}`)
    }
    await page.goto(base + '/dashboard')
    await page.getByText("Today's cash", { exact: true }).waitFor()
    if ([375, 768, 1440].includes(width)) await page.screenshot({ path: path.join(output, `dashboard-${width}.png`), fullPage: true })
  }
  // Payment selection and remaining-balance preview, without a real transaction.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(base + '/payments')
  await page.getByRole('button', { name: 'Record payment', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search unpaid bills' }).fill('102')
  await page.getByRole('button', { name: /102 Sample Tenant 2/ }).click()
  await page.getByLabel('Amount', { exact: true }).fill('2500')
  await page.getByText('Balance after this payment:').waitFor()
  await checkLayout('375 record payment dialog')
  await page.screenshot({ path: path.join(output, 'record-payment-375.png'), fullPage: true })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('heading', { name: 'Discard unsaved changes?' }).waitFor()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()

  // Add/edit forms: focus, validation and dismissal remain usable as mobile sheets and desktop dialogs.
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(base + '/rooms')
    await page.getByRole('button', { name: 'Add room', exact: true }).click()
    await page.getByLabel('Room number', { exact: true }).waitFor()
    await checkLayout(`${width} add room`)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.goto(base + '/tenants')
    await page.getByRole('button', { name: 'Add tenant', exact: true }).click()
    await page.getByLabel('Full name', { exact: true }).fill('Fictional Test Tenant')
    await checkLayout(`${width} add tenant`)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await page.goto(base + '/finances')
    await page.getByRole('button', { name: 'Add expense', exact: true }).click()
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Check the required fields' }).waitFor()
    await page.getByLabel('Amount', { exact: true }).fill('250.50')
    await checkLayout(`${width} add expense validation`)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(base + '/billing/readings')
  const currentReading = page.getByLabel('Current reading', { exact: true }).first()
  await currentReading.fill('90')
  await page.getByText('Current cumulative reading is below the previous value.', { exact: false }).waitFor()
  await checkLayout('375 lower meter reading review')
  const dismissed = page.waitForEvent('dialog').then((dialog) => dialog.dismiss())
  await page.locator('nav[aria-label="Main"] a[href="/payments"]:visible').click()
  await dismissed
  await page.waitForTimeout(100)
  assert.ok(page.url().includes('/billing/readings'), 'Cancelled navigation must keep the reading draft')
  const accepted = page.waitForEvent('dialog').then((dialog) => dialog.accept())
  await page.locator('nav[aria-label="Main"] a[href="/payments"]:visible').click()
  await accepted
  await page.waitForURL('**/payments')

  await page.evaluate(() => { globalThis.localStorage.setItem('theme', 'dark') })
  await page.goto(base + '/dashboard')
  await page.getByText("Today's cash", { exact: true }).waitFor()
  await checkLayout('375 dark dashboard')
  await page.screenshot({ path: path.join(output, 'dashboard-dark-375.png'), fullPage: true })
  await page.evaluate(() => { globalThis.localStorage.setItem('theme', 'light') })

  // Empty and error screens exercise the same routes using only mocked responses.
  for (const state of ['empty', 'error']) {
    scenario = state
    for (const route of ['/dashboard', '/rooms', '/tenants', '/billing', '/payments', '/finances', '/reports', '/registrations']) {
      await page.goto(base + route)
      await page.waitForTimeout(state === 'error' ? 1800 : 250)
      await checkLayout(`${state} ${route}`)
    }
  }
  scenario = 'populated'
  await page.goto(base + '/reports')
  await page.getByRole('button', { name: 'Daily cash report', exact: true }).click()
  await page.getByRole('heading', { name: /Income entries/ }).waitFor()
  await checkLayout('375 daily report dialog')
  await page.screenshot({ path: path.join(output, 'daily-report-375.png'), fullPage: true })
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PNG' }).click()
  const download = await downloadEvent
  await download.saveAs(path.join(output, 'daily-cash-report.png'))
  // Shared primitives must leave tenant styling and the established four bottom tabs intact.
  data.profiles[0].role = 'tenant'
  await page.goto(base + '/my/payments')
  await page.getByRole('heading', { name: 'Payment history', exact: true }).waitFor()
  assert.equal(await page.locator('.landlord-portal').count(), 0)
  assert.equal(await page.locator('.tenant-portal').count(), 1)
  const tenantTabs = await page.locator('nav[aria-label="Main"]:visible a').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))
  assert.deepEqual(tenantTabs, ['/home', '/my/bills', '/my/pay-online', '/my/room'])
  await checkLayout('375 tenant payment history regression')
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`)
  assert.equal(writes.length, 0, 'Smoke checks must not submit transactions')
  assert.equal(unknown.size, 0, `Unmocked endpoints: ${[...unknown].join(', ')}`)
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors, writes, unknown: [...unknown] }, null, 2))
  console.log(`Passed ${checks.length} responsive checks, payment selection, form validation, unsaved-change protection, dark mode, and report image download.`)
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
  console.error({ url: page.url(), text: (await page.locator('body').innerText()).slice(0, 2000), errors, unknown: [...unknown] })
  throw error
} finally {
  await browser.close()
}
