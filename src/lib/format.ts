import { format, parseISO } from 'date-fns'

const currencyFormatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number | null | undefined, currency = 'PHP'): string {
  let fmt = currencyFormatters.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    currencyFormatters.set(currency, fmt)
  }
  return fmt.format(amount ?? 0)
}

/** Postgres `date` values arrive as "YYYY-MM-DD"; parse without timezone shifts. */
export function formatDate(value: string | null | undefined, pattern = 'MMM d, yyyy'): string {
  if (!value) return '—'
  return format(parseISO(value), pattern)
}

export function formatPeriod(period: string): string {
  return format(parseISO(period), 'MMMM yyyy')
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

const compactFormatters = new Map<string, Intl.NumberFormat>()

/** Axis ticks: 0, 5K, 12.5K, 1.2M. */
export function formatCompact(value: number): string {
  let fmt = compactFormatters.get('c')
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
    compactFormatters.set('c', fmt)
  }
  return fmt.format(value)
}
