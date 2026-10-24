import type { CashReportEntry, DailyCashReport as DailyCashReportData } from './daily-cash-report-model'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPeso(amount: number) {
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

export function createReportCanvas(report: DailyCashReportData, dateLabel: string) {
  const width = 480
  const padding = 24
  const right = width - padding
  const labelWidth = 278
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
  const height = 252 + sectionHeight(incomeEntries) + sectionHeight(expenseEntries)

  const scale = 3
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser could not create an image canvas.')
  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  let y = 26
  context.fillStyle = '#666666'
  context.font = '700 10px Arial, sans-serif'
  context.fillText('RENTLIO / DAILY CASH REPORT', padding, y)
  y += 22
  context.fillStyle = '#111111'
  context.font = '700 17px Arial, sans-serif'
  context.fillText(dateLabel, padding, y)
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
  divider()
  y += 18
  context.fillStyle = '#777777'
  context.font = '10px Arial, sans-serif'
  context.fillText('Cash transactions only · Transfers and deposits excluded', padding, y)

  return canvas
}

