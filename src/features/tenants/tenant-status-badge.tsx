import { StatusPill, type Tone } from '@/components/app/panel'
import type { TenantOverview } from './api'

const STYLES: Record<TenantOverview['account_status'], { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  invited: { label: 'Invite pending', tone: 'info' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export function TenantStatusBadge({ status, className }: { status: TenantOverview['account_status']; className?: string }) {
  const style = STYLES[status]
  return (
    <StatusPill tone={style.tone} className={className}>
      {style.label}
    </StatusPill>
  )
}
