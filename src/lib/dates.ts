import { addMonths, format, getDaysInMonth, parseISO, startOfMonth } from 'date-fns'

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
export function todayISO(now: Date = new Date(), timeZone = PROPERTY_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  const formatter = timeZone === PROPERTY_TIME_ZONE
    ? propertyDateFormat
    : new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
  return formatter.format(now)
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

/** The move-in anniversary in a target month, clamped without changing the original day. */
export function leaseAnniversaryDate(startDate: string, month: Date): string {
  const startDay = Number(startDate.slice(8, 10))
  const target = startOfMonth(month)
  const day = Math.min(startDay, getDaysInMonth(target))
  return format(new Date(target.getFullYear(), target.getMonth(), day), 'yyyy-MM-dd')
}

/** Next lease payment date, including the initial move-in payment date. */
export function nextLeaseDueDate(startDate: string, today: string = todayISO()): string {
  if (startDate >= today) return startDate

  const currentMonth = startOfMonth(parseISO(today))
  const currentDue = leaseAnniversaryDate(startDate, currentMonth)
  return currentDue >= today ? currentDue : leaseAnniversaryDate(startDate, addMonths(currentMonth, 1))
}
