import { AlertTriangle, ChevronRight, MailCheck, Search, UserCheck, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Fab } from '@/components/app/fab'
import { PageHeader } from '@/components/app/page-header'
import { FilterChips, Panel, SearchField, StatGrid, StatTile } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserAvatar } from '@/features/account/user-avatar'
import { useTenants, type TenantOverview } from '@/features/tenants/api'
import { InviteTenantDialog } from '@/features/tenants/invite-tenant-dialog'
import { TenantStatusBadge } from '@/features/tenants/tenant-status-badge'
import { useCurrency } from '@/hooks/use-settings'
import { formatMoney } from '@/lib/format'

type Filter = 'all' | TenantOverview['account_status']

function TenantAvatar({ tenant, className = 'size-9' }: { tenant: TenantOverview; className?: string }) {
  return (
    <UserAvatar
      path={tenant.avatar_path}
      name={tenant.full_name}
      email={tenant.email}
      className={className}
      fallbackClassName="bg-muted text-[11px] font-semibold text-foreground/70"
    />
  )
}

function RoomChip({ room }: { room: string | null }) {
  if (!room) return <span className="text-[13px] text-muted-foreground">No room</span>
  return <span className="inline-flex rounded-md border bg-muted/60 px-2 py-0.5 text-xs font-semibold tabular">Room {room}</span>
}

function Money({ value, currency, tone }: { value: number; currency: string; tone?: 'due' }) {
  if (value <= 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className={tone === 'due' ? 'font-semibold text-destructive tabular' : 'font-semibold tabular'}>
      {formatMoney(value, currency)}
    </span>
  )
}

export function TenantsPage() {
  const { data: tenants, isPending, error, refetch } = useTenants()
  const currency = useCurrency()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState(false)

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, invited: 0, inactive: 0, owing: 0, owed: 0, housed: 0 }
    for (const t of tenants ?? []) {
      c.all++
      c[t.account_status]++
      if (t.room_number) c.housed++
      if (t.outstanding_balance > 0) {
        c.owing++
        c.owed += t.outstanding_balance
      }
    }
    return c
  }, [tenants])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (tenants ?? []).filter(
      (t) =>
        (filter === 'all' || t.account_status === filter) &&
        (!q ||
          t.full_name.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q) ||
          (t.room_number ?? '').toLowerCase().includes(q) ||
          (t.phone ?? '').includes(q)),
    )
  }, [tenants, filter, search])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenants overview"
        description="Invite tenants, assign rooms and manage tenancies."
        tabs={
          counts.all > 0 && (
            <FilterChips
              label="Filter tenants"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'View all', count: counts.all },
                { value: 'active', label: 'Active', count: counts.active },
                { value: 'invited', label: 'Invite pending', count: counts.invited },
                { value: 'inactive', label: 'Inactive', count: counts.inactive },
              ]}
            />
          )
        }
        actions={
          <Button className="hidden md:inline-flex" onClick={() => setInviting(true)}>
            <UserPlus /> Invite tenant
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="space-y-4">
          <StatGrid>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </StatGrid>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : counts.all === 0 ? (
        <EmptyState
          icon={Users}
          title="No tenants yet"
          description="Invite your first tenant. They will receive an email to activate their account."
          action={<Button onClick={() => setInviting(true)}><UserPlus /> Invite tenant</Button>}
        />
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Total tenants"
              value={String(counts.all)}
              icon={Users}
              accent="violet"
              sub={<span className="text-xs text-muted-foreground">{counts.housed} with a room</span>}
            />
            <StatTile
              label="Active"
              value={String(counts.active)}
              icon={UserCheck}
              accent="green"
              sub={<span className="text-xs text-muted-foreground">Signed in at least once</span>}
            />
            <StatTile
              label="Invite pending"
              value={String(counts.invited)}
              icon={MailCheck}
              accent="blue"
              sub={<span className="text-xs text-muted-foreground">Not activated yet</span>}
            />
            <StatTile
              label="Balance due"
              value={formatMoney(counts.owed, currency)}
              icon={AlertTriangle}
              accent="amber"
              sub={
                <span className={counts.owing ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                  {counts.owing ? `${counts.owing} ${counts.owing === 1 ? 'tenant' : 'tenants'} owing` : 'Nobody owes'}
                </span>
              }
            />
          </StatGrid>

          <Panel
            title="Tenant list"
            flush
            action={
              <SearchField
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, room, email…"
                aria-label="Search tenants"
                className="w-full sm:w-72"
              />
            }
          >
          {visible.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={Search} title="No matching tenants" description="Try a different filter or search." />
            </div>
          ) : (
            <>
              {/* Phones: one row per tenant */}
              <ul className="divide-y border-t md:hidden">
                {visible.map((t) => (
                  <li key={t.id}>
                    <Link to={`/tenants/${t.id}`} className="flex min-h-18 items-center gap-3 px-5 py-3.5 active:bg-muted">
                      <TenantAvatar tenant={t} className="size-10" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{t.full_name || t.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <RoomChip room={t.room_number} />
                          <TenantStatusBadge status={t.account_status} />
                        </div>
                      </div>
                      {t.outstanding_balance > 0 && (
                        <span className="shrink-0 text-right text-[13px] font-semibold text-destructive tabular">
                          {formatMoney(t.outstanding_balance, currency)}
                          <span className="block text-[11px] font-medium text-muted-foreground">due</span>
                        </span>
                      )}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Tablet and up: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Tenant name</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead className="text-right">Rent</TableHead>
                      <TableHead className="text-right">Balance due</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">Deposit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10 pr-5" aria-label="Open" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((t) => (
                      <TableRow key={t.id} className="group cursor-pointer" onClick={() => navigate(`/tenants/${t.id}`)}>
                        <TableCell className="pl-5">
                          <Link
                            to={`/tenants/${t.id}`}
                            className="flex items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <TenantAvatar tenant={t} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{t.full_name || '—'}</span>
                              <span className="block truncate text-xs text-muted-foreground">{t.email}</span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <RoomChip room={t.room_number} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={t.lease_rent ?? 0} currency={currency} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money value={t.outstanding_balance} currency={currency} tone="due" />
                        </TableCell>
                        <TableCell className="hidden text-right lg:table-cell">
                          <Money value={t.deposit_balance} currency={currency} />
                        </TableCell>
                        <TableCell>
                          <TenantStatusBadge status={t.account_status} />
                        </TableCell>
                        <TableCell className="pr-5">
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          </Panel>
        </>
      )}

      {counts.all > 0 && <Fab icon={UserPlus} label="Invite tenant" onClick={() => setInviting(true)} />}
      <InviteTenantDialog open={inviting} onOpenChange={setInviting} />
    </div>
  )
}
