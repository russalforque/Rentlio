import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CalendarMarkKind = 'bill' | 'due' | 'overdue'

export interface CalendarMark {
  kind: CalendarMarkKind
  /** Spoken and shown on hover, e.g. "Payment due". */
  label: string
}

const MARK_STYLE: Record<CalendarMarkKind, string> = {
  bill: 'bg-highlight text-highlight-foreground font-bold',
  due: 'ring-[1.5px] ring-foreground ring-inset font-bold',
  overdue: 'ring-[1.5px] ring-destructive ring-inset text-destructive font-bold',
}

const MARK_LEGEND: Record<CalendarMarkKind, string> = {
  bill: 'size-3 rounded-full bg-highlight',
  due: 'size-3 rounded-full ring-[1.5px] ring-foreground ring-inset',
  overdue: 'size-3 rounded-full ring-[1.5px] ring-destructive ring-inset',
}

interface MonthCalendarProps {
  month: Date
  onMonthChange: (d: Date) => void
  /** Keyed by "yyyy-MM-dd". */
  marks: Map<string, CalendarMark>
  legend: { kind: CalendarMarkKind; label: string }[]
}

/**
 * Read-only month view. Today is filled ink; marked days carry a ring or the
 * highlight fill, plus an accessible label, and the legend names every mark.
 */
export function MonthCalendar({ month, onMonthChange, marks, legend }: MonthCalendarProps) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7))
  const weekdays = days.slice(0, 7)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <p className="text-sm font-bold" aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </p>
        <Button variant="ghost" size="icon-sm" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Next month">
          <ChevronRight />
        </Button>
      </div>
      <table className="w-full table-fixed border-separate border-spacing-y-1 text-center text-[13px]">
        <caption className="sr-only">{format(month, 'MMMM yyyy')}</caption>
        <thead>
          <tr>
            {weekdays.map((d) => (
              <th key={d.toISOString()} scope="col" abbr={format(d, 'EEEE')} className="pb-1 text-[11px] font-semibold text-muted-foreground">
                {format(d, 'EEEEEE')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]!.toISOString()}>
              {week.map((d) => {
                const key = format(d, 'yyyy-MM-dd')
                const mark = marks.get(key)
                const inMonth = isSameMonth(d, month)
                const today = isToday(d)
                return (
                  <td key={key} className="p-0">
                    <span
                      title={mark?.label}
                      className={cn(
                        'mx-auto grid size-8 place-items-center rounded-full tabular sm:size-9',
                        !inMonth && 'text-muted-foreground/50',
                        inMonth && mark && MARK_STYLE[mark.kind],
                        today && 'bg-primary font-bold text-primary-foreground ring-0',
                      )}
                    >
                      <span aria-hidden>{format(d, 'd')}</span>
                      <span className="sr-only">
                        {format(d, 'MMMM d')}
                        {today && ', today'}
                        {inMonth && mark && `, ${mark.label}`}
                      </span>
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-primary" aria-hidden /> Today
        </li>
        {legend.map((l) => (
          <li key={l.kind} className="flex items-center gap-1.5">
            <span className={MARK_LEGEND[l.kind]} aria-hidden /> {l.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
