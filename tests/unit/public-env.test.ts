import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validatePublicEnv } from '../../config/public-env.ts'

const jwt = (role: string) => `fixture.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`

test('frontend configuration accepts public keys and rejects private credentials', () => {
  validatePublicEnv({})
  validatePublicEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture' })
  validatePublicEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })
  assert.throws(() => validatePublicEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }), /Never use/)
  assert.throws(() => validatePublicEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_local_fixture' }), /Never use/)
  assert.throws(() => validatePublicEnv({ VITE_SUPABASE_SERVICE_ROLE_KEY: 'local-placeholder' }), /must not be exposed/)
})
