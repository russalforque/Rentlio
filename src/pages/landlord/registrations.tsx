import { ChevronRight, Clock, Inbox, Search, UserCheck, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { FilterChips, Panel, SearchField, StatGrid, StatGridSkeleton, StatTile } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useRegistrations, type RegistrationRequest } from '@/features/registrations/api'
import { RegistrationStatusBadge } from '@/features/registrations/registration-status-badge'
import { ReviewRegistrationDialog } from '@/features/registrations/review-dialog'
import { formatDate } from '@/lib/format'

type Filter = 'pending' | 'approved' | 'rejected' | 'all'

const EMPTY: Record<Filter, string> = {
  pending: 'No registrations are waiting for review.',
  approved: 'No approved registrations yet.',
  rejected: 'No rejected registrations.',
  all: 'Nobody has registered yet.',
}

export function RegistrationsPage() {
  const { data, isPending, error, refetch } = useRegistrations()
  const [filter, setFilter] = useState<Filter>('pending')
  const [search, setSearch] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: 0, awaitingEmail: 0 }
    for (const r of data ?? []) {
      c.all++
      c[r.status]++
      if (r.status === 'pending' && !r.email_verified_at) c.awaitingEmail++
    }
    return c
  }, [data])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!q ||
          r.full_name.toLowerCase().includes(q) ||
          r.email.includes(q) ||
          (r.phone ?? '').includes(q) ||
          (r.requested_room ?? '').toLowerCase().includes(q)),
    )
  }, [data, filter, search])

  // Looked up by id so the dialog shows fresh data after a review.
  const reviewing: RegistrationRequest | null = data?.find((r) => r.id === reviewingId) ?? null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registrations"
        description="Tenants who signed up themselves. Verify who they are before giving them access."
        tabs={
          <FilterChips
            label="Filter registrations"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'pending', label: 'Pending', count: counts.pending },
              { value: 'approved', label: 'Approved', count: counts.approved },
              { value: 'rejected', label: 'Rejected', count: counts.rejected },
              { value: 'all', label: 'History', count: counts.all },
            ]}
          />
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="space-y-4">
          <StatGridSkeleton count={3} />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <>
          <StatGrid className="grid-cols-3 lg:grid-cols-3">
            <StatTile
              label="Awaiting review"
              value={String(counts.pending - counts.awaitingEmail)}
              icon={Inbox}
              accent="amber"
              sub={<span className="text-xs text-muted-foreground">Email verified</span>}
            />
            <StatTile
              label="Email unverified"
              value={String(counts.awaitingEmail)}
              icon={Clock}
              accent="blue"
              sub={<span className="text-xs text-muted-foreground">Cannot be approved yet</span>}
            />
            <StatTile
              label="Approved"
              value={String(counts.approved)}
              icon={UserCheck}
              accent="green"
              sub={<span className="text-xs text-muted-foreground">{counts.rejected} rejected</span>}
            />
          </StatGrid>

          <Panel
            title={filter === 'all' ? 'Registration history' : 'Requests'}
            flush
            action={
              <SearchField
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, room…"
                aria-label="Search registrations"
                className="w-full sm:w-72"
              />
            }
          >
            {visible.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  icon={search ? Search : filter === 'rejected' ? UserX : Inbox}
                  title={search ? 'No matching registrations' : 'Nothing here'}
                  description={search ? 'Try a different search.' : EMPTY[filter]}
                />
              </div>
            ) : (
              <>
                {/* Phones: one card per request */}
                <ul className="divide-y border-t md:hidden">
                  {visible.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setReviewingId(r.id)}
                        className="flex min-h-18 w-full items-center gap-3 px-5 py-3.5 text-left active:bg-muted"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{r.full_name || r.email}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">{r.email}</span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-2">
                            <RegistrationStatusBadge request={r} />
                            <span className="text-xs text-muted-foreground">
                              {r.requested_room ? `Room ${r.requested_room}` : 'No room given'} · {formatDate(r.created_at.slice(0, 10))}
                            </span>
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Tablet and up: table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Applicant</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Requested room</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10 pr-5" aria-label="Review" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((r) => (
                        <TableRow key={r.id} className="group cursor-pointer" onClick={() => setReviewingId(r.id)}>
                          <TableCell className="pl-5">
                            <button
                              type="button"
                              className="block max-w-72 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              onClick={(e) => {
                                e.stopPropagation()
                                setReviewingId(r.id)
                              }}
                            >
                              <span className="block truncate font-semibold">{r.full_name || '—'}</span>
                              <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
                            </button>
                          </TableCell>
                          <TableCell className="text-[13px]">{r.phone ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>
                            {r.requested_room ? (
                              <span className="inline-flex rounded-md border bg-muted/60 px-2 py-0.5 text-xs font-semibold tabular">
                                Room {r.requested_room}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-[13px] text-muted-foreground">{formatDate(r.created_at.slice(0, 10))}</TableCell>
                          <TableCell>
                            <RegistrationStatusBadge request={r} />
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

      <ReviewRegistrationDialog request={reviewing} onOpenChange={(o) => !o && setReviewingId(null)} />
    </div>
  )
}
