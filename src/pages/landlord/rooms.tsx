import { ArrowRight, BedDouble, BedSingle, Building2, ChevronRight, CircleCheck, DoorOpen, Layers3, Pencil, Plus, Tags, TriangleAlert, Users, Wallet, Wrench, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { NativeSelect } from '@/components/app/native-select'
import { ActionsMenu, PageHeader } from '@/components/app/page-header'
import { Callout, FilterChips, InitialsBadge, SearchField, StatGrid, StatGridSkeleton, StatTile, StatusPill, type Tone } from '@/components/app/panel'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRoomBeds, useRoomOverview, type RoomBedWithType, type RoomOverview } from '@/features/rooms/api'
import { BedTypesDialog } from '@/features/rooms/bed-types-dialog'
import { BulkRentDialog } from '@/features/rooms/bulk-rent-dialog'
import { RoomFormDialog } from '@/features/rooms/room-form-dialog'
import { useCurrency } from '@/hooks/use-settings'
import { formatMoney, initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import './rooms.css'

type Filter = 'all' | RoomOverview['occupancy']
type Sort = 'room' | 'rent-asc' | 'rent-desc' | 'balance'

const OCCUPANCY_STYLE: Record<RoomOverview['occupancy'], { label: string; tone: Tone; icon: typeof DoorOpen }> = {
  occupied: { label: 'Occupied', tone: 'success', icon: BedDouble },
  vacant: { label: 'Vacant', tone: 'info', icon: DoorOpen },
  maintenance: { label: 'Maintenance', tone: 'warning', icon: Wrench },
}

const roomRent = (room: RoomOverview) => room.lease_rent ?? room.monthly_rent
const floorLabel = (floor: number | null) => floor === null ? 'Unassigned floor' : `Floor ${floor}`

interface RoomCardProps {
  room: RoomOverview
  beds: RoomBedWithType[]
  currency: string
  onOpen: () => void
}

function RoomCard({ room, beds, currency, onOpen }: RoomCardProps) {
  const { label, tone, icon: Icon } = OCCUPANCY_STYLE[room.occupancy]
  const rent = roomRent(room)

  return (
    <article className="room-card flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/25 focus-within:border-foreground/25" aria-label={`Room ${room.room_number}`}>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn(
              'grid size-11 shrink-0 place-items-center rounded-xl',
              room.occupancy === 'occupied' && 'bg-success/8 text-success',
              room.occupancy === 'vacant' && 'bg-info/8 text-info',
              room.occupancy === 'maintenance' && 'bg-warning/12 text-warning-foreground',
            )}>
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Room</p>
              <h3 className="font-display mt-0.5 text-xl leading-tight font-semibold wrap-anywhere">{room.room_number}</h3>
            </div>
          </div>
          <StatusPill tone={tone} className="mt-1 shrink-0">{label}</StatusPill>
        </div>

        <div className="mt-5 flex min-w-0 items-center gap-2.5">
          {room.tenant_name ? (
            <>
              <InitialsBadge text={initials(room.tenant_name)} className="size-8 bg-muted text-[11px]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={room.tenant_name}>{room.tenant_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Current tenant</p>
              </div>
            </>
          ) : (
            <div className="flex min-h-10 flex-col justify-center">
              <p className={cn('text-sm font-medium', room.occupancy === 'vacant' ? 'text-info' : 'text-muted-foreground')}>
                {room.occupancy === 'maintenance' ? 'Under maintenance' : 'Ready for a tenant'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {room.occupancy === 'maintenance' ? 'Unavailable for assignment' : 'No tenant assigned'}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Users className="size-3.5 shrink-0" aria-hidden />{room.capacity} {room.capacity === 1 ? 'person' : 'people'}</span>
          <span className="inline-flex min-w-0 items-start gap-1.5">
            <BedSingle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="wrap-anywhere">{beds.length ? beds.map((bed) => `${bed.quantity} × ${bed.bed_type.name}`).join(' · ') : 'No beds listed'}</span>
          </span>
        </div>

        {room.is_under_maintenance && room.occupancy === 'occupied' && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warning-foreground"><Wrench className="size-3.5 shrink-0" aria-hidden />Maintenance flagged</p>
        )}

        <div className="mt-auto pt-4">
          <div className="border-t pt-3.5">
            <p className="text-xs text-muted-foreground">{room.lease_rent !== null ? 'Lease rent' : 'Standard rent'}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-lg font-semibold tracking-tight tabular wrap-anywhere">
              {rent > 0 ? <>{formatMoney(rent, currency)}<span className="text-xs font-normal tracking-normal text-muted-foreground">/ month</span></> : <span className="inline-flex items-center gap-1.5 text-sm text-warning-foreground"><Tags className="size-3.5" aria-hidden />Rent not set</span>}
            </p>
            <div className="mt-2 min-h-4">
              {room.outstanding_balance > 0 ? (
                <p className="flex flex-wrap items-center gap-x-1 text-xs font-medium text-destructive tabular wrap-anywhere">
                  <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                  {formatMoney(room.outstanding_balance, currency)} outstanding
                </p>
              ) : room.occupancy === 'occupied' ? (
                <p className="flex items-center gap-1 text-xs text-success"><CircleCheck className="size-3 shrink-0" aria-hidden /> No outstanding balance</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 border-t bg-muted/25 px-3 py-1.5 sm:px-4">
        <Button variant="ghost" onClick={onOpen} aria-label={`Edit room ${room.room_number}`} className="min-h-11 px-2 text-xs dense:min-h-9">
          <Pencil className="size-3.5" /> Edit room
        </Button>
        {room.tenant_id && (
          <Link to={`/tenants/${room.tenant_id}`} aria-label={`Tenant and billing for room ${room.room_number}`} className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dense:min-h-9">
            Tenant & billing <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </article>
  )
}

export function RoomsPage() {
  const { data: rooms, isPending, error, refetch } = useRoomOverview()
  const { data: roomBeds } = useRoomBeds()
  const currency = useCurrency()
  const [filter, setFilter] = useState<Filter>('all')
  const [floorFilter, setFloorFilter] = useState('all')
  const [sort, setSort] = useState<Sort>('room')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<RoomOverview | null>(null)
  const [creating, setCreating] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bedTypesOpen, setBedTypesOpen] = useState(false)

  const counts = useMemo(() => {
    const c = { all: 0, occupied: 0, vacant: 0, maintenance: 0, unpriced: 0, rentRoll: 0 }
    for (const room of rooms ?? []) {
      c.all++
      c[room.occupancy]++
      if (room.monthly_rent <= 0) c.unpriced++
      if (room.occupancy === 'occupied') c.rentRoll += room.lease_rent ?? 0
    }
    return c
  }, [rooms])

  const floorOptions = useMemo(() => [...new Set((rooms ?? []).map((room) => room.floor))]
    .sort((a, b) => (a ?? Infinity) - (b ?? Infinity)), [rooms])
  const assignedFloors = floorOptions.filter((floor) => floor !== null).length
  const occupancy = counts.all ? Math.round(counts.occupied / counts.all * 100) : 0
  const hasFilters = filter !== 'all' || floorFilter !== 'all' || search.trim() !== ''

  const floors = useMemo(() => {
    const q = search.trim().toLowerCase()
    const visible = (rooms ?? []).filter((room) =>
      (filter === 'all' || room.occupancy === filter) &&
      (floorFilter === 'all' || String(room.floor) === floorFilter) &&
      (!q || room.room_number.toLowerCase().includes(q) || (room.tenant_name ?? '').toLowerCase().includes(q)),
    )
    visible.sort((a, b) => {
      const byNumber = a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
      if (sort === 'rent-asc') return roomRent(a) - roomRent(b) || byNumber
      if (sort === 'rent-desc') return roomRent(b) - roomRent(a) || byNumber
      if (sort === 'balance') return b.outstanding_balance - a.outstanding_balance || byNumber
      return byNumber
    })
    const groups = new Map<number | null, RoomOverview[]>()
    for (const room of visible) {
      const group = groups.get(room.floor)
      if (group) group.push(room)
      else groups.set(room.floor, [room])
    }
    return [...groups.entries()].sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
  }, [rooms, filter, floorFilter, search, sort])

  const visibleCount = floors.reduce((total, [, list]) => total + list.length, 0)

  function clearFilters() {
    setFilter('all')
    setFloorFilter('all')
    setSearch('')
  }

  return (
    <div className="rooms-page space-y-6">
      <PageHeader
        eyebrow="PROPERTY MANAGEMENT"
        title="Rooms overview"
        description="Manage room availability, tenants, and rent in one place."
        actions={
          <>
            <Button variant="outline" className="hidden lg:inline-flex" onClick={() => setBedTypesOpen(true)}><BedSingle /> Bed types</Button>
            <Button variant="outline" className="hidden lg:inline-flex" onClick={() => setBulkOpen(true)} disabled={!rooms?.length}><Tags /> Set rent</Button>
            <Button onClick={() => setCreating(true)} className="rooms-add-button"><Plus /> Add room</Button>
            <ActionsMenu
              className="sm:inline-flex lg:hidden"
              label="Room actions"
              actions={[
                { label: 'Bed types', icon: BedSingle, onSelect: () => setBedTypesOpen(true) },
                { label: 'Set rent for all rooms', icon: Tags, onSelect: () => setBulkOpen(true), disabled: !rooms?.length },
              ]}
            />
          </>
        }
      />

      {error ? <ErrorState error={error} onRetry={() => refetch()} /> : isPending ? (
        <div className="space-y-6" role="status" aria-label="Loading rooms">
          <StatGridSkeleton />
          <Skeleton className="h-36 rounded-xl" />
          <div className="rooms-grid">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-80 rounded-xl" />)}</div>
          <span className="sr-only">Loading rooms…</span>
        </div>
      ) : counts.all === 0 ? (
        <EmptyState icon={Building2} title="Make room for your first tenant" description="Add a room, set its monthly rent, and keep availability organized as your property grows." action={<Button onClick={() => setCreating(true)}><Plus /> Add your first room</Button>} className="min-h-80" />
      ) : (
        <>
          <StatGrid>
            <StatTile label="Total rooms" value={String(counts.all)} icon={Building2} sub={assignedFloors ? `Across ${assignedFloors} ${assignedFloors === 1 ? 'floor' : 'floors'}` : 'No floors assigned'} />
            <StatTile label="Occupancy" value={`${occupancy}%`} icon={CircleCheck} sub={`${counts.occupied} of ${counts.all} rooms occupied`} />
            <StatTile label="Available" value={String(counts.vacant)} icon={DoorOpen} sub={`${counts.maintenance} under maintenance`} />
            <StatTile label="Rent roll" value={formatMoney(counts.rentRoll, currency)} icon={Wallet} sub="Monthly, occupied rooms" />
          </StatGrid>

          {counts.unpriced > 0 && (
            <Callout tone="warning" icon={TriangleAlert} action={<Button variant="outline" onClick={() => setBulkOpen(true)} className="w-full sm:w-auto"><Tags /> Set standard rent <ChevronRight className="size-3.5" /></Button>}>
              <p className="font-semibold">{counts.unpriced} {counts.unpriced === 1 ? 'room needs' : 'rooms need'} a standard rent</p>
              <p className="mt-0.5 text-muted-foreground">Set a starting rate for all rooms, then adjust each room as needed.</p>
            </Callout>
          )}

          <section aria-label="Find and filter rooms" className="surface min-w-0 p-4 sm:p-5">
            <div className="rooms-controls">
              <div className="rooms-search min-w-0">
                <label htmlFor="room-search" className="mb-2 block text-xs font-medium">Find a room</label>
                <SearchField id="room-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search room number or tenant…" aria-controls="rooms-results" />
              </div>
              <div className="min-w-0">
                <label htmlFor="room-floor" className="mb-2 block text-xs font-medium">Floor</label>
                <NativeSelect id="room-floor" value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)} className="text-base dense:text-[13px]" aria-controls="rooms-results">
                  <option value="all">All floors</option>
                  {floorOptions.map((floor) => <option key={String(floor)} value={String(floor)}>{floor === null ? 'Not set' : floorLabel(floor)}</option>)}
                </NativeSelect>
              </div>
              <div className="min-w-0">
                <label htmlFor="room-sort" className="mb-2 block text-xs font-medium">Sort within floors</label>
                <NativeSelect id="room-sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="text-base dense:text-[13px]" aria-controls="rooms-results">
                  <option value="room">Room number</option>
                  <option value="rent-asc">Rent: low to high</option>
                  <option value="rent-desc">Rent: high to low</option>
                  <option value="balance">Highest balance</option>
                </NativeSelect>
              </div>
            </div>
            <div className="mt-4 border-t pt-3">
              <FilterChips label="Room availability" value={filter} onChange={setFilter} className="mx-0 px-0" options={[
                { value: 'all', label: 'All rooms', count: counts.all },
                { value: 'occupied', label: 'Occupied', count: counts.occupied },
                { value: 'vacant', label: 'Vacant', count: counts.vacant },
                { value: 'maintenance', label: 'Maintenance', count: counts.maintenance },
              ]} />
            </div>
          </section>

          <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p role="status" aria-live="polite" aria-atomic="true" className="text-[13px] text-muted-foreground">
              Showing <span className="font-semibold text-foreground tabular">{visibleCount}</span> of {counts.all} rooms
              <span className="hidden sm:inline"> · Grouped by floor</span>
            </p>
            {hasFilters && <Button variant="ghost" onClick={clearFilters} className="min-h-11 text-xs dense:min-h-9"><X className="size-3.5" /> Clear filters</Button>}
          </div>

          <div id="rooms-results">
            {floors.length === 0 ? (
              <EmptyState icon={BedDouble} title="No rooms found" description="Try another room number, tenant name, or availability filter." action={<Button variant="outline" onClick={clearFilters}><X /> Clear filters</Button>} />
            ) : (
              <div className="space-y-7">
                {floors.map(([floor, list]) => {
                  const occupied = list.filter((room) => room.occupancy === 'occupied').length
                  return (
                    <section key={String(floor)} aria-label={floorLabel(floor)}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <Layers3 className="size-4 text-muted-foreground" aria-hidden />
                          <h2 className="text-sm font-semibold">{floorLabel(floor)}</h2>
                          <span className="rounded-md border bg-card px-2 py-0.5 text-xs text-muted-foreground tabular">{list.length} {list.length === 1 ? 'room' : 'rooms'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{occupied} occupied{hasFilters ? ' in results' : ` · ${list.length - occupied} unoccupied`}</p>
                      </div>
                      <ul className="rooms-grid">
                        {list.map((room) => <li key={room.id} className="flex min-w-0 [&>article]:w-full"><RoomCard room={room} beds={roomBeds?.get(room.id) ?? []} currency={currency} onOpen={() => setEditing(room)} /></li>)}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      <RoomFormDialog open={creating} onOpenChange={setCreating} />
      <RoomFormDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)} room={editing ?? undefined} />
      <BulkRentDialog open={bulkOpen} onOpenChange={setBulkOpen} rooms={rooms ?? []} />
      <BedTypesDialog open={bedTypesOpen} onOpenChange={setBedTypesOpen} />
    </div>
  )
}
