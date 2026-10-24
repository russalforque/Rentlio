import type { EmailOtpType } from '@supabase/supabase-js'

const SUPPORTED: EmailOtpType[] = ['invite', 'recovery', 'email_change', 'email', 'signup', 'magiclink']

// Supabase also returns otp_expired for missing/invalid tokens, so avoid
// claiming that the recipient let the link expire or already used it.
export const AUTH_LINK_REJECTED_MESSAGE = "We couldn't verify this email link. Request a new link to try again."

type ParsedAuthLink =
  | { ok: true; kind: 'token_hash'; tokenHash: string; type: EmailOtpType }
  | { ok: true; kind: 'session'; type: string }
  | { ok: false; error: string; code?: string }

/** Supports default Supabase emails and custom token-hash templates. */
export function parseAuthLink(search: string, hash: string): ParsedAuthLink {
  const params = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
  const errorCode = params.get('error_code') ?? hashParams.get('error_code')
  const urlError = params.get('error_description') ?? hashParams.get('error_description')
    ?? params.get('error') ?? hashParams.get('error')
  if (errorCode === 'otp_expired') return { ok: false, code: errorCode, error: AUTH_LINK_REJECTED_MESSAGE }
  if (errorCode && !urlError) return { ok: false, code: errorCode, error: 'This link could not be verified. Please request a new link.' }
  if (urlError) return { ok: false, error: urlError.replace(/\+/g, ' ') }

  if (hashParams.get('access_token')) {
    return { ok: true, kind: 'session', type: hashParams.get('type') ?? '' }
  }

  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  if (tokenHash && type && SUPPORTED.includes(type)) return { ok: true, kind: 'token_hash', tokenHash, type }

  return { ok: false, error: 'This link is incomplete. Please use the most recent email you received.' }
}

/**
 * Dashboard-generated emails can return to Site URL (usually / or /login),
 * rather than the redirectTo used by the app. Route email callbacks before
 * normal guest/home guards run, preserving the tokens for Supabase to consume.
 */
export function authCallbackPath({ pathname, search, hash }: { pathname: string; search: string; hash: string }): string | null {
  if (pathname.replace(/\/+$/, '') === '/auth/confirm') return null
  const params = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
  const hasSession = !!hashParams.get('access_token') && SUPPORTED.includes(hashParams.get('type') as EmailOtpType)
  const hasTokenHash = !!params.get('token_hash') && SUPPORTED.includes(params.get('type') as EmailOtpType)
  const hasError = params.has('error_description') || hashParams.has('error_description')
    || params.has('error') || hashParams.has('error') || params.has('error_code') || hashParams.has('error_code')
  return hasSession || hasTokenHash || hasError ? `/auth/confirm${search}${hash}` : null
}

export function nextAuthStep(type: string): string {
  if (type === 'invite') return '/set-password?mode=invite'
  if (type === 'recovery') return '/set-password?mode=recovery'
  return '/'
}
