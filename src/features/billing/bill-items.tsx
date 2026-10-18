import { Droplets, Home, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Enums, Tables } from '@/lib/database.types'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const KIND_ICON: Record<Enums<'bill_item_kind'>, LucideIcon> = {
  rent: Home,
  electricity: Zap,
  water: Droplets,
  other: Plus,
}

function detail(item: Tables<'bill_items'>, currency: string): string | null {
  if (item.kind === 'electricity') {
    const rate = item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    return `${item.quantity.toLocaleString()} kWh × ${currency} ${rate} / kWh`
  }
  if (item.kind === 'water' && item.meter_reading_id) {
    return `${item.quantity.toLocaleString()} m³ × ${formatMoney(item.unit_price, currency)}`
  }
  return null
}

interface BillItemsProps {
  items: Tables<'bill_items'>[]
  currency: string
  total: number
  paid: number
  balance: number
  /** Amount paid on each line (bill item id -> amount), from the payment allocations. */
  paidByItem?: Map<string, number>
  /** Landlord-only editing. Rent and extra charges are editable; utilities follow the meter readings. */
  onEdit?: (item: Tables<'bill_items'>) => void
  onRemove?: (item: Tables<'bill_items'>) => void
}

/** "Paid" / "₱1,200.00 paid · ₱300.00 left" under a line, once money has been applied to the bill. */
function LineStatus({ amount, paid, currency }: { amount: number; paid: number; currency: string }) {
  if (paid <= 0) return null
  if (paid >= amount) return <span className="font-medium text-success">Paid</span>
  return (
    <span>
      <span className="font-medium text-success">{formatMoney(paid, currency)} paid</span> · {formatMoney(amount - paid, currency)} left
    </span>
  )
}

export function BillItems({ items, currency, total, paid, balance, paidByItem, onEdit, onRemove }: BillItemsProps) {
  // Room for one action (edit) or two (edit + remove, on extra charges only).
  const twoActions = !!onRemove && items.some((i) => i.kind === 'other')
  return (
    <div>
      <ul className="divide-y">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind]
          const sub = detail(item, currency)
          const editable = onEdit && (item.kind === 'rent' || item.kind === 'other')
          return (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.description}</p>
                {sub && <p className="text-[12px] text-muted-foreground tabular">{sub}</p>}
                {paidByItem && paid > 0 && (
                  <p className="text-[12px] text-muted-foreground tabular">
                    <LineStatus amount={item.amount} paid={paidByItem.get(item.id) ?? 0} currency={currency} />
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular">{formatMoney(item.amount, currency)}</span>
              {onEdit && (
                <div className={cn('flex shrink-0 justify-end', twoActions ? 'w-20 md:w-16' : 'w-10 md:w-8')}>
                  {editable && (
                    <Button variant="ghost" size="icon" className="size-10 dense:size-7" onClick={() => onEdit(item)} aria-label={`Edit ${item.description}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {onRemove && item.kind === 'other' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 text-destructive hover:text-destructive dense:size-7"
                      onClick={() => onRemove(item)}
                      aria-label={`Remove ${item.description}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <dl className={cn('mt-2 space-y-1.5 border-t pt-3 text-sm', onEdit && (twoActions ? 'pr-20 md:pr-16' : 'pr-10 md:pr-8'))}>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-semibold tabular">{formatMoney(total, currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="tabular text-success">− {formatMoney(paid, currency)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-base">
          <dt className="font-semibold">Balance</dt>
          <dd className={cn('font-bold tabular', balance > 0 && 'text-destructive')}>{formatMoney(balance, currency)}</dd>
        </div>
      </dl>
    </div>
  )
}
