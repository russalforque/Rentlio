import { addDays, addMonths, format, parseISO, startOfMonth } from 'date-fns'

/**
 * Rental business dates (billing months, due dates, "paid today") follow the
 * property's clock, not the device's, so a landlord or tenant abroad sees the
 * same "today" as the database (property_today(), Asia/Manila by default).
 */
export const PROPERTY_TIME_ZONE = 'Asia/Manila'

const propertyDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROPERTY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date at the property, as Postgres `date` text. */
export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return propertyDateFormat.format(now)
}

export function firstOfNextMonthISO(): string {
  return shiftPeriod(currentPeriod(), 1)
}

export const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

/** Billing periods are the first day of a month, "yyyy-MM-01". */
export function currentPeriod(now: Date = new Date()): string {
  return `${todayISO(now).slice(0, 8)}01`
}

/** Whether a billing period is after the property's current month. */
export function isFuturePeriod(period: string): boolean {
  return period > currentPeriod()
}

export function shiftPeriod(period: string, months: number): string {
  return format(startOfMonth(addMonths(parseISO(period), months)), 'yyyy-MM-dd')
}

export function isValidPeriod(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-01$/.test(value) && !Number.isNaN(parseISO(value).getTime())
}

/** Issue and due dates for a month's bills; mirrors generate_bills() in the database. */
export function billingDatesFor(month: Date, billingDay: number, dueDays: number) {
  const issue = addDays(startOfMonth(month), billingDay - 1)
  return { issue, due: addDays(issue, dueDays) }
}

/** The next bill issue date on or after today, with its due date. */
export function nextBillingDates(billingDay: number, dueDays: number) {
  const today = parseISO(todayISO())
  const current = billingDatesFor(today, billingDay, dueDays)
  return current.issue >= today ? current : billingDatesFor(addMonths(today, 1), billingDay, dueDays)
}
