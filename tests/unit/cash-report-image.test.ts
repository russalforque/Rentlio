import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createReportCanvas } from '../../src/features/finances/cash-report-image.ts'

test('cash report image keeps 28 collections, long labels, large amounts and totals inside the export', () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const draws: { text: string; x: number; y: number; width: number; align: string }[] = []
  const context = {
    font: '12px Arial', textAlign: 'left', fillStyle: '', strokeStyle: '', lineWidth: 1,
    scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    measureText(text: string) { return { width: text.length * (Number(this.font.match(/([\d.]+)px/)?.[1]) || 12) * 0.56 } },
    fillText(text: string, x: number, y: number) { draws.push({ text, x, y, width: this.measureText(text).width, align: this.textAlign }) },
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  } })
  try {
    const entries = Array.from({ length: 28 }, (_, index) => ({ id: String(index), label: `Room ${101 + index} — Tenant Payment`, amount: 5500, count: 1 }))
    const canvas = createReportCanvas({ date: '2026-10-20', beginningCash: 0, previousDayEnding: 0, savedOpening: null,
      incomeEntries: entries, income: 154000, expenses: 1234.56, endingCash: 152765.44,
      expenseEntries: [{ id: 'long', label: 'Replacement plumbing supplies for a shared kitchen ' + 'A'.repeat(150), amount: 1234.56, count: 1 }],
    }, 'October 20, 2026')
    assert.equal(draws.filter((draw) => draw.text.includes('Tenant Payment')).length, 28)
    assert.ok(draws.some((draw) => draw.text === 'Ending Cash on Hand'))
    assert.ok(draws.some((draw) => draw.text.includes('152,765.44')))
    for (const draw of draws) {
      assert.ok(draw.y > 0 && draw.y < canvas.height / 3, `Clipped vertically: ${draw.text}`)
      const left = draw.align === 'right' ? draw.x - draw.width : draw.x
      const right = draw.align === 'right' ? draw.x : draw.x + draw.width
      assert.ok(left >= 0 && right <= canvas.width / 3, `Clipped horizontally: ${draw.text}`)
    }
  } finally {
    if (prior) Object.defineProperty(globalThis, 'document', prior)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
