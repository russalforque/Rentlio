import { StatusPill, type Tone } from '@/components/app/panel'
import type { Enums } from '@/lib/database.types'
import { cn } from '@/lib/utils'

const STYLES: Record<Enums<'bill_status'> | 'overdue' | 'draft', { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'success' },
  partial: { label: 'Partially paid', tone: 'info' },
  unpaid: { label: 'Unpaid', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'destructive' },
  void: { label: 'Void', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'brand' },
}

export function BillStatusBadge({
  status,
  overdue,
  draft,
  className,
}: {
  status: Enums<'bill_status'>
  overdue?: boolean
  /** Not finalized yet: the tenant cannot see it. */
  draft?: boolean
  className?: string
}) {
  const key =
    status === 'void' ? 'void' : draft ? 'draft' : overdue && (status === 'unpaid' || status === 'partial') ? 'overdue' : status
  const style = STYLES[key]
  return (
    <StatusPill tone={style.tone} className={cn(status === 'void' && 'line-through', className)}>
      {style.label}
    </StatusPill>
  )
}
