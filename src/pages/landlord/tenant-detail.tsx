import { differenceInCalendarMonths, parseISO } from 'date-fns'
import {
  ArrowRightLeft,
  CalendarDays,
  DoorOpen,
  History,
  LogOut,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  PiggyBank,
  Plus,
  Power,
  Send,
  ShieldAlert,
  TriangleAlert,
  UserX,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Callout, StatGrid, StatTile, StatusPill } from '@/components/app/panel'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/app/confirm-dialog'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/features/account/user-avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useDepositLedger,
  useManageTenant,
  useTenant,
  useTenantLeases,
  type TenantOverview,
} from '@/features/tenants/api'
import {
  AssignRoomDialog,
  DepositDialog,
  EditTenantDialog,
  EndLeaseDialog,
  LeaseRentDialog,
  MoveRoomDialog,
} from '@/features/tenants/tenancy-dialogs'
import { TenantStatusBadge } from '@/features/tenants/tenant-status-badge'
import { useCurrency } from '@/hooks/use-settings'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

type DialogName = 'edit' | 'assign' | 'move' | 'end' | 'rent' | 'deposit' | 'deactivate' | 'reactivate'

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  )
}

function CurrentRoomCard({
  tenant,
  currency,
  open,
}: {
  tenant: TenantOverview
  currency: string
  open: (d: DialogName) => void
}) {
  if (!tenant.lease_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Room</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center rounded-xl border border-dashed px-4 py-8 text-center">
            <DoorOpen className="mb-2 size-6 text-muted-foreground" />
            <p className="font-medium">Not assigned to a room</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tenant.is_active ? 'Assign a room to start monthly billing.' : 'Reactivate the account to assign a room.'}
            </p>
            {tenant.is_active && (
              <Button className="mt-4" onClick={() => open('assign')}>
                <Plus /> Assign room
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardDescription>Current room</CardDescription>
          <CardTitle className="font-display mt-1 text-3xl">Room {tenant.room_number}</CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={() => open('move')}>
          <ArrowRightLeft /> Move
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Detail label="Since">{formatDate(tenant.lease_start_date)}</Detail>
          <Detail label="Agreed rent">
            <button
              type="button"
              onClick={() => open('rent')}
              className="inline-flex items-center gap-1.5 tabular underline-offset-2 hover:underline"
              title="Change rent"
            >
              {formatMoney(tenant.lease_rent, currency)}
              <Pencil className="size-3.5 text-muted-foreground" />
            </button>
          </Detail>
          <Detail label="Balance due">
            <span className={cn('tabular', tenant.outstanding_balance > 0 && 'text-destructive')}>
              {formatMoney(tenant.outstanding_balance, currency)}
            </span>
          </Detail>
        </dl>
        <div className="flex justify-end border-t pt-4">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => open('end')}>
            <LogOut /> End tenancy
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LeaseHistoryCard({ tenantId, currency }: { tenantId: string; currency: string }) {
  const { data: leases, isPending, error } = useTenantLeases(tenantId)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" /> Tenancy history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
        ) : isPending ? (
          <Skeleton className="h-16" />
        ) : leases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenancies yet.</p>
        ) : (
          <ol className="space-y-3">
            {leases.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">Room {l.rooms?.room_number ?? '—'}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatDate(l.start_date)} – {l.end_date ? formatDate(l.end_date) : 'present'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular">{formatMoney(l.monthly_rent, currency)}/mo</p>
                  <StatusPill tone={l.status === 'active' ? 'success' : 'neutral'} className="mt-1">
                    {l.status === 'active' ? 'Active' : 'Ended'}
                  </StatusPill>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

const DEPOSIT_LABEL = { received: 'Received', deduction: 'Deduction', refund: 'Refund' } as const

function DepositCard({
  tenant,
  currency,
  canRecord,
  onRecord,
}: {
  tenant: TenantOverview
  currency: string
  canRecord: boolean
  onRecord: () => void
}) {
  const { data: ledger, isPending, error } = useDepositLedger(tenant.id)
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardDescription className="flex items-center gap-1.5">
            <PiggyBank className="size-4" /> Security deposit held
          </CardDescription>
          <CardTitle className="font-display mt-1 text-2xl tabular">{formatMoney(tenant.deposit_balance, currency)}</CardTitle>
        </div>
        {canRecord && (
          <Button variant="outline" size="sm" onClick={onRecord}>
            <Plus /> Record
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
        ) : isPending ? (
          <Skeleton className="h-12" />
        ) : ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canRecord ? 'No deposit recorded.' : 'Assign a room before recording a deposit.'}
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {ledger.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{DEPOSIT_LABEL[d.type]}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {formatDate(d.transaction_date)}
                    {d.notes && ` · ${d.notes}`}
                  </p>
                </div>
                <span className={cn('shrink-0 font-semibold tabular', d.type === 'received' ? 'text-success' : 'text-foreground')}>
                  {d.type === 'received' ? '+' : '−'}
                  {formatMoney(d.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function TenantDetailPage() {
  const { id = '' } = useParams()
  const { data: tenant, isPending, error, refetch } = useTenant(id)
  const { data: leases } = useTenantLeases(id)
  const manage = useManageTenant()
  const currency = useCurrency()
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const close = (o: boolean) => !o && setDialog(null)

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-xl lg:col-span-2" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    )
  }
  if (!tenant) {
    return (
      <EmptyState
        icon={UserX}
        title="Tenant not found"
        description="This tenant does not exist or was never invited."
        action={<Button asChild variant="outline"><Link to="/tenants">Back to tenants</Link></Button>}
      />
    )
  }

  // Deposits are recorded against the current lease, or the latest one after move-out.
  const depositLeaseId = tenant.lease_id ?? leases?.[0]?.id ?? null

  const runAction = (action: 'resend_invite' | 'deactivate' | 'reactivate', success: string) =>
    manage.mutate(
      { action, tenantId: tenant.id },
      {
        onSuccess: () => {
          toast.success(success)
          setDialog(null)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <div className="space-y-5">
      <div className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar
            path={tenant.avatar_path}
            name={tenant.full_name}
            email={tenant.email}
            className="size-14"
            fallbackClassName="bg-muted text-lg font-semibold text-foreground/70"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display min-w-0 text-[22px] leading-tight font-semibold [overflow-wrap:anywhere] sm:truncate">{tenant.full_name || tenant.email}</h1>
              <TenantStatusBadge status={tenant.account_status} />
            </div>
            <p className="truncate text-[13px] text-muted-foreground">
              {tenant.room_number ? `Room ${tenant.room_number}` : 'No room assigned'} · {tenant.email}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {tenant.phone && (
            <Button variant="outline" className="flex-1 sm:hidden" asChild>
              <a href={`tel:${tenant.phone}`}>
                <Phone /> Call
              </a>
            </Button>
          )}
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setDialog('edit')}>
            <Pencil /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {tenant.account_status === 'invited' && (
                <DropdownMenuItem
                  disabled={manage.isPending}
                  onSelect={() => runAction('resend_invite', `Invitation resent to ${tenant.email}`)}
                >
                  <Send /> Resend invitation
                </DropdownMenuItem>
              )}
              {tenant.is_active ? (
                <>
                  {tenant.account_status === 'invited' && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant="destructive" onSelect={() => setDialog('deactivate')}>
                    <Power /> Deactivate account
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onSelect={() => setDialog('reactivate')}>
                  <Power /> Reactivate account
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <StatGrid>
        <StatTile
          label="Agreed rent"
          value={tenant.lease_id ? formatMoney(tenant.lease_rent, currency) : '—'}
          icon={Wallet}
          sub={<span className="text-xs text-muted-foreground">{tenant.room_number ? `Room ${tenant.room_number}` : 'No room'}</span>}
        />
        <StatTile
          label="Balance due"
          value={formatMoney(tenant.outstanding_balance, currency)}
          icon={TriangleAlert}
          sub={
            <span className={cn('text-xs', tenant.outstanding_balance > 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {tenant.outstanding_balance > 0 ? 'Unpaid bills' : 'All paid up'}
            </span>
          }
        />
        <StatTile
          label="Deposit held"
          value={formatMoney(tenant.deposit_balance, currency)}
          icon={PiggyBank}
          sub={<span className="text-xs text-muted-foreground">Security deposit</span>}
        />
        <StatTile
          label="Tenant since"
          value={tenant.lease_start_date ? formatDate(tenant.lease_start_date, 'MMM yyyy') : '—'}
          icon={CalendarDays}
          sub={
            <span className="text-xs text-muted-foreground">
              {tenant.lease_start_date ? `${Math.max(0, differenceInCalendarMonths(new Date(), parseISO(tenant.lease_start_date)))} months` : 'Not housed'}
            </span>
          }
        />
      </StatGrid>

      {tenant.account_status === 'invited' && (
        <Callout tone="info" icon={Mail}>
          Invitation sent {formatDate(tenant.invited_at?.slice(0, 10))}. {tenant.full_name.split(' ')[0] || 'The tenant'} has not
          activated their account yet. You can still assign a room and bill them.
        </Callout>
      )}
      {tenant.account_status === 'inactive' && (
        <Callout tone="neutral" icon={ShieldAlert}>
          This account is deactivated. The tenant cannot sign in. Their bills and payment history are kept.
        </Callout>
      )}

      {/* Phones: one column ordered room, deposit, contact, history; large screens: two columns. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="contents lg:col-span-2 lg:block lg:space-y-4">
          <div className="order-1 lg:order-none">
            <CurrentRoomCard tenant={tenant} currency={currency} open={setDialog} />
          </div>
          <div className="order-4 lg:order-none">
            <LeaseHistoryCard tenantId={tenant.id} currency={currency} />
          </div>
        </div>
        <div className="contents lg:block lg:space-y-4">
          <Card className="order-3 lg:order-none">
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm">
                <Detail label="Email">
                  <a href={`mailto:${tenant.email}`} className="inline-flex items-center gap-1.5 break-all underline-offset-2 hover:underline">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                    {tenant.email}
                  </a>
                </Detail>
                <Detail label="Phone">
                  {tenant.phone ? (
                    <a href={`tel:${tenant.phone}`} className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                      <Phone className="size-3.5 text-muted-foreground" />
                      {tenant.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Detail>
                <Detail label="Emergency contact">
                  {tenant.emergency_contact_name || tenant.emergency_contact_phone ? (
                    <>
                      {tenant.emergency_contact_name}
                      {tenant.emergency_contact_phone && (
                        <span className="block text-muted-foreground">{tenant.emergency_contact_phone}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Detail>
              </dl>
            </CardContent>
          </Card>
          <div className="order-2 lg:order-none">
            <DepositCard
              tenant={tenant}
              currency={currency}
              canRecord={depositLeaseId !== null}
              onRecord={() => setDialog('deposit')}
            />
          </div>
        </div>
      </div>

      {/* Only the active dialog is mounted, so each opens with fresh values. */}
      {dialog === 'edit' && <EditTenantDialog tenant={tenant} open onOpenChange={close} />}
      {dialog === 'assign' && <AssignRoomDialog tenant={tenant} open onOpenChange={close} />}
      {dialog === 'move' && <MoveRoomDialog tenant={tenant} open onOpenChange={close} />}
      {dialog === 'end' && <EndLeaseDialog tenant={tenant} open onOpenChange={close} />}
      {dialog === 'rent' && <LeaseRentDialog tenant={tenant} open onOpenChange={close} />}
      {dialog === 'deposit' && depositLeaseId && (
        <DepositDialog tenant={tenant} leaseId={depositLeaseId} open onOpenChange={close} />
      )}
      <ConfirmDialog
        open={dialog === 'deactivate'}
        onOpenChange={close}
        title="Deactivate account?"
        description={
          tenant.lease_id
            ? `${tenant.full_name} still has room ${tenant.room_number}. End the tenancy first, then deactivate.`
            : `${tenant.full_name} will no longer be able to sign in. Their bills, payments and deposit records are kept, and you can reactivate later.`
        }
        confirmLabel={tenant.lease_id ? 'End tenancy first' : 'Deactivate'}
        destructive={!tenant.lease_id}
        pending={manage.isPending}
        onConfirm={() =>
          tenant.lease_id ? setDialog('end') : runAction('deactivate', `${tenant.full_name}'s account was deactivated`)
        }
      />
      <ConfirmDialog
        open={dialog === 'reactivate'}
        onOpenChange={close}
        title="Reactivate account?"
        description={`${tenant.full_name} will be able to sign in again.`}
        confirmLabel="Reactivate"
        pending={manage.isPending}
        onConfirm={() => runAction('reactivate', `${tenant.full_name}'s account was reactivated`)}
      />
    </div>
  )
}
