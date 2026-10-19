/** Vite embeds every VITE_* value into browser assets. Reject private keys
 * before building, including a service-role JWT in the publishable-key slot. */
export function validatePublicEnv(env: Record<string, string | undefined>) {
  for (const name of Object.keys(env)) {
    if (/^VITE_.*(SECRET|SERVICE_ROLE|PASSWORD|PRIVATE_KEY)/i.test(name) && env[name]) {
      throw new Error(`${name} must not be exposed through Vite. Store server credentials in Edge Function secrets.`)
    }
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!key) return
  if (key.startsWith('sb_publishable_')) return
  let role: unknown
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8')).role
  } catch {
    // A malformed key is also unsafe to ship as a working deployment.
  }
  if (role !== 'anon') throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key or an anon JWT. Never use a service-role or secret key.')
}
