import { StatusPill, type Tone } from '@/components/app/panel'
import type { TenantOverview } from './api'

const ACCOUNT_STATUS: Record<TenantOverview['account_status'], { label: string; tone: Tone }> = {
  active: { label: 'Portal active', tone: 'success' },
  invited: { label: 'Invite pending', tone: 'info' },
  no_portal: { label: 'No portal access', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'warning' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export function TenantStatusBadge({ status, className }: { status: TenantOverview['account_status']; className?: string }) {
  const style = ACCOUNT_STATUS[status]
  return (
    <StatusPill tone={style.tone} className={className}>
      {style.label}
    </StatusPill>
  )
}
