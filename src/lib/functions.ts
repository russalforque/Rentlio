import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Calls a Supabase Edge Function and throws an Error carrying the function's
 * own `{ error }` message, so callers can show it directly.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    const payload: unknown = await error.context.json().catch(() => null)
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'The server could not complete the request.'
    throw new Error(message)
  }
  if (error instanceof FunctionsFetchError) {
    throw new Error('Cannot reach the server. Check your internet connection.')
  }
  throw new Error(error.message)
}
