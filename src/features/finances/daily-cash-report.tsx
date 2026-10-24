import { format, parseISO } from 'date-fns'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSettings } from '@/hooks/use-settings'
import { useDailyCashReport, useSaveDailyCashOpening } from '@/features/finances/api'
import type { CashReportEntry } from '@/features/finances/daily-cash-report-model'
import { todayISO } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { createReportCanvas, formatPeso } from './cash-report-image'

export function DailyCashReport() {
  const { data: settings } = useSettings()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => todayISO(new Date(), settings?.timezone))
  const [openingDraft, setOpeningDraft] = useState<{ date: string; value: string } | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const report = useDailyCashReport(date, open)
  const saveOpening = useSaveDailyCashOpening()
  const openingValue = openingDraft?.date === date
    ? openingDraft.value
    : report.data?.beginningCash.toFixed(2) ?? ''
  const openingAmount = Number(openingValue)
  const openingIsValid = openingValue.trim() !== ''
    && /^\d+(?:\.\d{0,2})?$/.test(openingValue)
    && Number.isFinite(openingAmount)
    && openingAmount >= 0
    && openingAmount <= 9_999_999_999.99
  const reportPreview = report.data && openingIsValid
    ? {
        ...report.data,
        beginningCash: openingAmount,
        endingCash: (Math.round(openingAmount * 100) + Math.round(report.data.income * 100) - Math.round(report.data.expenses * 100)) / 100,
      }
    : null
  const ready = !!reportPreview && !report.isFetching && !report.error
  const hasSavedOpening = report.data?.savedOpening !== null && report.data?.savedOpening !== undefined
  const openingChanged = !report.data || openingAmount !== report.data.beginningCash || !hasSavedOpening

  async function downloadReport() {
    if (!ready || !reportPreview || isDownloading) return
    setIsDownloading(true)
    try {
      const canvas = createReportCanvas(reportPreview, dateLabel)
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Your browser could not encode the report image.'))
        }, 'image/png')
      })
      const imageUrl = URL.createObjectURL(imageBlob)
      const link = document.createElement('a')
      link.download = `rentlio-daily-cash-report-${date}.png`
      link.href = imageUrl
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 60_000)
      toast.success('Daily report downloaded')
    } catch (error) {
      toast.error(`Could not generate the report image: ${getErrorMessage(error)}`)
    } finally {
      setIsDownloading(false)
    }
  }

  function saveBeginningCash() {
    if (saveOpening.isPending) return
    if (!openingIsValid) {
      toast.error('Enter a beginning cash amount of zero or greater, with no more than two decimal places.')
      return
    }
    saveOpening.mutate(
      { date, amount: openingAmount },
      {
        onSuccess: () => {
          setOpeningDraft({ date, value: openingAmount.toFixed(2) })
          toast.success('Beginning cash saved')
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    )
  }

  const dateLabel = format(parseISO(date), 'MMMM d, yyyy')

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download /> <span>Daily cash report</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && (saveOpening.isPending || isDownloading)) return
          if (!isOpen && openingDraft && openingChanged && !window.confirm('Discard the unsaved beginning cash amount?')) return
          setOpen(isOpen)
          if (!isOpen) setOpeningDraft(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Daily cash report</DialogTitle>
            <DialogDescription>
              Review your cash movements, check the opening balance, and download a compact report image.
            </DialogDescription>
          </DialogHeader>

          <label className="grid gap-2 text-sm font-medium">
            Report date
            <Input
              aria-label="Report date"
              type="date"
              required
              value={date}
              max={todayISO(new Date(), settings?.timezone)}
              disabled={saveOpening.isPending || isDownloading}
              onChange={(event) => {
                if (event.target.value) {
                  if (openingDraft && openingChanged && !window.confirm('Discard the unsaved beginning cash amount and change date?')) return
                  setDate(event.target.value)
                  setOpeningDraft(null)
                }
              }}
            />
          </label>

          {report.isFetching && <p className="text-sm text-muted-foreground">Loading cash activity…</p>}
          {report.error && (
            <p role="alert" className="text-sm text-destructive">
              The report could not be loaded. {getErrorMessage(report.error)}
            </p>
          )}
          {report.data && !report.error && (
            <>
            <div className="grid gap-2 rounded-xl border p-3">
              <label htmlFor="daily-opening-cash" className="text-sm font-semibold">
                Beginning Cash on Hand
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₱</span>
                <Input
                  id="daily-opening-cash"
                  aria-label="Beginning Cash on Hand"
                  className="pl-8 text-right font-semibold tabular-nums"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  required
                  aria-invalid={!openingIsValid}
                  aria-describedby="daily-opening-hint"
                  disabled={saveOpening.isPending || isDownloading}
                  value={openingValue}
                  onChange={(event) => setOpeningDraft({ date, value: event.target.value })}
                />
              </div>
              <p id="daily-opening-hint" className="text-xs text-muted-foreground">
                Defaults to the previous day’s ending cash. Adjust this to match your actual cash count.
              </p>
              {!openingIsValid && <p role="alert" className="text-xs text-destructive">Enter zero or a positive amount with up to two decimal places.</p>}
              {report.data.previousDayEnding !== openingAmount && openingIsValid && (
                <p role="status" className="rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300">
                  Differs from the previous day’s ending cash by {formatPeso(Math.abs(openingAmount - report.data.previousDayEnding))}
                  {openingAmount > report.data.previousDayEnding ? ' more' : ' less'}.
                </p>
              )}
              {report.data.savedOpening && (
                <p className="text-xs text-muted-foreground">
                  Last saved {format(parseISO(report.data.savedOpening.updated_at), 'MMM d, yyyy · h:mm a')}.
                </p>
              )}
              <Button
                variant="outline"
                onClick={saveBeginningCash}
                disabled={!openingIsValid || !openingChanged || saveOpening.isPending || report.isFetching}
              >
                {saveOpening.isPending ? 'Saving…' : 'Save Beginning Cash'}
              </Button>
            </div>

            <dl className="divide-y rounded-xl border px-4">
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">Beginning Cash on Hand</dt>
                <dd className="text-right font-semibold tabular-nums">{openingIsValid ? formatPeso(openingAmount) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">Total Income</dt>
                <dd className="text-right font-semibold tabular-nums">{formatPeso(report.data.income)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">Total Expenses</dt>
                <dd className="text-right font-semibold tabular-nums">{formatPeso(report.data.expenses)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="font-semibold">Ending Total Cash on Hand</dt>
                <dd className="text-right font-bold tabular-nums">{reportPreview ? formatPeso(reportPreview.endingCash) : '—'}</dd>
              </div>
            </dl>
            <CashEntries title="Income entries" entries={report.data.incomeEntries} empty="No cash collected on this date." />
            <CashEntries title="Expense entries" entries={report.data.expenseEntries} empty="No cash expenses on this date." />
            <p className="text-xs leading-relaxed text-muted-foreground">Rent and utilities paid in one transaction appear as one collection. Bank transfers, e-wallet payments, and security deposits are excluded.</p>
            </>
          )}

          <Button onClick={downloadReport} disabled={!ready || isDownloading || saveOpening.isPending}>
            <Download /> {isDownloading ? 'Preparing image…' : 'Download PNG'}
          </Button>

        </DialogContent>
      </Dialog>

    </>
  )
}

function CashEntries({ title, entries, empty }: { title: string; entries: CashReportEntry[]; empty: string }) {
  return <section className="min-w-0">
    <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title} <span className="font-normal">({entries.length})</span></h3>
    {entries.length ? <ul className="max-h-56 overflow-y-auto divide-y border-y">
      {entries.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-4 py-2 text-sm"><span className="min-w-0 break-words">{entry.label}</span><span className="shrink-0 font-medium tabular">{formatPeso(entry.amount)}</span></li>)}
    </ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
  </section>
}
