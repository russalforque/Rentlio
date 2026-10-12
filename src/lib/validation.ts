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

export const phoneText = optionalText(40).refine((v) => v === null || /^[+\d][\d\s()-]{5,}$/.test(v), {
  message: 'Enter a valid phone number',
})
