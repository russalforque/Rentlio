import { useEffect, useId, useRef, useState } from 'react'

export interface ChartSeries {
  name: string
  /** CSS color, normally a validated token such as var(--chart-1). */
  color: string
}

export interface ChartDatum {
  label: string
  /** Longer label for the tooltip, e.g. "October 2026". */
  title: string
  values: number[]
}

interface ColumnChartProps {
  series: ChartSeries[]
  data: ChartDatum[]
  formatValue: (v: number) => string
  formatTick: (v: number) => string
  height?: number
  ariaLabel: string
}

const PAD = { top: 12, right: 8, bottom: 26, left: 48 }
const BAR_MAX = 22
const GAP = 4 // surface gap between bars in a group

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(v))
  const f = v / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * exp
}

/** Column with a fully rounded data end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ''
  const r = Math.min(w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Grouped column chart. One baseline, one y-axis, recessive hairline grid, a
 * legend, and a per-group hover/focus tooltip listing every series. Values are
 * also available in the table the caller renders alongside.
 */
export function ColumnChart({ series, data, formatValue, formatTick, height = 240, ariaLabel }: ColumnChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const gid = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)

  const max = niceMax(Math.max(0, ...data.flatMap((d) => d.values)))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const band = data.length ? plotW / data.length : 0
  const barW = Math.max(2, Math.min(BAR_MAX, (band * 0.7 - GAP * (series.length - 1)) / series.length))
  const groupW = barW * series.length + GAP * (series.length - 1)
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  // Thin out x labels on narrow screens.
  const labelEvery = band < 34 ? Math.ceil(34 / Math.max(band, 1)) : 1
  const activeDatum = active !== null ? data[active] : undefined

  return (
    <div>
      {/* A single series is named by the card title, so it needs no legend. */}
      {series.length > 1 && (
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-foreground/80" aria-label="Legend">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className="h-3 w-6 rounded-full" style={{ background: `linear-gradient(to right, color-mix(in oklab, ${s.color} 55%, transparent), ${s.color})` }} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block overflow-visible">
            <defs>
              {series.map((s, k) => (
                <linearGradient key={s.name} id={`${gid}-${k}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={s.color} stopOpacity={0.6} />
                  <stop offset="1" stopColor={s.color} />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '4 4'}
                  shapeRendering="crispEdges"
                />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular">
                  {formatTick(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const gx = PAD.left + i * band + (band - groupW) / 2
              const isActive = active === i
              return (
                <g
                  key={d.label + i}
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.title}: ${series.map((s, k) => `${s.name} ${formatValue(d.values[k] ?? 0)}`).join(', ')}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                >
                  {/* Hit target spans the whole band, larger than the bars. */}
                  <rect
                    x={PAD.left + i * band}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    rx={8}
                    fill={isActive ? 'var(--muted)' : 'transparent'}
                    opacity={isActive ? 0.7 : 1}
                  />
                  {series.map((s, k) => {
                    const v = d.values[k] ?? 0
                    const h = (v / max) * plotH
                    return (
                      <path
                        key={s.name}
                        d={barPath(gx + k * (barW + GAP), y(v), barW, h)}
                        fill={`url(#${gid}-${k})`}
                        opacity={active === null || isActive ? 1 : 0.5}
                      />
                    )
                  })}
                  {i % labelEvery === 0 && (
                    <text
                      x={PAD.left + i * band + band / 2}
                      y={height - 8}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {d.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {activeDatum && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-[13px] shadow-md"
            style={{
              top: PAD.top,
              left: Math.min(Math.max(0, PAD.left + active * band + band / 2 - 80), Math.max(0, width - 168)),
            }}
          >
            <p className="mb-1 text-xs text-muted-foreground">{activeDatum.title}</p>
            {series.map((s, k) => (
              <p key={s.name} className="flex items-center gap-2">
                <span className="h-2 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="font-semibold tabular">{formatValue(activeDatum.values[k] ?? 0)}</span>
                <span className="text-muted-foreground">{s.name}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
