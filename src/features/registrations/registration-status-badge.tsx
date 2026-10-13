import { StatusPill } from '@/components/app/panel'
import type { RegistrationRequest } from './api'

export function RegistrationStatusBadge({ request, className }: { request: RegistrationRequest; className?: string }) {
  if (request.status === 'approved') {
    return (
      <StatusPill tone="success" className={className}>
        {request.source === 'invitation' ? 'Invited' : 'Approved'}
      </StatusPill>
    )
  }
  if (request.status === 'rejected') {
    return (
      <StatusPill tone="destructive" className={className}>
        Rejected
      </StatusPill>
    )
  }
  return (
    <StatusPill tone={request.email_verified_at ? 'warning' : 'neutral'} className={className}>
      {request.email_verified_at ? 'Awaiting review' : 'Email unverified'}
    </StatusPill>
  )
}
