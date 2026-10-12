import { StatusPill, type Tone } from '@/components/app/panel'
import type { Enums } from '@/lib/database.types'
import { cn } from '@/lib/utils'

const STYLES: Record<Enums<'bill_status'> | 'overdue', { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'success' },
  partial: { label: 'Partially paid', tone: 'info' },
  unpaid: { label: 'Unpaid', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'destructive' },
  void: { label: 'Void', tone: 'neutral' },
}

export function BillStatusBadge({
  status,
  overdue,
  className,
}: {
  status: Enums<'bill_status'>
  overdue?: boolean
  className?: string
}) {
  const style = STYLES[overdue && (status === 'unpaid' || status === 'partial') ? 'overdue' : status]
  return (
    <StatusPill tone={style.tone} className={cn(status === 'void' && 'line-through', className)}>
      {style.label}
    </StatusPill>
  )
}
