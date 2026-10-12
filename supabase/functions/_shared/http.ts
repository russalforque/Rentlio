// Shared request handling for Rentlio edge functions: CORS, JSON responses and
// mapping thrown HttpErrors to status codes without leaking internals.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'Something went wrong on the server. Please try again.' }, 500)
    }
  })
}

/**
 * Where invitation links should land: the app's /auth/confirm on the site the
 * landlord is using. Supabase only honours it if it matches the project's
 * allowed redirect URLs; otherwise it falls back to the Site URL.
 */
export function confirmRedirect(req: Request): string | undefined {
  const origin = req.headers.get('Origin')
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin)) return undefined
  return `${origin}/auth/confirm`
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'Request body must be JSON')
  }
}
