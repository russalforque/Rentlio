// Local-only regression coverage. All Supabase requests are synthetic; no email is sent.
// Start Vite with VITE_SUPABASE_URL=http://127.0.0.1:54321 and a synthetic publishable key.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5186'
assert.equal(new URL(base).hostname, '127.0.0.1', 'QA must run locally')
const output = path.resolve('artifacts/auth-qa')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}) })
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'tenant@example.test', aud: 'authenticated', role: 'authenticated',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' }
const profile = { id: user.id, user_id: user.id, role: 'tenant', full_name: 'Sample Tenant', email: user.email, is_active: true, suspended_at: null }
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`
const session = { access_token: accessToken, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user }
const hash = `#access_token=${accessToken}&refresh_token=synthetic-refresh&token_type=bearer&expires_in=3600&type=recovery`
const failures = []
const results = []

async function setup(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce', ...options })
  context.setDefaultTimeout(10_000)
  const state = { recover: [], updates: [], verifications: [], mode: 'success', release: null }
  await context.routeWebSocket('**/*', (socket) => socket.close())
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(base).origin) return route.continue()
    if (url.origin !== 'http://127.0.0.1:54321') { failures.push(`Unexpected external request: ${url.origin}`); return route.abort() }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-expose-headers': 'x-supabase-api-version', 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (url.pathname === '/auth/v1/recover') {
      state.recover.push({ body: request.postDataJSON(), redirect: url.searchParams.get('redirect_to') })
      if (state.mode === 'hold') await new Promise(resolve => { state.release = resolve })
      if (state.mode === 'rate-limit') return route.fulfill({ status: 429, headers, body: JSON.stringify({ code: 'over_email_send_rate_limit', msg: 'Rate limit exceeded' }) })
      return route.fulfill({ headers, body: '{}' })
    }
    if (url.pathname === '/auth/v1/verify') {
      state.verifications.push(request.postDataJSON())
      if (url.searchParams.has('invalid') || request.postDataJSON().token_hash === 'expired') return route.fulfill({ status: 403, headers, body: JSON.stringify({ code: 'otp_expired', msg: 'Expired link' }) })
      return route.fulfill({ headers, body: JSON.stringify(session) })
    }
    if (url.pathname === '/auth/v1/user') {
      if (request.method() === 'PUT') state.updates.push(request.postDataJSON())
      return route.fulfill({ headers, body: JSON.stringify(user) })
    }
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ headers, body: JSON.stringify(profile) })
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ headers, body: '[]' })
    failures.push(`Unexpected Supabase request: ${request.method()} ${url.pathname}`)
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (/Encountered a script tag|apple-mobile-web-app-capable.*deprecated/.test(message.text())) failures.push(message.text())
  })
  return { context, page, state }
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true, 'Page must not overflow horizontally')
}

try {
  const { context, page, state } = await setup()
  await page.clock.install()
  await page.goto(`${base}/login`)
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByRole('heading', { name: 'Forgot password?', exact: true }).waitFor()
  assert.equal(await page.locator('.auth-entry').count(), 1)
  assert.equal(await page.locator('#root script').count(), 0, 'Client components must not render startup scripts')
  assert.equal(await page.locator('meta[name="mobile-web-app-capable"]').getAttribute('content'), 'yes')
  await page.screenshot({ path: path.join(output, 'forgot-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Enter a valid email address' }).waitFor()
  assert.equal(state.recover.length, 0)
  await page.getByLabel('Email', { exact: true }).fill('not-an-email')
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
  assert.equal(state.recover.length, 0)
  await page.getByLabel('Email', { exact: true }).fill('  tenant@example.test  ')
  state.mode = 'hold'
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
  await page.getByRole('button', { name: 'Sending reset link' }).waitFor()
  assert.equal(await page.getByLabel('Email', { exact: true }).isDisabled(), true)
  assert.equal(state.recover.length, 1)
  state.release()
  await page.getByRole('heading', { name: 'Check your inbox' }).waitFor()
  assert.equal(state.recover[0].body.email, 'tenant@example.test')
  assert.equal(state.recover[0].redirect, `${base}/auth/confirm`)
  assert.equal(await page.getByRole('button', { name: /Resend link in/ }).isDisabled(), true)
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.getAttribute('aria-labelledby')), 'recovery-title')
  await page.screenshot({ path: path.join(output, 'confirmation-desktop.png'), fullPage: true })
  await page.clock.fastForward(61_000)
  state.mode = 'rate-limit'
  await page.getByRole('button', { name: 'Resend reset link', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Too many emails sent' }).waitFor()
  state.mode = 'success'
  await page.getByRole('button', { name: 'Resend reset link', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Another reset link' }).waitFor()
  await page.getByRole('button', { name: 'Use a different email' }).click()
  await page.getByLabel('Email', { exact: true }).waitFor()
  await page.waitForFunction(() => globalThis.document.activeElement?.id === 'email')
  await page.getByLabel('Email', { exact: true }).fill('different@example.test')
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
  await page.getByRole('heading', { name: 'Check your inbox' }).waitFor()
  assert.equal(state.recover.at(-1).body.email, 'different@example.test')
  await page.getByRole('link', { name: 'Back to sign in' }).click()
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor()
  results.push('validation, normalized email, loading guard, confirmation focus, cooldown, resend error/retry, change address, return to login')
  await context.close()

  for (const width of [320, 390, 768]) {
    const { context, page } = await setup({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })
    await page.goto(`${base}/forgot-password`)
    await page.getByRole('heading', { name: 'Forgot password?', exact: true }).waitFor()
    assert.notEqual(await page.evaluate(() => globalThis.document.activeElement?.id), 'email', 'Mobile must not open the keyboard on arrival')
    await noOverflow(page)
    await page.screenshot({ path: path.join(output, `forgot-${width}.png`), fullPage: true })
    await page.getByLabel('Email', { exact: true }).fill(`${'a'.repeat(60)}@${'b'.repeat(50)}.test`)
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
    await page.getByRole('heading', { name: 'Check your inbox' }).waitFor()
    await noOverflow(page)
    await page.screenshot({ path: path.join(output, `confirmation-${width}.png`), fullPage: true })
    await context.close()
  }
  results.push('320px, 390px and 768px touch layouts, mobile autofocus and long-email overflow')

  {
    const { context, page } = await setup()
    await context.addInitScript(() => {
      if (localStorage.getItem('theme') === null) localStorage.setItem('theme', 'dark')
    })
    await page.goto(`${base}/forgot-password`)
    await page.getByRole('heading', { name: 'Forgot password?', exact: true }).waitFor()
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), true)
    await page.screenshot({ path: path.join(output, 'forgot-dark.png'), fullPage: true })
    await page.getByRole('radio', { name: 'Light', exact: true }).click()
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('light'))
    await page.reload()
    await page.getByRole('heading', { name: 'Forgot password?', exact: true }).waitFor()
    assert.equal(await page.getByRole('radio', { name: 'Light', exact: true }).getAttribute('aria-checked'), 'true')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.getByRole('radio', { name: 'System', exact: true }).click()
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('dark'))
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('light'))
    const secondPage = await context.newPage()
    await secondPage.goto(`${base}/forgot-password`)
    await secondPage.getByRole('radio', { name: 'Dark', exact: true }).click()
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('dark'))
    await context.close()
    results.push('dark/light theme, persistence, system preference changes and cross-tab synchronization without React script warnings')
  }

  {
    const { context, page } = await setup()
    await context.addInitScript(() => Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('Storage unavailable') } }))
    await page.goto(`${base}/forgot-password`)
    await page.getByRole('radio', { name: 'Dark', exact: true }).click()
    await page.waitForFunction(() => globalThis.document.documentElement.classList.contains('dark'))
    await context.close()
    results.push('theme controls remain usable when local storage is blocked')
  }

  for (const entry of [`/${hash}`, `/login${hash}`, `/auth/confirm${hash}`, '/?token_hash=synthetic&type=recovery', '/auth/confirm?token_hash=synthetic&type=recovery']) {
    const { context, page, state } = await setup()
    await page.goto(`${base}${entry}`)
    await page.getByRole('heading', { name: 'Choose a new password' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/set-password')
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'recovery')
    assert.equal(new URL(page.url()).hash, '', 'Tokens must be removed from the final URL')
    if (entry.includes('token_hash')) assert.deepEqual(state.verifications.map(({ token_hash, type }) => ({ token_hash, type })), [{ token_hash: 'synthetic', type: 'recovery' }])
    await page.reload()
    await page.getByRole('heading', { name: 'Choose a new password' }).waitFor()
    if (entry === `/${hash}`) {
      await page.screenshot({ path: path.join(output, 'set-password-desktop.png'), fullPage: true })
      await page.getByLabel('New password', { exact: true }).fill('newPassword123')
      await page.getByLabel('Confirm password', { exact: true }).fill('different123')
      await page.getByRole('button', { name: 'Save password' }).click()
      await page.getByRole('alert').filter({ hasText: 'Passwords do not match' }).waitFor()
      assert.equal(state.updates.length, 0)
      await page.getByLabel('Confirm password', { exact: true }).fill('newPassword123')
      await page.getByRole('button', { name: 'Save password' }).click()
      await page.waitForURL('**/home')
      assert.deepEqual(state.updates.map(({ password }) => password), ['newPassword123'])
    }
    await context.close()
  }
  results.push('dashboard root/login recovery, explicit callback, custom token hashes, refresh persistence and password update')

  for (const entry of ['/#error=access_denied&error_description=Email+link+has+expired', '/?error=access_denied&error_description=Email+link+has+expired', '/auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=', '/#error_code=otp_expired', '/auth/confirm?token_hash=expired&type=recovery', '/auth/confirm']) {
    const { context, page } = await setup()
    await page.goto(`${base}${entry}`)
    await page.getByRole('heading', { name: "This link can't be used" }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/auth/confirm')
    if (entry.includes('error_code=otp_expired')) await page.getByText("We couldn't verify this email link. Request a new link to try again.", { exact: true }).waitFor()
    await page.getByRole('link', { name: 'Request a new link' }).click()
    await page.getByRole('heading', { name: 'Forgot password?', exact: true }).waitFor()
    await context.close()
  }
  results.push('expired default and custom links, incomplete callbacks, request a new link')
  assert.deepEqual(failures, [])
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: results, failures }, null, 2))
  console.log(JSON.stringify({ passed: results, failures }, null, 2))
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
      console.error(await page.locator('body').innerText().catch(() => 'No page content'))
    }
  }
  throw error
} finally {
  await browser.close()
}
