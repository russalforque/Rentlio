import { CircleAlert, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatMoney, initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RoomOverview } from './api'

const TILE: Record<RoomOverview['occupancy'], string> = {
  occupied: 'border-transparent bg-chart-2/12 hover:bg-chart-2/20',
  vacant: 'border-dashed border-foreground/20 bg-card hover:bg-accent',
  maintenance: 'border-transparent bg-warning/16 hover:bg-warning/24',
}

const STATE_LABEL: Record<RoomOverview['occupancy'], string> = {
  occupied: 'Occupied',
  vacant: 'Vacant',
  maintenance: 'Under maintenance',
}

function floorOf(r: RoomOverview): number {
  return r.floor ?? Number(r.room_number.charAt(0))
}

function RoomTile({ room, currency }: { room: RoomOverview; currency: string }) {
  const owes = room.occupancy === 'occupied' && room.outstanding_balance > 0
  const description = [
    `Room ${room.room_number}`,
    STATE_LABEL[room.occupancy],
    room.tenant_name,
    owes ? `${formatMoney(room.outstanding_balance, currency)} outstanding` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={room.tenant_id ? `/tenants/${room.tenant_id}` : '/rooms'}
          aria-label={description}
          className={cn(
            'relative flex aspect-square min-h-11 flex-col sm:aspect-auto sm:h-14 items-center justify-center rounded-lg border text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            TILE[room.occupancy],
          )}
        >
          <span className="text-[13px] leading-none font-semibold tabular">{room.room_number}</span>
          <span className="mt-1 text-[10px] leading-none font-semibold text-muted-foreground" aria-hidden>
            {room.occupancy === 'occupied' ? initials(room.tenant_name) : room.occupancy === 'maintenance' ? <Wrench className="size-3" /> : 'Free'}
          </span>
          {owes && <CircleAlert className="absolute top-1 right-1 size-3.5 fill-card text-destructive" aria-hidden />}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top">{description}</TooltipContent>
    </Tooltip>
  )
}

/** Every room at a glance, grouped by floor. */
export function RoomMap({ rooms, currency }: { rooms: RoomOverview[]; currency: string }) {
  const floors = [...new Set(rooms.map(floorOf))].sort((a, b) => a - b)
  return (
    <div className="space-y-4">
      {floors.map((f) => (
        <div key={f}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Floor {f}</p>
          <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-7 sm:gap-2" aria-label={`Floor ${f} rooms`}>
            {rooms
              .filter((r) => floorOf(r) === f)
              .map((r) => (
                <li key={r.id}>
                  <RoomTile room={r} currency={currency} />
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function RoomMapLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-chart-2/30" aria-hidden /> Occupied
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-3 rounded border border-dashed border-foreground/40" aria-hidden /> Vacant
      </li>
      <li className="flex items-center gap-1.5">
        <Wrench className="size-3" aria-hidden /> Maintenance
      </li>
      <li className="flex items-center gap-1.5">
        <CircleAlert className="size-3.5 text-destructive" aria-hidden /> Balance owed
      </li>
    </ul>
  )
}
