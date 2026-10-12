import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currentPeriod, shiftPeriod } from '@/lib/dates'
import { formatPeriod } from '@/lib/format'

export function PeriodPicker({ value, onChange }: { value: string; onChange: (period: string) => void }) {
  const isCurrent = value === currentPeriod()
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" onClick={() => onChange(shiftPeriod(value, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <span className="min-w-32 text-center text-sm font-semibold sm:min-w-36" aria-live="polite">
        {formatPeriod(value)}
      </span>
      <Button variant="outline" size="icon" onClick={() => onChange(shiftPeriod(value, 1))} aria-label="Next month">
        <ChevronRight />
      </Button>
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => onChange(currentPeriod())}>
          This month
        </Button>
      )}
    </div>
  )
}
