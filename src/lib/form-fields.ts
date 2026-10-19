import { z } from 'zod'

// Form inputs are strings; these schemas validate and convert them to the
// numbers the database expects, with messages a non-technical user understands.

export const moneyInput = (label = 'Amount') =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label.toLowerCase()}`)
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, '')), 'Enter a valid amount, e.g. 4500 or 4500.50')
    .transform((v) => Number(v.replace(/,/g, '')))
    .refine((v) => v <= 9_999_999_999, 'That amount is too large')

export const optionalIntInput = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^-?\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `Enter a whole number from ${min} to ${max}`)
    .transform((v) => (v === '' ? null : Number(v)))

export const intInput = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, `Enter a whole number from ${min} to ${max}`)
    .transform(Number)

const MONEY_RE = /^\d+(\.\d{1,2})?$/

/** Blank allowed (becomes null); otherwise a valid non-negative amount. */
export const optionalMoneyInput = () =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || MONEY_RE.test(v.replace(/,/g, '')), 'Enter a valid amount, e.g. 4500 or 4500.50')
    .transform((v) => (v === '' ? null : Number(v.replace(/,/g, ''))))

export const dateInput = (label = 'date') =>
  z.iso.date(`Choose a valid ${label}`)
