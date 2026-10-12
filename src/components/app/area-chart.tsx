import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export interface AreaSeries {
  name: string
  /** CSS color, normally a validated token such as var(--chart-1). */
  color: string
  values: number[]
  /** `area` draws a 10% wash under the line; `line` is the line alone. */
  kind: 'area' | 'line'
}

interface AreaChartProps {
  series: AreaSeries[]
  /** Short x labels ("Oct") and longer tooltip titles ("October 2026"), one per point. */
  labels: string[]
  titles: string[]
  formatValue: (v: number) => string
  formatTick: (v: number) => string
  height?: number
  ariaLabel: string
}

const PAD = { top: 12, right: 12, bottom: 26, left: 44 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(v))
  const f = v / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * exp
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
 * Line/area chart over time. One y-axis, solid hairline grid, a crosshair that
 * snaps to the nearest month, and one tooltip listing every series. Arrow keys
 * move the crosshair when the chart has focus.
 */
export function AreaChart({ series, labels, titles, formatValue, formatTick, height = 240, ariaLabel }: AreaChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const count = labels.length
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const step = count > 1 ? plotW / (count - 1) : 0
  const x = (i: number) => PAD.left + i * step
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const labelW = Math.max(0, ...labels.map((l) => l.length)) * 6.5 + 12
  const labelEvery = step > 0 && step < labelW ? Math.ceil(labelW / step) : 1

  const nearest = (clientX: number, el: Element) => {
    const left = el.getBoundingClientRect().left
    const i = Math.round((clientX - left - PAD.left) / Math.max(step, 1))
    return Math.min(count - 1, Math.max(0, i))
  }
  const onPointer = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX, e.currentTarget))
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setActive((a) => {
      const from = a ?? count - 1
      return Math.min(count - 1, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const tooltipLeft = active === null ? 0 : Math.min(Math.max(0, x(active) - 104), Math.max(0, width - 216))

  return (
    <div ref={ref} className="relative select-none" onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${ariaLabel}. Use the left and right arrow keys to read each month.`}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? count - 1)}
          onBlur={() => setActive(null)}
          className="block touch-pan-y overflow-visible rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 || i === count - 1 ? (
              <text key={l + i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'} className="fill-muted-foreground text-[11px]">
                {l}
              </text>
            ) : null,
          )}

          {/* Areas under lines, so a reference line always stays visible on top. */}
          {[...series].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'area' ? -1 : 1)).map((s) => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join('L')
            return (
              <g key={s.name}>
                {s.kind === 'area' && <path d={`M${pts}L${x(count - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} fillOpacity={0.1} />}
                <path d={`M${pts}`} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            )
          })}

          {active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={1} shapeRendering="crispEdges" />
              {series.map((s) => (
                <circle key={s.name} cx={x(active)} cy={y(s.values[active] ?? 0)} r={4.5} fill={s.color} stroke="var(--card)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-52 rounded-lg border bg-popover px-3 py-2 text-[13px] shadow-md"
          style={{ top: PAD.top, left: tooltipLeft }}
        >
          <p className="mb-1 text-xs text-muted-foreground">{titles[active]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2">
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="font-semibold tabular">{formatValue(s.values[active] ?? 0)}</span>
              <span className="truncate text-muted-foreground">{s.name}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
