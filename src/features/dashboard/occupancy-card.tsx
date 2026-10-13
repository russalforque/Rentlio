import { Panel, PanelLink } from '@/components/app/panel'
import type { RoomOverview } from '@/features/rooms/api'
import { RoomMap, RoomMapLegend } from '@/features/rooms/room-map'
import { formatMoney } from '@/lib/format'
import { OccupancyBar } from './kpi-strip'
import type { OccupancyCounts } from './metrics'

export function OccupancyCard({
  rooms,
  occupancy,
  currency,
  className,
}: {
  rooms: RoomOverview[]
  occupancy: OccupancyCounts
  currency: string
  className?: string
}) {
  const rentRoll = rooms.reduce((t, r) => t + (r.occupancy === 'occupied' ? (r.lease_rent ?? 0) : 0), 0)
  const potential = rooms.reduce((t, r) => t + (r.occupancy === 'vacant' ? r.monthly_rent : 0), 0)

  return (
    <Panel title="Occupancy" description="Select a room to open its tenant" className={className} action={<PanelLink to="/rooms">Manage rooms</PanelLink>}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <OccupancyBar {...occupancy} className="h-2.5" />
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-2" aria-hidden /> {occupancy.occupied} occupied
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground/30" aria-hidden /> {occupancy.vacant} vacant
            </li>
            {occupancy.maintenance > 0 && (
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" aria-hidden /> {occupancy.maintenance} maintenance
              </li>
            )}
          </ul>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-right max-sm:text-left">
          <div>
            <dt className="text-xs text-muted-foreground">Rent roll</dt>
            <dd className="text-sm font-semibold tabular">{formatMoney(rentRoll, currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vacancy upside</dt>
            <dd className="text-sm font-semibold tabular">+{formatMoney(potential, currency)}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-5 space-y-4 border-t pt-5">
        <RoomMap rooms={rooms} currency={currency} />
        <RoomMapLegend />
      </div>
    </Panel>
  )
}
