import { addMonths, format, startOfMonth } from 'date-fns'
import { useState } from 'react'
import { type CalendarMark, MonthCalendar } from '@/components/app/month-calendar'
import { billingDatesFor } from '@/lib/dates'

interface BillingCalendarProps {
  billingDay: number
  dueDays: number
  /** Specific dates to mark on top of the schedule, keyed by "yyyy-MM-dd". */
  extra?: Map<string, CalendarMark>
  dueLabel?: string
}

/** Month view of the property's billing schedule: issue day and payment due day. */
export function BillingCalendar({ billingDay, dueDays, extra, dueLabel = 'Payment due' }: BillingCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  const marks = new Map<string, CalendarMark>()
  // The previous month's due date can land in this month.
  for (const offset of [-1, 0]) {
    const { issue, due } = billingDatesFor(addMonths(month, offset), billingDay, dueDays)
    marks.set(format(issue, 'yyyy-MM-dd'), { kind: 'bill', label: 'Bills issued' })
    marks.set(format(due, 'yyyy-MM-dd'), { kind: 'due', label: dueLabel })
  }
  for (const [k, v] of extra ?? []) marks.set(k, v)

  const legend: { kind: CalendarMark['kind']; label: string }[] = [
    { kind: 'bill', label: 'Bills issued' },
    { kind: 'due', label: dueLabel },
  ]
  if ([...(extra?.values() ?? [])].some((m) => m.kind === 'overdue')) legend.push({ kind: 'overdue', label: 'Overdue' })

  return <MonthCalendar month={month} onMonthChange={setMonth} marks={marks} legend={legend} />
}

