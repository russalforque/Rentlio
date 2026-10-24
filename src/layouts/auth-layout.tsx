import { Building2, CalendarClock, Inbox, ShieldCheck, TrendingUp, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Brand, BrandMark } from '@/components/app/brand'
import { IconChip } from '@/components/app/panel'
import { AuthEntryLayout } from './auth-entry-layout'

const BARS = [
  [62, 58],
  [70, 66],
  [66, 64],
  [78, 74],
  [84, 70],
  [90, 52],
]

/** A miniature of the dashboard: stat cards, the collections chart and a to-do row. Decorative only. */
function Preview() {
  return (
    <div className="relative mx-auto w-full max-w-136" aria-hidden>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Rooms let', value: '26/28', icon: Building2, accent: 'violet' as const },
          { label: 'Collected', value: '94%', icon: Wallet, accent: 'green' as const },
          { label: 'To verify', value: '3', icon: Inbox, accent: 'blue' as const },
        ].map((s) => (
          <div key={s.label} className="surface p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="truncate pt-1 text-[11px] font-medium text-muted-foreground">{s.label}</span>
              <IconChip icon={s.icon} accent={s.accent} className="size-7" />
            </div>
            <p className="font-display mt-2 text-xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="surface mt-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold">Collections analysis</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <TrendingUp className="size-3.5" /> +8% vs last month
          </span>
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full bg-chart-1" /> Billed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-full bg-chart-2" /> Collected
          </span>
        </div>
        <div className="mt-3 flex h-32 items-end justify-between border-b border-dashed px-1">
          {BARS.map(([billed, collected], i) => (
            <div key={i} className="flex h-full items-end gap-1">
              <span className="w-3 rounded-t-full bg-linear-to-b from-chart-1/60 to-chart-1" style={{ height: `${billed}%` }} />
              <span className="w-3 rounded-t-full bg-linear-to-b from-chart-2/60 to-chart-2" style={{ height: `${collected}%` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Floating notice, offset like a toast over the chart. */}
      <div className="surface absolute -right-4 -bottom-7 flex w-72 items-center gap-3 p-3 shadow-lg xl:-right-10">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border">
          <CalendarClock className="size-4 text-foreground/80" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold">October bills generated</span>
          <span className="block text-[11px] text-muted-foreground">26 rooms · utilities included</span>
        </span>
        <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success ring-1 ring-success/20 ring-inset">Done</span>
      </div>
    </div>
  )
}

export function AuthLayout() {
  const { pathname } = useLocation()
  if (['/login', '/register', '/forgot-password', '/set-password'].includes(pathname.replace(/\/+$/, ''))) return <AuthEntryLayout />

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-3 lg:p-3">
      <div className="flex min-h-dvh flex-col lg:min-h-0">
        <header className="px-gutter flex items-center py-5">
          <Brand />
        </header>
        <main className="px-gutter flex flex-1 items-start justify-center pt-4 pb-10 sm:items-center sm:pt-0 sm:pb-8">
          <div className="w-full max-w-100">
            <Outlet />
          </div>
        </main>
        <footer className="px-gutter flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Rentlio</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden /> Tenants only ever see their own records
          </span>
        </footer>
      </div>

      {/* Showcase panel: large screens only. */}
      <aside className="relative hidden overflow-hidden rounded-2xl border bg-muted/60 lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-25"
          style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-chip-violet/12 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-chip-green/10 blur-3xl" aria-hidden />

        <div className="relative px-10 pt-12 xl:px-14 xl:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-xs">
            <BrandMark className="size-5 rounded-md" /> Rental management for small properties
          </span>
          <h2 className="font-display mt-5 max-w-lg text-[34px] leading-[1.1] font-semibold text-balance xl:text-[40px]">
            Every room, every bill, in one calm place.
          </h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Bills generate themselves on your billing day. Tenants pay and upload proof, and you verify it in a tap.
          </p>
        </div>

        <div className="relative mt-auto px-10 pt-10 pb-16 xl:px-14">
          <Preview />
        </div>
      </aside>
    </div>
  )
}

/** Shared heading for the auth forms. */
export function AuthHeading({
  title,
  description,
  icon,
  titleId,
  eyebrow,
}: {
  title: string
  description: ReactNode
  icon?: ReactNode
  titleId?: string
  eyebrow?: string
}) {
  return (
    <div className="auth-heading mb-7">
      {icon}
      {eyebrow && <p className="auth-entry-eyebrow">{eyebrow}</p>}
      <h1 id={titleId} className="font-display text-[28px] leading-tight font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
