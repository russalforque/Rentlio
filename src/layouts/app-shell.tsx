import { ArrowLeft, ChevronDown, ChevronRight, LogOut, Monitor, Moon, MoreHorizontal, PanelLeft, Search, Sun, UserRound } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { BrandMark } from '@/components/app/brand'
import { CommandPalette } from '@/components/app/command-palette'
import { ThemeToggle } from '@/components/app/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserAvatar } from '@/features/account/user-avatar'
import { NotificationBell } from '@/features/notifications/notification-bell'
import { useNotificationsRealtime } from '@/features/notifications/use-notifications-realtime'
import { usePendingPayments } from '@/features/payments/api'
import { usePendingRegistrationCount } from '@/features/registrations/api'
import { useAuth, useProfile } from '@/hooks/use-auth'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useSettings } from '@/hooks/use-settings'
import { cn } from '@/lib/utils'
import { HOME_BY_ROLE } from '@/routes/home'
import { NAV, type NavItem } from './nav'

const COLLAPSE_KEY = 'rentlio:sidebar-collapsed'

type SidebarPref = 'collapsed' | 'expanded' | null

/** The user's explicit choice, or null to follow the screen width. */
function readSidebarPref(): SidebarPref {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY)
    return v === '1' ? 'collapsed' : v === '0' ? 'expanded' : null
  } catch {
    return null
  }
}

function CountBadge({ count, label, variant }: { count: number; label: string; variant: 'dot' | 'pill' }) {
  if (!count) return null
  return (
    <span
      className={cn(
        'rounded-full text-[10px] leading-none font-semibold tabular',
        variant === 'dot'
          ? 'absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center bg-destructive px-1 text-white ring-2 ring-sidebar'
          : 'ml-auto bg-destructive/10 px-1.5 py-1 text-destructive',
      )}
    >
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

/** Only mounted for nav items that show a count, so tenants never run these queries. */
function PendingPaymentsBadge({ variant }: { variant: 'dot' | 'pill' }) {
  const { data } = usePendingPayments()
  return <CountBadge count={data?.length ?? 0} label="waiting for verification" variant={variant} />
}

function PendingRegistrationsBadge({ variant }: { variant: 'dot' | 'pill' }) {
  const { data } = usePendingRegistrationCount()
  return <CountBadge count={data ?? 0} label="waiting for approval" variant={variant} />
}

function navBadge(item: NavItem, variant: 'dot' | 'pill') {
  if (item.badge === 'pendingPayments') return <PendingPaymentsBadge variant={variant} />
  if (item.badge === 'pendingRegistrations') return <PendingRegistrationsBadge variant={variant} />
  return null
}

/** Labelled on wide screens; an icon rail with tooltips on tablets or when collapsed. */
function SideLink({ item, wide }: { item: NavItem; wide: boolean }) {
  const { to, label, icon: Icon } = item
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          aria-label={label}
          // Static classes: Radix Slot cannot merge NavLink's function className. NavLink sets aria-current.
          className={cn(
            'group relative flex h-11 items-center justify-center gap-2.5 dense:h-9 rounded-lg text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-xs aria-[current=page]:ring-1 aria-[current=page]:ring-sidebar-border',
            wide && 'lg:justify-start lg:px-2.5',
          )}
        >
          <span className={cn('relative', wide && 'lg:static')}>
            <Icon className="size-4.5 lg:size-4" strokeWidth={1.8} />
            <span className={cn(wide && 'lg:hidden')}>{navBadge(item, 'dot')}</span>
          </span>
          <span className={cn('hidden', wide && 'lg:inline')}>{label}</span>
          <span className={cn('hidden', wide && 'lg:contents')}>{navBadge(item, 'pill')}</span>
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={12} className={cn(wide && 'lg:hidden')}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function DarkModeRow({ wide }: { wide: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <>
      <div className={cn('hidden h-9 items-center gap-2.5 px-2.5 text-[13px] font-medium text-sidebar-foreground', wide && 'lg:flex')}>
        <Moon className="size-4" strokeWidth={1.8} aria-hidden />
        <label htmlFor="dark-mode" className="flex-1 cursor-pointer">
          Dark mode
        </label>
        <Switch id="dark-mode" size="sm" checked={dark} onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')} />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'flex h-11 items-center justify-center rounded-lg text-sidebar-foreground dense:h-9 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              wide && 'lg:hidden',
            )}
          >
            {dark ? <Sun className="size-4.5" strokeWidth={1.8} /> : <Moon className="size-4.5" strokeWidth={1.8} />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12}>
          {dark ? 'Light mode' : 'Dark mode'}
        </TooltipContent>
      </Tooltip>
    </>
  )
}

function Sidebar({ wide, onToggle }: { wide: boolean; onToggle: () => void }) {
  const profile = useProfile()
  const { data: settings } = useSettings()
  const items = NAV[profile.role]
  const main = items.filter((i) => !i.footer)
  const groups = [...new Set(main.map((i) => i.group ?? 'Menu'))]
  const subtitle = settings?.property_address || (profile.role === 'landlord' ? 'Landlord workspace' : 'Tenant portal')

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden w-18 flex-col bg-sidebar px-3 py-4 text-sidebar-foreground md:flex',
        wide && 'lg:w-60 lg:px-4',
      )}
    >
      <div className={cn('mb-6 flex items-center justify-center', wide && 'lg:justify-between lg:gap-2 lg:rounded-xl lg:border lg:bg-card lg:p-2 lg:shadow-xs')}>
        <Link
          to={HOME_BY_ROLE[profile.role]}
          aria-label="Home"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <BrandMark className="size-9" />
          <span className={cn('hidden min-w-0', wide && 'lg:block')}>
            <span className="block truncate text-[13px] leading-tight font-semibold text-foreground">{settings?.property_name ?? 'Rentlio'}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
          </span>
        </Link>
        {wide && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="hidden size-10 shrink-0 place-items-center rounded-md text-muted-foreground dense:size-7 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:grid"
          >
            <PanelLeft className="size-4" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-1">
            <p className={cn('mb-1 hidden px-2.5 text-xs text-muted-foreground', wide && 'lg:block')}>{g}</p>
            {main.filter((i) => (i.group ?? 'Menu') === g).map((item) => <SideLink key={item.to} item={item} wide={wide} />)}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 pt-3">
        <DarkModeRow wide={wide} />
        {items.filter((i) => i.footer).map((item) => <SideLink key={item.to} item={item} wide={wide} />)}
        {!wide && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="mt-1 hidden h-11 place-items-center rounded-lg text-sidebar-foreground dense:h-9 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:grid"
          >
            <PanelLeft className="size-4.5" strokeWidth={1.8} />
          </button>
        )}
      </div>
    </aside>
  )
}

function UserMenu() {
  const profile = useProfile()
  const { signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-full p-1.5 transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dense:p-0.5 lg:rounded-lg lg:py-1 lg:pr-2 lg:pl-1"
          aria-label="Account menu"
        >
          <UserAvatar
            path={profile.avatar_path}
            name={profile.full_name}
            email={profile.email}
            className="size-8"
            fallbackClassName="bg-primary text-[11px] text-primary-foreground"
          />
          <span className="hidden text-left lg:block">
            <span className="block max-w-36 truncate text-[13px] leading-tight font-semibold">{profile.full_name || 'Your account'}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground capitalize">{profile.role}</span>
          </span>
          <ChevronDown className="hidden size-4 text-muted-foreground lg:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{profile.full_name || 'Your account'}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account">
            <UserRound /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} variant="destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const iconButton =
  'relative grid size-11 shrink-0 place-items-center rounded-full border bg-card dense:size-9 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

function SearchButton({ onOpen }: { onOpen: () => void }) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <>
      <button type="button" onClick={onOpen} aria-label="Search" className={cn(iconButton, 'md:hidden')}>
        <Search className="size-4" />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="hidden h-9 w-64 items-center gap-2 rounded-lg border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:flex lg:w-80"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search for anything…</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
    </>
  )
}

/** Phones: the main sections in a thumb-reachable bar; the rest behind "More". */
function TabBar({ items, more }: { items: NavItem[]; more: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const { signOut } = useAuth()
  const profile = useProfile()
  const location = useLocation()
  const moreActive = more.some((m) => location.pathname.startsWith(m.to))
  const cols = items.length + (more.length ? 1 : 0)
  const tab =
    'group flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none aria-[current=page]:font-semibold aria-[current=page]:text-foreground'
  const pill =
    'relative grid h-8 w-14 max-w-full place-items-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground'

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 px-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_hsl(var(--shadow-color)/0.06)] backdrop-blur-md md:hidden"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={tab}>
            <span className={pill}>
              <item.icon className="size-5" strokeWidth={1.8} />
              {navBadge(item, 'dot')}
            </span>
            <span className="max-w-full truncate px-0.5">{item.label}</span>
          </NavLink>
        ))}
        {more.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={tab}
            aria-current={moreActive ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <span className={pill}>
              <MoreHorizontal className="size-5" />
            </span>
            More
          </button>
        )}
      </nav>
      {more.length > 0 && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-3xl border-x-0 bg-card px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <span className="mx-auto mb-4 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
            <div className="mb-4 flex items-center gap-3 px-1">
              <UserAvatar
                path={profile.avatar_path}
                name={profile.full_name}
                email={profile.email}
                className="size-11"
                fallbackClassName="bg-primary text-sm text-primary-foreground"
              />
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-[15px] font-semibold">{profile.full_name || 'Your account'}</SheetTitle>
                <SheetDescription className="truncate text-[13px]">{profile.email}</SheetDescription>
              </div>
            </div>
            <nav aria-label="More" className="grid gap-1 rounded-2xl border p-1.5">
              {more.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-13 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors hover:bg-muted aria-[current=page]:bg-muted"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-muted text-foreground/80" aria-hidden>
                    <m.icon className="size-4.5" />
                  </span>
                  <span className="flex-1">{m.label}</span>
                  {navBadge(m, 'pill')}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 grid gap-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-[13px] font-medium text-muted-foreground">Appearance</span>
                <div className="w-40">
                  <ThemeToggle />
                </div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border text-[15px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const profile = useProfile()
  const { state } = useAuth()
  const { data: settings } = useSettings()
  const [searching, setSearching] = useState(false)
  const [sidebarPref, setSidebarPref] = useState(readSidebarPref)
  // Without an explicit choice: icon rail on tablet landscape and small laptops, labels from 1280px.
  const roomy = useMediaQuery('(min-width: 80rem)')
  const wide = sidebarPref ? sidebarPref === 'expanded' : roomy
  useNotificationsRealtime(state.status === 'signed-in' ? state.session.user.id : '')
  const items = NAV[profile.role]
  const current = items.find((n) => location.pathname.startsWith(n.to))
  // Pages outside the menu (notifications) still get a title and a way back.
  const offMenu = location.pathname.startsWith('/notifications')
  const nested = offMenu || (!!current && location.pathname.replace(/\/$/, '') !== current.to)
  const tabs = items.filter((n) => n.mobileTab)
  const more = items.filter((n) => !n.mobileTab)
  const isLandlord = profile.role === 'landlord'

  const toggleSidebar = () => {
    const next = wide ? 'collapsed' : 'expanded'
    try {
      localStorage.setItem(COLLAPSE_KEY, next === 'collapsed' ? '1' : '0')
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
    setSidebarPref(next)
  }

  // Detail pages go back to wherever the user came from (keeps filters and months), else to the section.
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(current?.to ?? HOME_BY_ROLE[profile.role])
  }

  useEffect(() => {
    if (!isLandlord) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearching((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isLandlord])

  return (
    <div className={cn('min-h-dvh md:pl-18', wide ? 'lg:pl-60' : 'lg:pl-18')}>
      <Sidebar wide={wide} onToggle={toggleSidebar} />

      <header className="px-gutter sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-2 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:gap-3">
        {nested ? (
          <button
            type="button"
            onClick={goBack}
            aria-label={current ? `Back to ${current.label}` : 'Back'}
            className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-full text-foreground hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dense:-ml-1 dense:size-9"
          >
            <ArrowLeft className="size-5 dense:size-4.5" />
          </button>
        ) : (
          <Link to={HOME_BY_ROLE[profile.role]} aria-label="Home" className="-ml-0.5 grid size-11 place-items-center rounded-lg md:hidden">
            <BrandMark className="size-9" />
          </Link>
        )}
        <p className="min-w-0 flex-1 truncate text-base font-semibold md:text-[15px]">{offMenu ? 'Notifications' : (current?.label ?? settings?.property_name ?? 'Rentlio')}</p>
        {isLandlord && <SearchButton onOpen={() => setSearching(true)} />}
        <NotificationBell className={iconButton} />
        <UserMenu />
      </header>

      <main className="px-gutter mx-auto w-full max-w-360 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10">
        <Outlet />
      </main>

      <TabBar items={tabs} more={isLandlord ? more : []} />
      {isLandlord && <CommandPalette open={searching} onOpenChange={setSearching} />}
    </div>
  )
}
