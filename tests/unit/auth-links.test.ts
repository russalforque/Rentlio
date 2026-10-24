import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authCallbackPath, nextAuthStep, parseAuthLink } from '../../src/lib/auth-links.ts'

test('dashboard recovery emails landing on the site root or login reach the callback before route guards', () => {
  const hash = '#access_token=example-access&refresh_token=example-refresh&type=recovery'
  for (const pathname of ['/', '/login', '/dashboard']) {
    assert.equal(authCallbackPath({ pathname, search: '', hash }), `/auth/confirm${hash}`)
  }
  const link = parseAuthLink('', hash)
  assert.deepEqual(link, { ok: true, kind: 'session', type: 'recovery' })
  if (link.ok) assert.equal(nextAuthStep(link.type), '/set-password?mode=recovery')
})

test('custom template tokens are preserved and verified as recovery links', () => {
  const search = '?token_hash=example-hash&type=recovery'
  assert.equal(authCallbackPath({ pathname: '/', search, hash: '' }), `/auth/confirm${search}`)
  assert.deepEqual(parseAuthLink(search, ''), { ok: true, kind: 'token_hash', tokenHash: 'example-hash', type: 'recovery' })
})

test('expired callbacks landing on the root show a useful link error instead of login', () => {
  const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
  assert.equal(authCallbackPath({ pathname: '/', search: '', hash }), `/auth/confirm${hash}`)
  assert.deepEqual(parseAuthLink('', hash), { ok: false, code: 'otp_expired', error: "We couldn't verify this email link. Request a new link to try again." })
})

test('the reported expired URL and code-only callbacks show recovery guidance', () => {
  for (const hash of [
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=',
    '#error_code=otp_expired',
  ]) {
    const link = parseAuthLink('', hash)
    assert.equal(link.ok, false)
    if (!link.ok) {
      assert.equal(link.code, 'otp_expired')
      assert.match(link.error, /Request a new link/)
    }
    assert.equal(authCallbackPath({ pathname: '/login', search: '', hash }), `/auth/confirm${hash}`)
  }
  assert.equal(authCallbackPath({ pathname: '/', search: '?error=access_denied', hash: '' }), '/auth/confirm?error=access_denied')
})

test('normal navigation and already routed callbacks are left alone', () => {
  for (const pathname of ['/', '/login', '/forgot-password', '/set-password']) {
    assert.equal(authCallbackPath({ pathname, search: '?type=recovery', hash: '#section' }), null)
  }
  assert.equal(authCallbackPath({ pathname: '/auth/confirm/', search: '?token_hash=example&type=recovery', hash: '' }), null)
})

test('incomplete and unsupported custom links cannot be verified', () => {
  for (const search of ['', '?type=recovery', '?token_hash=example&type=invalid']) {
    assert.equal(parseAuthLink(search, '').ok, false)
  }
  assert.equal(nextAuthStep('invite'), '/set-password?mode=invite')
  assert.equal(nextAuthStep('signup'), '/')
})
