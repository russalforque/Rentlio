import { CalendarClock, ShieldCheck, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { Brand } from '@/components/app/brand'
import { ThemeToggle } from '@/components/app/theme-toggle'

const LIT = new Set([0, 2, 3, 5, 6, 8, 9, 10, 12, 13, 15, 17, 18, 19, 21, 22, 24, 25, 26])

/** A 28-window facade: lit windows are occupied rooms. Decorative only. */
function Facade() {
  const cols = 7
  return (
    <svg viewBox="0 0 360 300" className="w-full max-w-md" aria-hidden>
      <defs>
        <linearGradient id="facade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.12" />
          <stop offset="1" stopColor="white" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d="M20 92 180 18l160 74" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="3" strokeLinejoin="round" />
      <rect x="40" y="88" width="280" height="200" rx="10" fill="url(#facade)" stroke="white" strokeOpacity="0.18" />
      {Array.from({ length: 28 }, (_, i) => {
        const c = i % cols
        const r = Math.floor(i / cols)
        const lit = LIT.has(i)
        return (
          <rect
            key={i}
            x={60 + c * 36}
            y={106 + r * 42}
            width="24"
            height="28"
            rx="4"
            fill={lit ? 'var(--highlight)' : 'white'}
            fillOpacity={lit ? 0.92 : 0.08}
          />
        )
      })}
      <rect x="166" y="262" width="28" height="26" rx="3" fill="white" fillOpacity="0.2" />
    </svg>
  )
}

function Point({ icon: Icon, children }: { icon: typeof Wallet; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="pt-1.5 text-sm text-hero-muted">{children}</span>
    </li>
  )
}

export function AuthLayout() {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel: large screens only. */}
      <aside className="relative hidden overflow-hidden bg-hero p-10 text-hero-foreground lg:flex lg:flex-col xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-32 -bottom-40 size-130 rounded-full bg-chip-violet/25 blur-3xl" aria-hidden />
        <Brand inverted className="relative" />
        <div className="relative my-auto max-w-lg py-12">
          <Facade />
          <h2 className="font-display mt-10 text-4xl leading-[1.1] font-semibold tracking-tight text-balance xl:text-[42px]">
            Every room, every bill, in one calm place.
          </h2>
          <ul className="mt-8 space-y-3.5">
            <Point icon={CalendarClock}>Bills generate themselves on your billing day, utilities included.</Point>
            <Point icon={Wallet}>Tenants pay and upload proof; you verify in a tap.</Point>
            <Point icon={ShieldCheck}>Private by design. Tenants only ever see their own records.</Point>
          </ul>
        </div>
        <p className="relative text-xs text-hero-muted/80">© {new Date().getFullYear()} Rentlio</p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Brand className="lg:invisible" />
          <div className="w-28">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-start justify-center px-5 pt-4 pb-16 sm:items-center sm:px-8 sm:pt-0">
          <div className="w-full max-w-100">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

/** Shared heading for the auth forms. */
export function AuthHeading({ title, description, icon }: { title: string; description: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-8">
      {icon}
      <h1 className="font-display text-[26px] leading-tight font-semibold">{title}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{description}</p>
    </div>
  )
}
