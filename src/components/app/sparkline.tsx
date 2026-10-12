import { cn } from '@/lib/utils'

/**
 * Tiny trend line for stat cards: the history in a recessive gray, the latest
 * point as an accent dot. Decorative; the card states the value in text.
 */
export function Sparkline({
  values,
  accent = 'var(--chart-1)',
  className,
}: {
  values: number[]
  accent?: string
  className?: string
}) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  // Keep the line off the top and bottom edges so the end dot is never clipped.
  const y = (v: number) => 8 + (1 - (v - min) / span) * 24
  const x = (i: number) => (i / (values.length - 1)) * 100
  const points = values.map((v, i) => `${x(i)},${y(v)}`)
  const line = `M${points.join('L')}`
  const area = `${line}L100,40L0,40Z`
  const last = values[values.length - 1] ?? 0

  return (
    <div className={cn('relative h-10', className)} aria-hidden>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="size-full overflow-visible">
        <path d={area} fill={accent} fillOpacity={0.08} />
        <path
          d={line}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeOpacity={0.55}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* An HTML dot keeps its round shape however the SVG is stretched. */}
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
        style={{ left: '100%', top: `${(y(last) / 40) * 100}%`, background: accent }}
      />
    </div>
  )
}
