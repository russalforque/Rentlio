import { Gauge, Loader2, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/app/page-header'
import { Meter, StatusPill } from '@/components/app/panel'
import { PeriodPicker } from '@/components/app/period-picker'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useReadingSheet, useRecordReadings, type ReadingInput, type ReadingSheetRow } from '@/features/billing/api'
import { usePeriodParam } from '@/hooks/use-period-param'
import { useSettings } from '@/hooks/use-settings'
import type { Tables } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/errors'
import { formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

type Field = 'electricity_previous' | 'electricity_current' | 'water_previous' | 'water_current'
type Draft = Record<Field, string>

const FIELDS: Field[] = ['electricity_previous', 'electricity_current', 'water_previous', 'water_current']
const EDITABLE_FIELDS: Field[] = ['electricity_previous', 'electricity_current']
const toText = (v: number | null) => (v === null ? '' : String(v))

function parse(v: string): number | null | 'invalid' {
  const t = v.trim()
  if (t === '') return null
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : 'invalid'
}

/** Validation message for one meter, or null if fine. */
function meterError(prev: string, curr: string): string | null {
  const p = parse(prev)
  const c = parse(curr)
  if (p === 'invalid' || c === 'invalid') return 'Numbers only, up to 2 decimals'
  if (p !== null && c !== null && c < p) return 'Current is lower than previous'
  return null
}

function usage(prev: string, curr: string): number | null {
  const p = parse(prev)
  const c = parse(curr)
  return typeof p === 'number' && typeof c === 'number' && c >= p ? c - p : null
}

function MeterInputs({
  label,
  unit,
  rate,
  currency,
  prev,
  curr,
  onPrev,
  onCurr,
  idPrefix,
  disabled,
}: {
  disabled?: boolean
  label: string
  unit: string
  rate: number
  currency: string
  prev: string
  curr: string
  onPrev: (v: string) => void
  onCurr: (v: string) => void
  idPrefix: string
}) {
  const error = meterError(prev, curr)
  const used = usage(prev, curr)
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`${idPrefix}-prev`} className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Previous<span className="sr-only"> {label} reading</span>
          </Label>
          <Input
            id={`${idPrefix}-prev`}
            inputMode="decimal"
            placeholder="0"
            enterKeyHint="next"
            autoComplete="off"
            value={prev}
            disabled={disabled}
            onChange={(e) => onPrev(e.target.value)}
            className="tabular"
            aria-invalid={!!error}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-curr`} className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Current<span className="sr-only"> {label} reading</span>
          </Label>
          <Input
            id={`${idPrefix}-curr`}
            inputMode="decimal"
            placeholder="0"
            enterKeyHint="next"
            autoComplete="off"
            value={curr}
            disabled={disabled}
            onChange={(e) => onCurr(e.target.value)}
            className="font-semibold tabular"
            aria-invalid={!!error}
          />
        </div>
      </div>
      <p className={cn('mt-1 h-4 text-[12px] tabular', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error ??
          (used !== null ? `${used.toLocaleString()} ${unit} · ${formatMoney(Math.round(used * rate * 100) / 100, currency)}` : '')}
      </p>
    </fieldset>
  )
}

function ReadingGrid({
  period,
  rows,
  settings,
}: {
  period: string
  rows: ReadingSheetRow[]
  settings: Tables<'app_settings'>
}) {
  const save = useRecordReadings()
  const [showAll, setShowAll] = useState(false)
  const initial = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [r.room_id, Object.fromEntries(FIELDS.map((f) => [f, toText(r[f])])) as Draft]),
      ),
    [rows],
  )
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial)

  const set = (roomId: string, field: Field, value: string) =>
    setDrafts((d) => ({ ...d, [roomId]: { ...(d[roomId] as Draft), [field]: value } }))

  const visible = rows.filter((r) => showAll || r.is_billable || r.reading_id)
  const changed = rows.filter((r) => EDITABLE_FIELDS.some((f) => drafts[r.room_id]?.[f] !== initial[r.room_id]?.[f]))
  const invalid = changed.some((r) => {
    const d = drafts[r.room_id] as Draft
    return meterError(d.electricity_previous, d.electricity_current)
  })

  const billable = rows.filter((r) => r.is_billable)
  const isRead = (roomId: string) => {
    const d = drafts[roomId] as Draft
    return d.electricity_current.trim() !== ''
  }
  const readCount = billable.filter((r) => isRead(r.room_id)).length

  const onSave = () => {
    const readings: ReadingInput[] = changed.map((r) => {
      const d = drafts[r.room_id] as Draft
      const num = (v: string) => {
        const p = parse(v)
        return typeof p === 'number' ? p : null
      }
      return {
        room_id: r.room_id,
        electricity_previous: num(d.electricity_previous),
        electricity_current: num(d.electricity_current),
        water_previous: num(d.water_previous),
        water_current: num(d.water_current),
      }
    })
    save.mutate(
      { period, readings },
      {
        onSuccess: (count) =>
          toast.success(`Saved readings for ${count} ${count === 1 ? 'room' : 'rooms'}. Draft bills were updated.`),
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <div className="space-y-4">
      <section aria-label="Progress" className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="shrink-0">
          <p className="text-[13px] font-medium text-muted-foreground">Rooms read</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight">
            {readCount}
            <span className="text-base font-medium text-muted-foreground"> / {billable.length}</span>
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <Meter value={billable.length ? (readCount / billable.length) * 100 : 0} label="Share of occupied rooms with a reading" />
          <p className="mt-2 text-xs text-muted-foreground">
            {readCount === billable.length
              ? 'Every occupied room has a reading for this month.'
              : `${billable.length - readCount} occupied ${billable.length - readCount === 1 ? 'room still needs' : 'rooms still need'} a reading.`}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Type the current meter values. Previous values carry over from last month.
        </p>
        <div className="flex items-center gap-2">
          <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="show-all" className="text-sm font-normal">
            Show vacant rooms
          </Label>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Gauge} title="No occupied rooms this month" description="Readings are needed only for occupied rooms." />
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {visible.map((r) => {
            const d = drafts[r.room_id] as Draft
            return (
              <li
                key={r.room_id}
                className={cn(
                  'surface grid grid-cols-1 gap-3 p-4 md:grid-cols-[9rem_1fr] md:items-start',
                )}
              >
                <div className="flex items-center justify-between gap-2 md:block">
                  <div className="flex min-w-0 items-baseline gap-2 md:block">
                    <p className="font-display text-lg font-semibold">Room {r.room_number}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{r.tenant_name ?? 'Vacant'}</p>
                  </div>
                  {r.bill_finalized ? (
                    // The month's bill is sent; reopen it from the bill page to correct the reading.
                    <StatusPill tone="neutral" className="shrink-0 md:mt-2">
                      Bill sent
                    </StatusPill>
                  ) : (
                    r.is_billable && (
                      <StatusPill tone={isRead(r.room_id) ? 'success' : 'warning'} className="shrink-0 md:mt-2">
                        {isRead(r.room_id) ? 'Read' : 'Missing'}
                      </StatusPill>
                    )
                  )}
                </div>
                <MeterInputs
                  idPrefix={`e-${r.room_id}`}
                  disabled={r.bill_finalized}
                  label="Electricity (kWh)"
                  unit="kWh"
                  rate={settings.electricity_rate}
                  currency={settings.currency_code}
                  prev={d.electricity_previous}
                  curr={d.electricity_current}
                  onPrev={(v) => set(r.room_id, 'electricity_previous', v)}
                  onCurr={(v) => set(r.room_id, 'electricity_current', v)}
                />
              </li>
            )
          })}
        </ul>
      )}

      {/* Docks above the phone tab bar; at the window edge from tablets up. */}
      <div className="px-gutter sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center justify-between gap-3 border-t bg-card/95 py-3 shadow-sm backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 md:bottom-3">
        <p className="text-[13px] text-muted-foreground">
          {changed.length === 0 ? 'No changes' : `${changed.length} ${changed.length === 1 ? 'room' : 'rooms'} changed`}
        </p>
        <Button onClick={onSave} disabled={changed.length === 0 || invalid || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save readings
        </Button>
      </div>
    </div>
  )
}

export function ReadingsPage() {
  const [period, setPeriod] = usePeriodParam()
  const sheet = useReadingSheet(period)
  const settings = useSettings()
  const error = sheet.error ?? settings.error

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meter readings"
        description={`Electricity readings for ${formatPeriod(period)}. Water is billed per person; draft bills update when readings are saved, and bills already sent are locked.`}
      />
      <PeriodPicker value={period} onChange={setPeriod} />
      {error ? (
        <ErrorState error={error} onRetry={() => (sheet.refetch(), settings.refetch())} />
      ) : !sheet.data || !settings.data ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        // Remount when the month or saved data changes so drafts start from the server values.
        <ReadingGrid
          key={`${period}-${sheet.dataUpdatedAt}`}
          period={period}
          rows={sheet.data}
          settings={settings.data}
        />
      )}
    </div>
  )
}
