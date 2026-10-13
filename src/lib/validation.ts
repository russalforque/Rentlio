import { z } from 'zod'

/** Mirrors supabase/config.toml: minimum 8 characters, letters and digits. */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

/** Empty inputs become null so optional text columns stay clean. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .transform((v) => (v === '' ? null : v))

/**
 * Philippine mobile and landline numbers (0917 123 4567, +63 917 123 4567,
 * (02) 8123 4567, (032) 123 4567) or any international number written with a
 * leading +. Spaces, dots, hyphens and parentheses are ignored. Mirrors
 * public._valid_phone() in the database, which enforces the same rule.
 */
export function isValidPhone(value: string): boolean {
  return /^((\+?63|0)\d{9,10}|\+[1-9]\d{7,14})$/.test(value.replace(/[\s().-]/g, ''))
}

export const phoneText = optionalText(40).refine((v) => v === null || isValidPhone(v), {
  message: 'Enter a valid phone number, e.g. 0917 123 4567 or +63 917 123 4567',
})
