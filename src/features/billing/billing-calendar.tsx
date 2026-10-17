import { startOfMonth } from 'date-fns'
import { useState } from 'react'
import { type CalendarMark, MonthCalendar } from '@/components/app/month-calendar'
import { leaseAnniversaryDate } from '@/lib/dates'

type BillingCalendarProps = {
  /** Specific dates to mark on top of the schedule, keyed by "yyyy-MM-dd". */
  extra?: Map<string, CalendarMark>
  dueLabel?: string
  leaseStartDate: string
}

/** Month view of the active lease's anniversary-based due date. */
export function BillingCalendar({ extra, dueLabel = 'Payment due', leaseStartDate }: BillingCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  const marks = new Map<string, CalendarMark>()
  const due = leaseAnniversaryDate(leaseStartDate, month)
  marks.set(due, { kind: 'due', label: dueLabel })
  for (const [k, v] of extra ?? []) marks.set(k, v)

  const legend: { kind: CalendarMark['kind']; label: string }[] = [{ kind: 'due', label: dueLabel }]
  if ([...(extra?.values() ?? [])].some((m) => m.kind === 'overdue')) legend.push({ kind: 'overdue', label: 'Overdue' })

  return <MonthCalendar month={month} onMonthChange={setMonth} marks={marks} legend={legend} />
}
