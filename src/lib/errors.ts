import { AuthError } from '@supabase/supabase-js'

interface PostgrestLikeError {
  code?: string
  message?: string
  details?: string | null
}

function isPostgrestError(err: unknown): err is PostgrestLikeError {
  return typeof err === 'object' && err !== null && 'message' in err && 'code' in err
}

/**
 * Turns Supabase/Postgres errors into a sentence a landlord or tenant can act on.
 * Database functions raise readable messages with codes 22023 (invalid input) and
 * P0002 (not found); those are passed through. Everything else is mapped.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof AuthError) {
    if (err.code === 'invalid_credentials') return 'Incorrect email or password.'
    if (err.code === 'user_banned') return 'This account has been deactivated. Please contact your landlord.'
    if (err.code === 'same_password') return 'Choose a password different from your current one.'
    if (err.code === 'weak_password') return 'That password is too weak. Use at least 8 characters with letters and numbers.'
    if (err.code === 'otp_expired') return 'This link has expired or was already used.'
    if (err.code === 'over_email_send_rate_limit') return 'Too many emails sent. Please wait a few minutes and try again.'
    return err.message || fallback
  }
  if (isPostgrestError(err)) {
    switch (err.code) {
      case '22023':
      case 'P0002':
        return err.message ?? fallback
      case '42501':
        return err.message?.startsWith('Only') || err.message?.startsWith('Your account')
          ? err.message
          : 'You do not have permission to do that.'
      case '23505':
        return err.message?.includes('rooms_room_number_key')
          ? 'A room with that number already exists.'
          : err.message?.includes('bed_types_name_key')
            ? 'A bed type with that name already exists.'
            : (err.message ?? 'That record already exists.')
      case '23503':
        return 'This record is linked to existing history and cannot be removed.'
      case '23514':
        return 'Some values are out of the allowed range.'
      case 'PGRST301':
      case 'PGRST303':
        return 'Your session has expired. Please sign in again.'
    }
    return err.message || fallback
  }
  if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
    return 'Cannot reach the server. Check your internet connection.'
  }
  if (err instanceof Error) return err.message || fallback
  return fallback
}
