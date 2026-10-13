import { BedDouble, BedSingle, Building2, ChevronRight, CircleCheck, DoorOpen, Plus, Tags, TriangleAlert, Wallet, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Fab } from '@/components/app/fab'
import { ActionsMenu, PageHeader } from '@/components/app/page-header'
import { Callout, FilterChips, InitialsBadge, Panel, SearchField, StatGrid, StatGridSkeleton, StatTile, StatusPill, type Tone } from '@/components/app/panel'
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

type Filter = 'all' | RoomOverview['occupancy']

const OCCUPANCY_STYLE: Record<RoomOverview['occupancy'], { label: string; tone: Tone }> = {
  occupied: { label: 'Occupied', tone: 'success' },
  vacant: { label: 'Vacant', tone: 'info' },
  maintenance: { label: 'Maintenance', tone: 'warning' },
}

interface RoomCardProps {
  room: RoomOverview
  beds: RoomBedWithType[]
  currency: string
  onOpen: () => void
}

function RoomCard({ room, beds, currency, onOpen }: RoomCardProps) {
  const style = OCCUPANCY_STYLE[room.occupancy]
  const rent = room.lease_rent ?? room.monthly_rent
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Room ${room.room_number}, ${style.label}${room.tenant_name ? `, ${room.tenant_name}` : ''}. Edit room`}
      className={cn(
        'group relative flex min-h-40 flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        room.occupancy === 'vacant' && 'border-dashed',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="leading-none">
          <span className="block text-xs text-muted-foreground">Room</span>
          <span className="font-display mt-1 block text-2xl font-semibold">{room.room_number}</span>
        </p>
        <StatusPill tone={style.tone}>{style.label}</StatusPill>
      </div>

      <div className="mt-4 flex min-w-0 items-center gap-2">
        {room.tenant_name ? (
          <>
            <InitialsBadge text={initials(room.tenant_name)} className="size-7 text-[10px]" />
            <span className="truncate text-[13px] font-semibold">{room.tenant_name}</span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {room.occupancy === 'maintenance' ? <Wrench className="size-3.5" aria-hidden /> : <DoorOpen className="size-3.5" aria-hidden />}
            {room.occupancy === 'maintenance' ? 'Not available' : 'Ready for a tenant'}
          </span>
        )}
      </div>
      {beds.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <BedDouble className="size-3.5 shrink-0" aria-hidden />
          {beds.map((b) => `${b.quantity} × ${b.bed_type.name}`).join(' · ')}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1 border-t pt-3">
        <p className="text-[13px] tabular">
          {rent > 0 ? (
            <>
              <span className="font-semibold">{formatMoney(rent, currency)}</span>
              <span className="text-muted-foreground">/mo</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold text-warning-foreground">
              <Tags className="size-3.5" aria-hidden /> Set rent
            </span>
          )}
        </p>
        {room.outstanding_balance > 0 && (
          <span className="rounded-md bg-destructive/8 px-1.5 py-0.5 text-[11px] font-semibold text-destructive tabular" title="Outstanding balance">
            {formatMoney(room.outstanding_balance, currency)} due
          </span>
        )}
      </div>
    </button>
  )
}

/** Phones: one full-width row per room, the essentials at a glance. */
function RoomRow({ room, beds, currency, onOpen }: RoomCardProps) {
  const style = OCCUPANCY_STYLE[room.occupancy]
  const rent = room.lease_rent ?? room.monthly_rent
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Room ${room.room_number}, ${style.label}${room.tenant_name ? `, ${room.tenant_name}` : ''}. Edit room`}
      className="flex min-h-18 w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      <span
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-xl border text-[15px] font-semibold tabular',
          room.occupancy === 'occupied' && 'border-transparent bg-chart-2/12',
          room.occupancy === 'vacant' && 'border-dashed border-foreground/25',
          room.occupancy === 'maintenance' && 'border-transparent bg-warning/16',
        )}
        aria-hidden
      >
        {room.room_number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">
          {room.tenant_name ?? (room.occupancy === 'maintenance' ? 'Under maintenance' : 'Vacant')}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <span className="shrink-0 tabular">
            {rent > 0 ? `${formatMoney(rent, currency)}/mo` : <span className="font-semibold text-warning-foreground">Set rent</span>}
          </span>
          {beds.length > 0 && <span className="truncate">· {beds.map((b) => `${b.quantity} × ${b.bed_type.name}`).join(', ')}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill tone={style.tone}>{style.label}</StatusPill>
        {room.outstanding_balance > 0 && (
          <span className="text-xs font-semibold text-destructive tabular">{formatMoney(room.outstanding_balance, currency)} due</span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

export function RoomsPage() {
  const { data: rooms, isPending, error, refetch } = useRoomOverview()
  const { data: roomBeds } = useRoomBeds()
  const currency = useCurrency()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<RoomOverview | null>(null)
  const [creating, setCreating] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bedTypesOpen, setBedTypesOpen] = useState(false)

  const counts = useMemo(() => {
    const c = { all: 0, occupied: 0, vacant: 0, maintenance: 0, unpriced: 0, rentRoll: 0 }
    for (const r of rooms ?? []) {
      c.all++
      c[r.occupancy]++
      if (r.monthly_rent <= 0) c.unpriced++
      if (r.occupancy === 'occupied') c.rentRoll += r.lease_rent ?? 0
    }
    return c
  }, [rooms])

  const floorsCount = useMemo(() => new Set((rooms ?? []).map((r) => r.floor)).size, [rooms])

  const floors = useMemo(() => {
    const q = search.trim().toLowerCase()
    const visible = (rooms ?? []).filter(
      (r) =>
        (filter === 'all' || r.occupancy === filter) &&
        (!q || r.room_number.toLowerCase().includes(q) || (r.tenant_name ?? '').toLowerCase().includes(q)),
    )
    const groups = new Map<number | null, RoomOverview[]>()
    for (const r of visible) groups.set(r.floor, [...(groups.get(r.floor) ?? []), r])
    return [...groups.entries()].sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
  }, [rooms, filter, search])

  const visibleCount = floors.reduce((t, [, list]) => t + list.length, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rooms overview"
        description={rooms?.length ? 'Select a room to edit it. Assign tenants from the Tenants page.' : 'Add your rooms, then assign tenants to them.'}
        tabs={
          !!rooms?.length && (
            <FilterChips
              label="Filter rooms"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'View all', count: counts.all },
                { value: 'occupied', label: 'Occupied', count: counts.occupied },
                { value: 'vacant', label: 'Vacant', count: counts.vacant },
                { value: 'maintenance', label: 'Maintenance', count: counts.maintenance },
              ]}
            />
          )
        }
        actions={
          <>
            <ActionsMenu
              actions={[
                { label: 'Bed types', icon: BedSingle, onSelect: () => setBedTypesOpen(true) },
                { label: 'Set rent for all rooms', icon: Tags, onSelect: () => setBulkOpen(true), disabled: !rooms?.length },
              ]}
            />
            <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setBedTypesOpen(true)}>
              <BedSingle /> Bed types
            </Button>
            <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setBulkOpen(true)} disabled={!rooms?.length}>
              <Tags /> Set rent
            </Button>
            <Button className="hidden md:inline-flex" onClick={() => setCreating(true)}>
              <Plus /> Add room
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="space-y-6">
          <StatGridSkeleton />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : counts.all === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="No rooms yet"
          description="Add your rooms to start assigning tenants."
          action={<Button onClick={() => setCreating(true)}><Plus /> Add room</Button>}
        />
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Total rooms"
              value={String(counts.all)}
              icon={Building2}
              accent="violet"
              sub={<span className="text-xs text-muted-foreground">{floorsCount} {floorsCount === 1 ? 'floor' : 'floors'}</span>}
            />
            <StatTile
              label="Occupied"
              value={String(counts.occupied)}
              icon={CircleCheck}
              accent="green"
              sub={<span className="text-xs text-muted-foreground">{counts.all ? Math.round((counts.occupied / counts.all) * 100) : 0}% occupancy</span>}
            />
            <StatTile
              label="Vacant"
              value={String(counts.vacant)}
              icon={DoorOpen}
              accent="blue"
              sub={<span className="text-xs text-muted-foreground">{counts.maintenance} under maintenance</span>}
            />
            <StatTile
              label="Monthly rent roll"
              value={formatMoney(counts.rentRoll, currency)}
              icon={Wallet}
              accent="amber"
              sub={<span className="text-xs text-muted-foreground">Occupied rooms</span>}
            />
          </StatGrid>

          {counts.unpriced > 0 && (
            <Callout
              tone="warning"
              icon={TriangleAlert}
              action={
                <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                  <Tags /> Set rent
                </Button>
              }
            >
              <span className="font-semibold">
                {counts.unpriced} {counts.unpriced === 1 ? 'room' : 'rooms'}
              </span>{' '}
              {counts.unpriced === 1 ? 'has' : 'have'} no standard rent yet. Set it once for all
              rooms, then fine-tune individual rooms.
            </Callout>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted-foreground">
              Showing <span className="font-semibold text-foreground tabular">{visibleCount}</span> of {counts.all} rooms
            </p>
            <SearchField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search room or tenant"
              aria-label="Search rooms"
              className="sm:w-72"
            />
          </div>

          {floors.length === 0 ? (
            <EmptyState icon={BedDouble} title="No matching rooms" description="Try a different filter or search." />
          ) : (
            <div className="space-y-4">
              {floors.map(([floor, list]) => (
                <Panel
                  key={floor ?? 'none'}
                  title={floor === null ? 'No floor set' : `Floor ${floor}`}
                  description={`${list.filter((r) => r.occupancy === 'occupied').length} of ${list.length} occupied`}
                >
                  <ul className="-mx-5 divide-y border-t sm:hidden">
                    {list.map((room) => (
                      <li key={room.id}>
                        <RoomRow room={room} beds={roomBeds?.get(room.id) ?? []} currency={currency} onOpen={() => setEditing(room)} />
                      </li>
                    ))}
                  </ul>
                  <div className="hidden grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3 sm:grid">
                    {list.map((room) => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        beds={roomBeds?.get(room.id) ?? []}
                        currency={currency}
                        onOpen={() => setEditing(room)}
                      />
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </>
      )}

      {!!rooms?.length && <Fab icon={Plus} label="Add room" onClick={() => setCreating(true)} />}
      <RoomFormDialog open={creating} onOpenChange={setCreating} />
      <RoomFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} room={editing ?? undefined} />
      <BulkRentDialog open={bulkOpen} onOpenChange={setBulkOpen} rooms={rooms ?? []} />
      <BedTypesDialog open={bedTypesOpen} onOpenChange={setBedTypesOpen} />
    </div>
  )
}
