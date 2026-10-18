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
import { useDailyCashReport, useSaveDailyCashOpening } from '@/features/finances/api'
import type { CashReportEntry, DailyCashReport as DailyCashReportData } from '@/features/finances/daily-cash-report-model'
import { todayISO } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPeso(amount: number) {
  return peso.format(amount)
}

function wrapLabel(context: CanvasRenderingContext2D, label: string, maxWidth: number) {
  const words = label.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const character of word) {
      const candidateCharacter = line + character
      if (context.measureText(candidateCharacter).width > maxWidth && line) {
        lines.push(line)
        line = character
      } else {
        line = candidateCharacter
      }
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function createReportCanvas(report: DailyCashReportData, dateLabel: string) {
  const width = 390
  const padding = 22
  const right = width - padding
  const labelWidth = 215
  const measurementCanvas = document.createElement('canvas')
  const measurementContext = measurementCanvas.getContext('2d')
  if (!measurementContext) throw new Error('Your browser could not create an image canvas.')

  measurementContext.font = '12px Arial, sans-serif'
  const prepareEntries = (entries: CashReportEntry[]) => entries.map((entry) => {
    const lines = wrapLabel(measurementContext, entry.label, labelWidth)
    return { ...entry, lines, height: Math.max(22, lines.length * 14 + 8) }
  })
  const incomeEntries = prepareEntries(report.incomeEntries)
  const expenseEntries = prepareEntries(report.expenseEntries)
  const sectionHeight = (entries: typeof incomeEntries) =>
    32 + (entries.length ? entries.reduce((total, entry) => total + entry.height, 0) : 18)
  const height = 212 + sectionHeight(incomeEntries) + sectionHeight(expenseEntries)

  const scale = 3
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser could not create an image canvas.')
  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  let y = 22
  context.fillStyle = '#666666'
  context.font = '700 10px Arial, sans-serif'
  context.fillText('DAILY CASH REPORT', padding, y)
  y += 22
  context.fillStyle = '#111111'
  context.font = '700 17px Arial, sans-serif'
  context.fillText(`Report Date · ${dateLabel}`, padding, y)
  y += 15

  const divider = (color = '#e2e2e2') => {
    context.strokeStyle = color
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(padding, y)
    context.lineTo(right, y)
    context.stroke()
  }
  divider()
  y += 22

  const drawSummaryRow = (label: string, amount: number, emphasis = false) => {
    context.fillStyle = emphasis ? '#111111' : '#555555'
    context.font = `${emphasis ? 700 : 500} 12px Arial, sans-serif`
    context.fillText(label, padding, y)
    const formatted = formatPeso(amount)
    let fontSize = emphasis ? 15 : 13
    context.font = `700 ${fontSize}px Arial, sans-serif`
    while (context.measureText(formatted).width > 137 && fontSize > 10) {
      fontSize -= 1
      context.font = `700 ${fontSize}px Arial, sans-serif`
    }
    context.textAlign = 'right'
    context.fillStyle = '#111111'
    context.fillText(formatted, right, y)
    context.textAlign = 'left'
    y += emphasis ? 28 : 22
  }
  drawSummaryRow('Beginning Cash on Hand', report.beginningCash)

  const drawSection = (
    title: string,
    entries: typeof incomeEntries,
    emptyLabel: string,
  ) => {
    divider()
    y += 17
    context.fillStyle = '#111111'
    context.font = '700 10px Arial, sans-serif'
    context.fillText(title, padding, y)
    y += 15

    if (entries.length === 0) {
      context.fillStyle = '#777777'
      context.font = '11px Arial, sans-serif'
      context.fillText(emptyLabel, padding, y)
      y += 18
      return
    }

    for (const entry of entries) {
      context.fillStyle = '#333333'
      context.font = '12px Arial, sans-serif'
      entry.lines.forEach((line, index) => context.fillText(line, padding, y + index * 14))

      const formatted = formatPeso(entry.amount)
      let fontSize = 12
      context.font = `${fontSize}px Arial, sans-serif`
      while (context.measureText(formatted).width > 125 && fontSize > 8) {
        fontSize -= 1
        context.font = `${fontSize}px Arial, sans-serif`
      }
      context.textAlign = 'right'
      context.fillStyle = '#111111'
      context.fillText(formatted, right, y)
      context.textAlign = 'left'
      y += Math.max(entry.height, entry.lines.length * 14 + 5)
    }
  }

  drawSection('INCOME ENTRIES', incomeEntries, 'No cash income entries')
  drawSummaryRow('Total Income', report.income)
  drawSection('EXPENSE ENTRIES', expenseEntries, 'No cash expense entries')
  drawSummaryRow('Total Expenses', report.expenses)
  divider('#c8c8c8')
  y += 22
  drawSummaryRow('Ending Cash on Hand', report.endingCash, true)

  return canvas
}

export function DailyCashReport() {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayISO())
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
        endingCash: openingAmount + report.data.income - report.data.expenses,
      }
    : null
  const ready = !!reportPreview && !report.isFetching && !report.error
  const hasSavedOpening = report.data?.savedOpening !== null && report.data?.savedOpening !== undefined
  const openingChanged = !report.data || openingAmount !== report.data.beginningCash || !hasSavedOpening

  async function downloadReport() {
    if (!ready || !reportPreview) return
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
        <Download /> <span>Download Daily Report</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) setOpeningDraft(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download Daily Report</DialogTitle>
            <DialogDescription>
              Choose a date to preview and download a cash-only report as a PNG.
            </DialogDescription>
          </DialogHeader>

          <label className="grid gap-2 text-sm font-medium">
            Report date
            <Input
              aria-label="Report date"
              type="date"
              required
              value={date}
              max={todayISO()}
              onChange={(event) => {
                if (event.target.value) {
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
                  value={openingValue}
                  onChange={(event) => setOpeningDraft({ date, value: event.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Defaults to the previous day’s ending cash. Adjust this to match your actual cash count.
              </p>
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
                <dd className="text-right font-bold tabular-nums">{openingIsValid ? formatPeso(openingAmount + report.data.income - report.data.expenses) : '—'}</dd>
              </div>
            </dl>
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
