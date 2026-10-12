import { addDays, addMonths, format, parseISO, startOfDay, startOfMonth } from 'date-fns'

/** Today's date in the browser's timezone, as Postgres `date` text. */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function firstOfNextMonthISO(): string {
  return format(startOfMonth(addMonths(new Date(), 1)), 'yyyy-MM-dd')
}

export const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

/** Billing periods are the first day of a month, "yyyy-MM-01". */
export function currentPeriod(): string {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd')
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
  const today = startOfDay(new Date())
  const current = billingDatesFor(today, billingDay, dueDays)
  return current.issue >= today ? current : billingDatesFor(addMonths(today, 1), billingDay, dueDays)
}
