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
        {action && <div className="flex max-w-full min-w-0 shrink-0 flex-wrap items-center gap-2">{action}</div>}
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
      className="inline-flex h-10 items-center gap-1 rounded-lg bg-muted px-3 text-[13px] md:h-8 md:text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
  /** Kept for callers; tiles in the strip use a quiet monochrome icon. */
  accent?: Accent
  /** Footer line: a <Trend/> or a short note. */
  sub?: ReactNode
  to?: string
  /** Optional visual under the figure: a sparkline, meter or progress bar. */
  children?: ReactNode
}

/** KPI cell in a <StatGrid> strip: quiet label and icon, a large figure, a note below. */
export function StatTile({ label, value, icon: Icon, sub, to, children }: StatTileProps) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-muted-foreground">{label}</span>
        <Icon className="size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground" aria-hidden />
      </span>
      <span className="mt-2 block truncate text-[22px] leading-tight font-semibold tracking-tight min-[400px]:text-2xl sm:text-[28px]">{value}</span>
      {sub && <span className="mt-1.5 block min-w-0 truncate">{sub}</span>}
      {children && <span className="mt-auto block pt-4">{children}</span>}
    </>
  )
  const cls = 'group flex min-w-0 flex-col bg-card p-4 sm:p-5'
  return to ? (
    <Link
      to={to}
      className={cn(cls, 'transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset')}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** KPI strip: one bordered surface split into cells by hairlines. Two across on phones, four from lg. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      aria-label="Key figures"
      className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-xs lg:grid-cols-4', className)}
    >
      {children}
    </section>
  )
}

/** Loading placeholder for a <StatGrid>. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <StatGrid>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 bg-card p-4 sm:p-5">
          <span className="block h-3.5 w-24 animate-pulse rounded bg-muted" />
          <span className="block h-7 w-32 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </StatGrid>
  )
}

/** Thin progress bar for a share, e.g. collected of billed. */
export function Meter({ value, label, tone = 'success' }: { value: number; label: string; tone?: 'success' | 'info' | 'warning' }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className="block h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <span
        className={cn('block h-full rounded-full', tone === 'success' ? 'bg-chart-2' : tone === 'info' ? 'bg-chart-1' : 'bg-warning')}
        style={{ width: `${v}%` }}
      />
    </span>
  )
}

/** Filter/search bar that sits above a list: wraps on phones, one row from sm. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>{children}</div>
}

/**
 * Settings layout: what a group is for on the left (large screens), the fields
 * in a card on the right. Stacks on phones and tablets.
 */
export function SettingsSection({
  title,
  description,
  children,
  footer,
  id,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  id?: string
}) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className="grid grid-cols-1 gap-3 scroll-mt-24 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10">
      <div className="lg:pt-5">
        <h2 id={headingId} className="text-[15px] font-semibold">
          {title}
        </h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="surface min-w-0 overflow-hidden">
        <div className="p-5">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-end">{footer}</div>}
      </div>
    </section>
  )
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
            'h-9 rounded-md px-3 text-[13px] font-medium md:h-7 md:px-2.5 md:text-xs text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
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
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm md:h-8 md:px-3 md:text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
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
        className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-base md:h-9 outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 md:text-[13px] dark:bg-input/20"
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
