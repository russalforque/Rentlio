import { Gauge, Loader2, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { PageHeader } from '@/components/app/page-header'
import { FilterChips, Meter, SearchField, StatusPill } from '@/components/app/panel'
import { PeriodPicker } from '@/components/app/period-picker'
import { EmptyState, ErrorState } from '@/components/app/states'
import { NativeSelect } from '@/components/app/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useReadingSheet, useRecordReadings, type ReadingInput, type ReadingSheetRow } from '@/features/billing/api'
import type { ElectricityMeter } from '@/features/rooms/api'
import { usePeriodParam } from '@/hooks/use-period-param'
import { useSettings } from '@/hooks/use-settings'
import type { Tables } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/errors'
import { formatMoney, formatPeriod } from '@/lib/format'
import { cn } from '@/lib/utils'

type ReadingEvent = 'normal' | 'review' | 'reset' | 'replacement' | 'rollover'
type MeterDraft = { previous: string; current: string; event: ReadingEvent; rolloverAt: string }
type Draft = {
  meters: Record<ElectricityMeter, MeterDraft>
}
const METERS: { id: ElectricityMeter; label: string }[] = [
  { id: 'aircon', label: 'Aircon' },
  { id: 'outlet', label: 'Outlet' },
  { id: 'light', label: 'Light' },
]
const METER_FIELDS: Record<
  ElectricityMeter,
  {
    previous: 'aircon_previous' | 'outlet_previous' | 'light_previous'
    current: 'aircon_current' | 'outlet_current' | 'light_current'
    reset: 'aircon_reset' | 'outlet_reset' | 'light_reset'
    event: 'aircon_event' | 'outlet_event' | 'light_event'
    rolloverAt: 'aircon_rollover_at' | 'outlet_rollover_at' | 'light_rollover_at'
  }
> = {
  aircon: {
    previous: 'aircon_previous', current: 'aircon_current', reset: 'aircon_reset',
    event: 'aircon_event', rolloverAt: 'aircon_rollover_at',
  },
  outlet: {
    previous: 'outlet_previous', current: 'outlet_current', reset: 'outlet_reset',
    event: 'outlet_event', rolloverAt: 'outlet_rollover_at',
  },
  light: {
    previous: 'light_previous', current: 'light_current', reset: 'light_reset',
    event: 'light_event', rolloverAt: 'light_rollover_at',
  },
}
const toText = (v: number | null) => (v === null ? '' : String(v))

function parse(v: string): number | null | 'invalid' {
  const t = v.trim()
  if (t === '') return null
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : 'invalid'
}

function meterError(prev: string, curr: string, event: ReadingEvent, rolloverAt: string): string | null {
  const p = parse(prev)
  const c = parse(curr)
  if (p === 'invalid' || c === 'invalid') return 'Numbers only, up to 2 decimals'
  if (event === 'rollover') {
    const maximum = parse(rolloverAt)
    if (p === null || c === null) return 'Enter previous and current readings to calculate a rollover'
    if (maximum === null || maximum === 'invalid' || maximum <= p || maximum <= c) {
      return 'Enter the meter maximum, higher than both readings'
    }
  }
  return null
}

function usage(prev: string, curr: string, event: ReadingEvent, rolloverAt: string): number | null {
  const p = parse(prev)
  const c = parse(curr)
  if (typeof p !== 'number' || typeof c !== 'number' || event === 'review') return null
  if (event === 'rollover') {
    const maximum = parse(rolloverAt)
    return typeof maximum === 'number' && maximum > p && maximum > c ? maximum - p + c : null
  }
  return c >= p ? c - p : null
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
  event,
  rolloverAt,
  onEvent,
  onRolloverAt,
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
  event: ReadingEvent
  rolloverAt: string
  onEvent: (event: ReadingEvent) => void
  onRolloverAt: (value: string) => void
  idPrefix: string
}) {
  const error = meterError(prev, curr, event, rolloverAt)
  const currentNumber = parse(curr)
  const previousNumber = parse(prev)
  const lower = typeof currentNumber === 'number' && typeof previousNumber === 'number' && currentNumber < previousNumber
  const needsReview = lower && event === 'review'
  const used = usage(prev, curr, event, rolloverAt)
  return (
    <fieldset className="min-w-0" aria-describedby={`${idPrefix}-usage`}>
      <legend className="mb-1.5 w-full text-xs font-semibold text-muted-foreground">
        {label} meter · cumulative readings
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`${idPrefix}-prev`} className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Previous reading
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
            Current reading
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
      {(lower || event === 'reset' || event === 'replacement' || event === 'rollover') && (
        <div className="mt-2 grid gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-[12px]">
          {lower && (
            <>
              <p className="font-medium text-warning-foreground">
                Current cumulative reading is below the previous value. This may be a typo, reset, replacement, or rollover.
                A review reading is saved without a charge until resolved.
              </p>
              <NativeSelect
                aria-label={`${label} lower reading action`}
                value={event}
                disabled={disabled}
                onChange={(e) => onEvent(e.target.value as ReadingEvent)}
              >
                <option value="review">Save for review — no charge</option>
                <option value="reset">Meter reset</option>
                <option value="replacement">Meter replacement</option>
                <option value="rollover">Meter rollover</option>
              </NativeSelect>
              <p className="text-muted-foreground">For an incorrect previous value, correct Previous reading above.</p>
            </>
          )}
          {event === 'reset' || event === 'replacement' ? (
            <p className="text-muted-foreground">
              {event === 'reset' ? 'Meter reset recorded.' : 'Meter replacement recorded.'}
              {' '}Set Previous reading to the new meter's starting value before saving.
            </p>
          ) : event === 'rollover' ? (
            <label className="grid gap-1 text-muted-foreground">
              Meter maximum before rollover
              <Input
                inputMode="decimal"
                value={rolloverAt}
                disabled={disabled}
                onChange={(e) => onRolloverAt(e.target.value)}
                aria-invalid={!!error}
                className="bg-background tabular"
              />
            </label>
          ) : null}
        </div>
      )}
      {error ? (
        <p id={`${idPrefix}-usage`} role="alert" className="mt-1 text-[12px] text-destructive">{error}</p>
      ) : (
        <p id={`${idPrefix}-usage`} className="mt-1 text-[12px] tabular text-muted-foreground">
          {used !== null
            ? `Monthly consumption ${used.toLocaleString()} ${unit} · ${formatMoney(electricityCharge(used, rate), currency)}`
            : needsReview || event === 'review'
              ? 'Consumption pending review'
              : 'Enter a current reading to calculate consumption'}
        </p>
      )}
    </fieldset>
  )
}

function electricityCharge(kwh: number, rate: number): number {
  const kwhHundredths = BigInt(Math.round(kwh * 100))
  const rateTenThousandths = BigInt(Math.round(rate * 10_000))
  const cents = (kwhHundredths * rateTenThousandths + 5_000n) / 10_000n
  return Number(cents) / 100
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
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'missing' | 'changed'>('all')
  const initial = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [
          r.room_id,
          {
            meters: Object.fromEntries(
              METERS.map(({ id }) => [
                id,
                {
                  previous: toText(r[METER_FIELDS[id].previous]),
                  current: toText(r[METER_FIELDS[id].current]),
                  event: r[METER_FIELDS[id].event] ?? (r[METER_FIELDS[id].reset] ? 'reset' : 'normal'),
                  rolloverAt: toText(r[METER_FIELDS[id].rolloverAt]),
                },
              ]),
            ) as Draft['meters'],
          } satisfies Draft,
        ]),
      ),
    [rows],
  )
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial)

  const setMeter = (roomId: string, meter: ElectricityMeter, field: keyof MeterDraft, value: string | ReadingEvent) =>
    setDrafts((draft) => {
      const current = draft[roomId]
      if (!current) return draft
      return {
        ...draft,
        [roomId]: {
          ...current,
          meters: {
            ...current.meters,
            [meter]: { ...current.meters[meter], [field]: value },
          },
        },
      }
    })

  const editCurrent = (roomId: string, meter: ElectricityMeter, currentText: string) => {
    const current = drafts[roomId]?.meters[meter]
    if (!current) return
    const previousValue = parse(current.previous)
    const currentValue = parse(currentText)
    const lower =
      typeof previousValue === 'number' &&
      typeof currentValue === 'number' &&
      currentValue < previousValue
    setDrafts((draft) => {
      const room = draft[roomId]
      if (!room) return draft
      const existing = room.meters[meter]
      return {
        ...draft,
        [roomId]: {
          ...room,
          meters: {
            ...room.meters,
            [meter]: {
              ...existing,
              current: currentText,
              event: lower
                ? existing.event === 'reset' || existing.event === 'replacement' || existing.event === 'rollover'
                  ? existing.event
                  : 'review'
                : existing.event === 'review' || existing.event === 'rollover'
                  ? 'normal'
                  : existing.event,
            },
          },
        },
      }
    })
  }

  const editPrevious = (roomId: string, meter: ElectricityMeter, previousText: string) => {
    const current = drafts[roomId]?.meters[meter]
    if (!current) return
    const previousValue = parse(previousText)
    const currentValue = parse(current.current)
    const noLongerLower =
      typeof previousValue === 'number' &&
      typeof currentValue === 'number' &&
      currentValue >= previousValue
    setDrafts((draft) => {
      const room = draft[roomId]
      if (!room) return draft
      const existing = room.meters[meter]
      return {
        ...draft,
        [roomId]: {
          ...room,
          meters: {
            ...room.meters,
            [meter]: {
              ...existing,
              previous: previousText,
              event: noLongerLower && existing.event === 'review' ? 'normal' : existing.event,
            },
          },
        },
      }
    })
  }

  const chooseEvent = (roomId: string, meter: ElectricityMeter, event: ReadingEvent) => {
    setDrafts((draft) => {
      const room = draft[roomId]
      if (!room) return draft
      const value = room.meters[meter]
      return {
        ...draft,
        [roomId]: {
          ...room,
          meters: {
            ...room.meters,
            [meter]: {
              ...value,
              previous: event === 'reset' || event === 'replacement' ? '0' : value.previous,
              event,
              rolloverAt: event === 'rollover' ? value.rolloverAt : '',
            },
          },
        },
      }
    })
  }

  const changed = rows.filter((r) =>
    r.electricity_meters.some((meter) => {
      const values = drafts[r.room_id]?.meters[meter]
      const original = initial[r.room_id]?.meters[meter]
      return values && original && (
        values.previous !== original.previous ||
        values.current !== original.current ||
        values.event !== original.event ||
        values.rolloverAt !== original.rolloverAt
      )
    }),
  )
  useUnsavedChanges(changed.length > 0)
  const invalid = changed.some((r) => {
    const d = drafts[r.room_id]
    if (!d) return true
    return r.electricity_meters.some((meter) => {
      const value = d.meters[meter]
      return meterError(value.previous, value.current, value.event, value.rolloverAt)
    })
  })

  const billable = rows.filter((r) => r.is_billable && r.electricity_meters.length > 0)
  const isRead = (r: ReadingSheetRow) => {
    const d = drafts[r.room_id]
    return !!d && (
      r.electricity_meters.length === 0 ||
      r.electricity_meters.every((meter) => {
        const value = d.meters[meter]
        return parse(value.previous) !== null && parse(value.current) !== null &&
          meterError(value.previous, value.current, value.event, value.rolloverAt) === null &&
          value.event !== 'review' &&
          usage(value.previous, value.current, value.event, value.rolloverAt) !== null
      })
    )
  }
  const readCount = billable.filter(isRead).length
  const changedIds = new Set(changed.map((room) => room.room_id))
  const query = search.trim().toLowerCase()
  const visible = rows.filter((room) => (showAll || room.is_billable || room.reading_id)
    && `${room.room_number} ${room.tenant_name ?? ''}`.toLowerCase().includes(query)
    && (filter === 'all' || (filter === 'changed' ? changedIds.has(room.room_id) : room.is_billable && !isRead(room) && !room.bill_finalized)))

  const onSave = () => {
    const readings: ReadingInput[] = changed.map((r) => {
      const d = drafts[r.room_id]
      if (!d) throw new Error(`Missing reading draft for room ${r.room_number}`)
      const num = (v: string) => {
        const p = parse(v)
        return typeof p === 'number' ? p : null
      }
      const meters = new Set(r.electricity_meters)
      return {
        room_id: r.room_id,
        ...(meters.has('aircon') && {
          aircon_previous: num(d.meters.aircon.previous),
          aircon_current: num(d.meters.aircon.current),
          aircon_event: d.meters.aircon.event,
          aircon_rollover_at: num(d.meters.aircon.rolloverAt),
        }),
        ...(meters.has('outlet') && {
          outlet_previous: num(d.meters.outlet.previous),
          outlet_current: num(d.meters.outlet.current),
          outlet_event: d.meters.outlet.event,
          outlet_rollover_at: num(d.meters.outlet.rolloverAt),
        }),
        ...(meters.has('light') && {
          light_previous: num(d.meters.light.previous),
          light_current: num(d.meters.light.current),
          light_event: d.meters.light.event,
          light_rollover_at: num(d.meters.light.rolloverAt),
        }),
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
    <div className="space-y-4" data-unsaved-readings={changed.length > 0}>
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
          Enter each current meter value. Previous values carry forward from the last finalized bill; for a reset or replacement, set Previous reading to the new meter's starting value.
        </p>
        <div className="flex items-center gap-2">
          <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="show-all" className="text-sm font-normal">
            Show vacant rooms
          </Label>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterChips label="Filter meter readings" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All rooms' },
          { value: 'missing', label: 'Incomplete', count: billable.filter((room) => !isRead(room) && !room.bill_finalized).length },
          { value: 'changed', label: 'Unsaved', count: changed.length },
        ]} />
        <SearchField aria-label="Find a room for readings" placeholder="Find room or tenant…" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full sm:w-64" />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Gauge} title={query || filter !== 'all' ? 'No rooms match this view' : 'No occupied rooms this month'} description={query || filter !== 'all' ? 'Clear the search or choose All rooms to see the full reading sheet.' : 'Readings are needed only for occupied rooms.'} />
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {visible.map((r) => {
            const d = drafts[r.room_id]!
            const activeMeters = r.electricity_meters
            const usageCents = activeMeters.map((meter) => {
              const value = d.meters[meter]
              const consumed = usage(value.previous, value.current, value.event, value.rolloverAt)
              return consumed === null ? null : Math.round(consumed * 100)
            })
            const completeUsage = usageCents.every((value) => value !== null)
            const totalKwh = completeUsage
              ? usageCents.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 100
              : null
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
                    r.is_billable && activeMeters.length > 0 && (
                      <StatusPill tone={isRead(r) ? 'success' : 'warning'} className="shrink-0 md:mt-2">
                        {isRead(r) ? 'Read' : 'Missing'}
                      </StatusPill>
                    )
                  )}
                </div>
                {activeMeters.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                    No electricity meters are configured for this room.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                      {METERS.filter(({ id }) => activeMeters.includes(id)).map(({ id, label }) => {
                        const value = d.meters[id]
                        return (
                          <MeterInputs
                            key={id}
                            idPrefix={`e-${id}-${r.room_id}`}
                            disabled={r.bill_finalized || save.isPending}
                            label={label}
                            unit="kWh"
                            rate={settings.electricity_rate}
                            currency={settings.currency_code}
                            prev={value.previous}
                            curr={value.current}
                            event={value.event}
                            rolloverAt={value.rolloverAt}
                            onPrev={(v) => editPrevious(r.room_id, id, v)}
                            onCurr={(v) => editCurrent(r.room_id, id, v)}
                            onEvent={(value) => chooseEvent(r.room_id, id, value)}
                            onRolloverAt={(v) => setMeter(r.room_id, id, 'rolloverAt', v)}
                          />
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
                      <span className="text-muted-foreground">
                        {totalKwh === null ? 'Total kWh pending readings' : `Total ${totalKwh.toLocaleString()} kWh`}
                      </span>
                      <span className="text-muted-foreground">
                        Rate {settings.electricity_rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {settings.currency_code}/kWh
                      </span>
                      <span className="font-semibold tabular">
                        {totalKwh === null ? 'Charge pending' : formatMoney(electricityCharge(totalKwh, settings.electricity_rate), settings.currency_code)}
                      </span>
                    </div>
                  </div>
                )}
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
  const sheet = useReadingSheet(period, true)
  const settings = useSettings()
  const error = sheet.error ?? settings.error

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="BILLING / UTILITIES"
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
