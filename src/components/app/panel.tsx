import type { LucideIcon } from 'lucide-react'
import { ChevronRight, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

interface PanelProps {
  title: string
  description?: ReactNode
  /** Right side of the header: a link, a segmented control, a search box. */
  action?: ReactNode
  /** Body runs edge to edge, for tables and divided lists. */
  flush?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}

/** The standard content card: titled header, content below. */
export function Panel({ title, description, action, flush, className, bodyClassName, children }: PanelProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('surface flex min-w-0 flex-col', flush && 'overflow-hidden', className)}>
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] leading-tight font-semibold">
            {title}
          </h2>
          {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </header>
      <div className={cn('flex min-h-0 flex-1 flex-col', !flush && 'px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** "View all" style link for a panel header. */
export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-8 items-center gap-1 rounded-lg bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </Link>
  )
}

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'destructive' | 'info'

const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  brand: 'bg-chip-violet/10 text-chip-violet ring-chip-violet/20',
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/15 text-warning-foreground ring-warning/30',
  destructive: 'bg-destructive/8 text-destructive ring-destructive/20',
  info: 'bg-info/8 text-info ring-info/20',
}

/** Status label: soft tinted chip with the state in words. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONE_SOFT[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export type Accent = 'violet' | 'green' | 'amber' | 'blue'

const CHIP: Record<Accent, string> = {
  violet: 'bg-chip-violet',
  green: 'bg-chip-green',
  amber: 'bg-chip-amber',
  blue: 'bg-chip-blue',
}

/** Solid rounded square with a white glyph, as on the stat cards. */
export function IconChip({ icon: Icon, accent, className }: { icon: LucideIcon; accent: Accent; className?: string }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-white shadow-xs', CHIP[accent], className)} aria-hidden>
      <Icon className="size-4" strokeWidth={2} />
    </span>
  )
}

/**
 * Change against a previous period: "↗ +12% vs last month". Green when the move is
 * good, red when bad; `upIsGood` flips that for figures like arrears.
 */
export function Trend({ current, previous, label, upIsGood = true }: { current: number; previous: number; label: string; upIsGood?: boolean }) {
  if (previous <= 0) return <span className="text-xs text-muted-foreground">{current > 0 ? `New ${label}` : `Nothing ${label}`}</span>
  const pct = Math.round(((current - previous) / previous) * 100)
  const up = pct >= 0
  const good = pct === 0 || up === upIsGood
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={cn('inline-flex items-center gap-0.5 font-medium tabular', good ? 'text-success' : 'text-destructive')}>
        <Icon className="size-3.5" aria-hidden />
        {up ? '+' : '−'}
        {Math.abs(pct)}%
      </span>
      {label}
    </span>
  )
}

interface StatTileProps {
  label: string
  value: string
  icon: LucideIcon
  accent?: Accent
  /** Footer line: a <Trend/> or a short note. */
  sub?: ReactNode
  to?: string
}

/** KPI card: label and icon chip on top, a large figure, a trend or note below. */
export function StatTile({ label, value, icon, accent = 'violet', sub, to }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="truncate pt-1 text-[13px] font-medium text-foreground/80">{label}</p>
        <IconChip icon={icon} accent={accent} />
      </div>
      <p className="font-display mt-3 truncate text-[28px] leading-none font-semibold sm:text-[30px]">{value}</p>
      {sub && <div className="mt-2.5 min-w-0 truncate">{sub}</div>}
    </>
  )
  const cls = 'surface block min-w-0 p-4 sm:p-5'
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Four stat cards in a responsive row. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4', className)}>{children}</div>
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

/** Small pill switch, e.g. "6M / 12M". */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value === o.value && 'bg-card text-foreground shadow-xs',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface FilterChipsProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; count?: number; icon?: LucideIcon }[]
  onChange: (v: T) => void
  className?: string
}

/** Page-level filter tabs: the active one is a white pill. Scrolls sideways on phones. */
export function FilterChips<T extends string>({ label, value, options, onChange, className }: FilterChipsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0', className)}
    >
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active
                ? 'border-border bg-card text-foreground shadow-xs'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon && <o.icon className="size-3.5" aria-hidden />}
            {o.label}
            {o.count !== undefined && (
              <span className={cn('text-xs tabular', active ? 'text-muted-foreground' : 'text-muted-foreground/70')}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Search box with a leading icon. */
export function SearchField({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 md:text-[13px] dark:bg-input/20"
        {...props}
      />
    </div>
  )
}

const CALLOUT: Record<'info' | 'warning' | 'destructive' | 'neutral' | 'success', string> = {
  info: 'border-info/20 bg-info/5 [&>div>svg]:text-info',
  warning: 'border-warning/35 bg-warning/8 [&>div>svg]:text-warning-foreground',
  destructive: 'border-destructive/20 bg-destructive/5 [&>div>svg]:text-destructive',
  neutral: 'border-border bg-card [&>div>svg]:text-muted-foreground',
  success: 'border-success/20 bg-success/6 [&>div>svg]:text-success',
}

/** Inline notice: icon, message and an optional action on the right. */
export function Callout({
  tone,
  icon: Icon,
  children,
  action,
  className,
  role,
}: {
  tone: keyof typeof CALLOUT
  icon: LucideIcon
  children: ReactNode
  action?: ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  return (
    <div role={role} className={cn('flex flex-col gap-3 rounded-xl border p-4 text-[13px] sm:flex-row sm:items-center', CALLOUT[tone], className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
        <Icon aria-hidden />
        <div className="min-w-0 leading-relaxed">{children}</div>
      </div>
      {action && <div className="shrink-0 sm:ml-2">{action}</div>}
    </div>
  )
}

/** Initials in a soft circle, for list rows. */
export function InitialsBadge({ text, className }: { text: string; className?: string }) {
  return (
    <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/70', className)}>
      {text}
    </span>
  )
}

/** Label/value pair for detail lists. */
export function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  )
}

/** Bordered row with an outlined icon square, title, note and a trailing figure. Used for insights and to-dos. */
export function InsightRow({
  icon: Icon,
  title,
  note,
  trailing,
  to,
}: {
  icon: LucideIcon
  title: ReactNode
  note?: ReactNode
  trailing?: ReactNode
  to?: string
}) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-foreground/80" aria-hidden>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{title}</span>
        {note && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{note}</span>}
      </span>
      {trailing && <span className="shrink-0 text-xs font-medium">{trailing}</span>}
      {to && <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />}
    </>
  )
  const cls = 'group flex items-center gap-3 rounded-xl border px-3 py-3'
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
