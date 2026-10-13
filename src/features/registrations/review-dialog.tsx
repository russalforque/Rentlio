import {
  BadgeCheck,
  CircleAlert,
  FilePlus2,
  IdCard,
  Link2,
  Loader2,
  MailWarning,
  ScrollText,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ChoiceCards } from '@/components/app/choice-cards'
import { Callout, Detail, StatusPill } from '@/components/app/panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useTenants } from '@/features/tenants/api'
import type { Enums } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useApproveRegistration,
  useRegistrationHistory,
  useRejectRegistration,
  type AuditEntry,
  type RegistrationRequest,
} from './api'
import { rankCandidates, type MatchReason } from './matching'
import { RegistrationStatusBadge } from './registration-status-badge'

type RecordChoice = 'link' | 'new'
type Check = Exclude<Enums<'identity_check'>, 'invitation'>

const MATCH_LABEL: Record<MatchReason, string> = { name: 'Name', phone: 'Phone', room: 'Room' }

const EVENT_LABEL: Record<AuditEntry['event'], string> = {
  login_created: 'Registered',
  email_verified: 'Email verified',
  registration_approved: 'Approved',
  registration_rejected: 'Rejected',
  account_linked: 'Linked to existing tenant record',
  portal_invited: 'Invited by email',
  manual_tenant_created: 'Tenant record created',
  account_suspended: 'Portal access suspended',
  account_unsuspended: 'Portal access restored',
}

const CHECK_LABEL: Record<Enums<'identity_check'>, string> = {
  existing_record: 'Matched against the tenant record',
  in_person: 'Verified in person',
  invitation: 'Invitation sent to their email',
}

const when = (iso: string) => `${formatDate(iso.slice(0, 10))}, ${iso.slice(11, 16)}`

function History({ requestId }: { requestId: string }) {
  const { data, isPending, error } = useRegistrationHistory(requestId)
  if (error) return <p className="text-[13px] text-destructive">{getErrorMessage(error)}</p>
  if (isPending) return <Skeleton className="h-16" />
  return (
    <ol className="relative grid gap-3 border-l pl-4">
      {data.map((e) => {
        const details = e.details as { note?: string; reason?: string } | null
        return (
          <li key={e.id} className="relative text-[13px]">
            <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-muted-foreground/40 ring-4 ring-background" />
            <p className="font-medium">{EVENT_LABEL[e.event]}</p>
            <p className="text-muted-foreground">{when(e.created_at)}</p>
            {(details?.note || details?.reason) && (
              <p className="mt-1 text-muted-foreground">“{details.note ?? details.reason}”</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Decided({ request }: { request: RegistrationRequest }) {
  const { data: tenants } = useTenants()
  const tenant = tenants?.find((t) => t.id === request.tenant_id)
  if (request.status === 'rejected') {
    return (
      <Callout tone="destructive" icon={UserX}>
        <p className="font-semibold">Rejected {request.reviewed_at && `on ${formatDate(request.reviewed_at.slice(0, 10))}`}</p>
        <p className="mt-0.5">Reason shown to the applicant: “{request.review_note}”</p>
      </Callout>
    )
  }
  return (
    <Callout
      tone="success"
      icon={BadgeCheck}
      action={
        tenant && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/tenants/${tenant.id}`}>Open tenant</Link>
          </Button>
        )
      }
    >
      <p className="font-semibold">
        Approved {request.reviewed_at && `on ${formatDate(request.reviewed_at.slice(0, 10))}`}
        {tenant && ` · ${tenant.full_name}`}
      </p>
      {request.identity_check && <p className="mt-0.5">{CHECK_LABEL[request.identity_check]}</p>}
      {request.review_note && <p className="mt-0.5">“{request.review_note}”</p>}
    </Callout>
  )
}

function ReviewForm({ request, onDone }: { request: RegistrationRequest; onDone: () => void }) {
  const { data: tenants, isPending: loadingTenants } = useTenants()
  const approve = useApproveRegistration()
  const reject = useRejectRegistration()
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')
  const [record, setRecord] = useState<RecordChoice | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const candidates = useMemo(() => rankCandidates(request, tenants ?? []), [request, tenants])
  const chosen = candidates.find((c) => c.tenant.id === tenantId)?.tenant
  const verified = !!request.email_verified_at

  // "Matched against the record" only makes sense when linking a record.
  const effectiveCheck = record === 'new' && check === 'existing_record' ? null : check
  const problems = {
    record: !record ? 'Choose what to do with the tenant record' : record === 'link' && !tenantId ? 'Select a tenant record' : null,
    check: !effectiveCheck ? 'Choose how you verified their identity' : null,
    note: note.trim().length < 3 ? 'Describe what you checked' : null,
    confirm: !confirmed ? 'Confirm you verified this person' : null,
  }
  const canApprove = verified && Object.values(problems).every((p) => p === null)

  const submitApprove = () => {
    setSubmitted(true)
    if (!canApprove || !effectiveCheck) return
    approve.mutate(
      { requestId: request.id, tenantId: record === 'link' ? tenantId : null, identityCheck: effectiveCheck, note: note.trim() },
      {
        onSuccess: () => {
          toast.success(
            record === 'link' && chosen
              ? `${request.full_name || request.email} now has portal access to ${chosen.full_name}'s records`
              : `${request.full_name || request.email} was approved`,
          )
          onDone()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  const submitReject = () => {
    setSubmitted(true)
    if (reason.trim().length < 3) return
    reject.mutate(
      { requestId: request.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Registration rejected')
          onDone()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  const err = (key: keyof typeof problems) =>
    submitted && problems[key] ? <p className="text-[13px] text-destructive">{problems[key]}</p> : null

  if (mode === 'reject') {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We could not match you to a current tenancy."
            aria-invalid={submitted && reason.trim().length < 3}
          />
          <p className={cn('text-[13px]', submitted && reason.trim().length < 3 ? 'text-destructive' : 'text-muted-foreground')}>
            {submitted && reason.trim().length < 3 ? 'Give a reason for the rejection' : 'The applicant sees this when they sign in.'}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setMode('approve')}>
            Back
          </Button>
          <Button variant="destructive" onClick={submitReject} disabled={reject.isPending}>
            {reject.isPending ? <Loader2 className="animate-spin" /> : <UserX />}
            Reject registration
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      {!verified && (
        <Callout tone="warning" icon={MailWarning}>
          The applicant has not confirmed their email yet. You can approve once they do, or reject now.
        </Callout>
      )}

      <section className="grid gap-2.5">
        <h3 className="text-sm font-semibold">1. Tenant record</h3>
        <ChoiceCards<RecordChoice>
          label="Tenant record"
          value={record}
          onChange={setRecord}
          options={[
            {
              value: 'link',
              icon: Link2,
              title: 'Link an existing record',
              description: 'They already rent here. Keeps their room, bills and payment history.',
            },
            {
              value: 'new',
              icon: FilePlus2,
              title: 'Create a new record',
              description: 'A new tenant. You can assign a room afterwards.',
            },
          ]}
        />
        {err('record')}

        {record === 'link' && (
          <div className="grid gap-2">
            <p className="text-[13px] text-muted-foreground">
              Records without portal access. Matches compare what the applicant typed and are only a hint.
            </p>
            {loadingTenants ? (
              <Skeleton className="h-24" />
            ) : candidates.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                No tenant records without portal access. Create a new record instead.
              </p>
            ) : (
              <ul role="radiogroup" aria-label="Tenant record to link" className="grid max-h-64 gap-1.5 overflow-y-auto rounded-xl border p-1.5">
                {candidates.map(({ tenant, reasons }) => {
                  const selected = tenant.id === tenantId
                  return (
                    <li key={tenant.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setTenantId(tenant.id)}
                        className={cn(
                          'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          selected ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{tenant.full_name}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {tenant.room_number ? `Room ${tenant.room_number}` : 'No room'}
                            {tenant.phone && ` · ${tenant.phone}`}
                          </span>
                        </span>
                        {reasons.length > 0 && (
                          <span className="flex shrink-0 flex-wrap justify-end gap-1">
                            {reasons.map((r) => (
                              <StatusPill key={r} tone="info">
                                {MATCH_LABEL[r]}
                              </StatusPill>
                            ))}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-2.5">
        <h3 className="text-sm font-semibold">2. Identity check</h3>
        <ChoiceCards<Check>
          label="How you verified their identity"
          value={effectiveCheck}
          onChange={setCheck}
          options={[
            {
              value: 'existing_record',
              icon: ScrollText,
              title: 'Matched to the record',
              description: 'Details only the real tenant would know match the record (lease, deposit, move-in date).',
              disabled: record !== 'link',
            },
            {
              value: 'in_person',
              icon: IdCard,
              title: 'Verified in person',
              description: 'You met them and checked a government ID or signed lease.',
            },
          ]}
        />
        {err('check')}
        <div className="grid gap-1.5">
          <Label htmlFor="verify-note">What did you check?</Label>
          <Textarea
            id="verify-note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Saw driver's licence; move-in date and deposit match."
            aria-invalid={submitted && !!problems.note}
          />
          {err('note') ?? <p className="text-[13px] text-muted-foreground">Kept in the audit history. Not shown to the applicant.</p>}
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-muted/40 p-3 text-[13px]">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-primary"
          />
          <span>
            I confirmed this person is{' '}
            <span className="font-semibold">{record === 'link' && chosen ? chosen.full_name : request.full_name || 'the applicant'}</span>
            {record === 'link' && chosen ? ', and that they should see this tenant’s records.' : '.'} A matching name or room
            number alone is not enough.
          </span>
        </label>
        {err('confirm')}
      </section>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => {
          setSubmitted(false)
          setMode('reject')
        }}>
          <UserX /> Reject
        </Button>
        <Button onClick={submitApprove} disabled={approve.isPending || !verified}>
          {approve.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}
          {record === 'link' ? 'Approve and link' : 'Approve'}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function ReviewRegistrationDialog({
  request,
  onOpenChange,
}: {
  request: RegistrationRequest | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {request && (
          <div className="grid gap-5">
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-6">
                <DialogTitle className="min-w-0 [overflow-wrap:anywhere]">{request.full_name || request.email}</DialogTitle>
                <RegistrationStatusBadge request={request} />
              </div>
              <DialogDescription>
                {request.source === 'invitation'
                  ? 'Created by your invitation.'
                  : 'Self-registration. Everything below was typed by the applicant and is not verified.'}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4">
              <Detail label="Email" className="col-span-2 sm:col-span-1">
                <span className="flex flex-wrap items-center gap-1.5 break-all">
                  {request.email}
                  {request.email_verified_at ? (
                    <ShieldCheck className="size-4 shrink-0 text-success" aria-label="Verified" />
                  ) : (
                    <CircleAlert className="size-4 shrink-0 text-warning-foreground" aria-label="Not verified" />
                  )}
                </span>
              </Detail>
              <Detail label="Phone">{request.phone ?? <span className="text-muted-foreground">—</span>}</Detail>
              <Detail label="Requested room">{request.requested_room ?? <span className="text-muted-foreground">—</span>}</Detail>
              <Detail label="Registered">{formatDate(request.created_at.slice(0, 10))}</Detail>
            </dl>

            {request.status === 'pending' ? (
              <ReviewForm key={request.id} request={request} onDone={() => onOpenChange(false)} />
            ) : (
              <Decided request={request} />
            )}

            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">History</h3>
              <History requestId={request.id} />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
