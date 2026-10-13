import { useMemo } from 'react'
import { useBillsSince } from '@/features/reports/api'
import type { RoomOverview } from '@/features/rooms/api'
import { currentPeriod, shiftPeriod } from '@/lib/dates'

/** Months of history loaded once for the KPIs, sparklines and revenue chart. */
const HISTORY = 12

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export interface MonthRow {
  period: string
  billed: number
  collected: number
  outstanding: number
}

/** Billed, collected and still-open totals per billing month, oldest first. */
export function useMonthlyTotals() {
  const from = shiftPeriod(currentPeriod(), -(HISTORY - 1))
  const query = useBillsSince(from)
  const months = useMemo(() => {
    const byPeriod = new Map<string, MonthRow>()
    for (let i = 0; i < HISTORY; i++) {
      const period = shiftPeriod(from, i)
      byPeriod.set(period, { period, billed: 0, collected: 0, outstanding: 0 })
    }
    // Drafts are not owed yet; they count once finalized and sent.
    for (const b of query.data ?? []) {
      const row = b.is_finalized ? byPeriod.get(b.period) : undefined
      if (!row) continue
      row.billed += b.total_amount
      row.collected += b.amount_paid
      row.outstanding += b.balance
    }
    return [...byPeriod.values()]
  }, [query.data, from])
  return { ...query, months }
}

export interface OccupancyCounts {
  occupied: number
  maintenance: number
  vacant: number
}

export function countOccupancy(rooms: RoomOverview[]): OccupancyCounts {
  const counts = { occupied: 0, maintenance: 0, vacant: 0 }
  for (const r of rooms) counts[r.occupancy]++
  return counts
}
