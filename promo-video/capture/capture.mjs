import { chromium } from 'playwright-core'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import * as D from './data.mjs'
import { makeHandler, receiptSvg, setReceiptPng } from './mock.mjs'

// Screenshots the real Rentlio app with demo data. See ../README.md.
// Usage: node capture/capture.mjs <app dist folder> <output folder> [name prefix filter]
const DIST = process.argv[2]
const OUT = process.argv[3]
const ONLY = process.argv[4]
const BROWSER = process.env.CHROMIUM_PATH
mkdirSync(OUT, { recursive: true })
const APP = 'http://rentlio.app.test'
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessionFor(profile) {
  const exp = Math.floor(new Date('2027-10-08').getTime() / 1000)
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: profile.id, role: 'authenticated', exp, email: profile.email, aud: 'authenticated' })}.sig`
  return {
    access_token: token, refresh_token: 'demo-refresh', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: exp,
    user: { id: profile.id, aud: 'authenticated', role: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {}, created_at: profile.created_at },
  }
}

const browser = await chromium.launch(BROWSER ? { executablePath: BROWSER } : { channel: 'chrome' })
{
  const p = await browser.newPage({ viewport: { width: 720, height: 1280 } })
  await p.setContent(`<body style="margin:0">${receiptSvg()}</body>`)
  const png = await p.screenshot()
  setReceiptPng(png)
  writeFileSync(join(OUT, '../transfer-receipt.png'), png)
  await p.close()
}

async function newPage(profile, viewport, scale, theme = 'light') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, timezoneId: 'Asia/Manila', colorScheme: theme, locale: 'en-PH', isMobile: viewport.width < 600, hasTouch: viewport.width < 600 })
  await ctx.route(`${APP}/**`, (route) => {
    const p = new URL(route.request().url()).pathname
    const file = join(DIST, p)
    if (p !== '/' && existsSync(file)) return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(p)] ?? 'application/octet-stream' })
    return route.fulfill({ body: readFileSync(join(DIST, 'index.html')), contentType: 'text/html' })
  })
  await ctx.route('http://mock.supabase.test/**', makeHandler(profile.role, profile.id))
  const session = sessionFor(profile)
  await ctx.addInitScript(([s, theme]) => {
    localStorage.setItem('sb-mock-auth-token', JSON.stringify(s))
    localStorage.setItem('theme', theme)
    if (!crypto.randomUUID) crypto.randomUUID = () => '7d3c1a52-9f1e-4b8a-a1c2-3e4f5a6b7c8d'
  }, [session, theme])
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date('2026-10-08T10:24:00+08:00'))
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  return page
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
}

async function shot(page, name, opts = {}) {
  if (ONLY && !name.startsWith(ONLY)) return
  await settle(page)
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts })
  console.log('captured', name)
}

// Landlord, desktop ----------------------------------------------------------------
// Landlord, dark mode dashboard for variety
const dark = await newPage(D.landlord, { width: 1600, height: 1000 }, 2, 'dark')
await dark.goto(APP + '/dashboard'); await shot(dark, 'l-dashboard-dark')
const landlord = await newPage(D.landlord, { width: 1600, height: 1000 }, 2)
const go = async (path) => { await landlord.goto(APP + path); await settle(landlord) }

await go('/dashboard')
await shot(landlord, 'l-dashboard')
await shot(landlord, 'l-dashboard-full', { fullPage: true })
await go('/rooms'); await shot(landlord, 'l-rooms')
await go('/tenants'); await shot(landlord, 'l-tenants')
await go('/billing'); await shot(landlord, 'l-billing')
await go('/billing/readings'); await shot(landlord, 'l-readings')
const featuredBill = D.bills.find((b) => b.tenant_id === D.featuredTenant.tenantId && b.period === D.CURRENT)
await go(`/billing/bills/${featuredBill.id}`); await shot(landlord, 'l-bill')
await go('/payments'); await shot(landlord, 'l-payments')
// Open the review dialog for the first pending payment
const review = landlord.getByRole('button', { name: /review/i }).first()
if (await review.count()) {
  await review.click()
  await landlord.waitForTimeout(1500)
  await landlord.evaluate(() => document.activeElement?.blur())
  await shot(landlord, 'l-payments-review')
  await landlord.getByRole('button', { name: /verify payment/i }).click()
  await landlord.waitForTimeout(900)
  await shot(landlord, 'l-payments-verified')
  await go(`/billing/bills/${featuredBill.id}`); await shot(landlord, 'l-bill-paid')
} else console.log('no review button')
await go('/reports'); await shot(landlord, 'l-reports')
await shot(landlord, 'l-reports-full', { fullPage: true })


// Tenant, phone ---------------------------------------------------------------------
const tenantProfile = D.profiles.find((p) => p.id === D.featuredTenantPortal.tenantId)
const tenant = await newPage(tenantProfile, { width: 390, height: 844 }, 3)
await tenant.goto(APP + '/home'); await shot(tenant, 't-home')
await shot(tenant, 't-home-full', { fullPage: true })
const myBill = D.bills.find((b) => b.tenant_id === tenantProfile.id && b.period === D.CURRENT)
await tenant.goto(APP + `/my/bills/${myBill.id}`); await shot(tenant, 't-bill')
await tenant.goto(APP + '/home'); await settle(tenant)
const pay = tenant.getByRole('button', { name: /pay/i }).first()
if (await pay.count()) {
  await pay.click(); await tenant.waitForTimeout(1200)
  await shot(tenant, 't-pay')
  await tenant.evaluate(() => document.activeElement?.blur())
  await tenant.locator('input[type=file]').setInputFiles(join(OUT, '../transfer-receipt.png'))
  await tenant.getByLabel(/reference/i).fill('REF7734120')
  await tenant.waitForTimeout(500)
  await tenant.evaluate(() => document.activeElement?.blur())
  await shot(tenant, 't-pay-filled')
  await tenant.getByRole('button', { name: /submit payment/i }).click()
  await tenant.waitForTimeout(900)
  await shot(tenant, 't-home-sent')
} else console.log('no pay button')
await tenant.goto(APP + '/my/payments'); await shot(tenant, 't-payments')

// Sign-in page
const guestCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light' })
await guestCtx.route(`${APP}/**`, (route) => {
  const p = new URL(route.request().url()).pathname
  const file = join(DIST, p)
  if (p !== '/' && existsSync(file)) return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(p)] ?? 'application/octet-stream' })
  return route.fulfill({ body: readFileSync(join(DIST, 'index.html')), contentType: 'text/html' })
})
await guestCtx.route('http://mock.supabase.test/**', (r) => r.fulfill({ status: 401, body: '{}' }))
const guest = await guestCtx.newPage()
await guest.goto(APP + '/login'); await shot(guest, 'login')

await browser.close()
