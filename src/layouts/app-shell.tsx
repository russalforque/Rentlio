import { ArrowLeft, Bell, ChevronDown, LogOut, Monitor, Moon, MoreHorizontal, PanelLeft, Search, Sun, UserRound } from 'lucide-react'
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
import { usePendingPayments } from '@/features/payments/api'
import { useAuth, useProfile } from '@/hooks/use-auth'
import { useSettings } from '@/hooks/use-settings'
import { cn } from '@/lib/utils'
import { HOME_BY_ROLE } from '@/routes/home'
import { NAV, type NavItem } from './nav'

const COLLAPSE_KEY = 'rentlio:sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** Only mounted for nav items that show a count, so tenants never run this query. */
function PendingPaymentsBadge({ variant }: { variant: 'dot' | 'pill' }) {
  const { data } = usePendingPayments()
  if (!data?.length) return null
  return (
    <span
      className={cn(
        'rounded-full text-[10px] leading-none font-semibold tabular',
        variant === 'dot'
          ? 'absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center bg-destructive px-1 text-white ring-2 ring-sidebar'
          : 'ml-auto bg-destructive/10 px-1.5 py-1 text-destructive',
      )}
    >
      {data.length}
      <span className="sr-only"> waiting for verification</span>
    </span>
  )
}

function navBadge(item: NavItem, variant: 'dot' | 'pill') {
  return item.badge === 'pendingPayments' ? <PendingPaymentsBadge variant={variant} /> : null
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
            'group relative flex h-9 items-center justify-center gap-2.5 rounded-lg text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:shadow-xs aria-[current=page]:ring-1 aria-[current=page]:ring-sidebar-border',
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
              'flex h-9 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
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
            className="hidden size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:grid"
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
            className="mt-1 hidden h-9 place-items-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:grid"
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
          className="flex items-center gap-2.5 rounded-full p-0.5 transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:rounded-lg lg:py-1 lg:pr-2 lg:pl-1"
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
  'relative grid size-9 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

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

/** Bell: lights up when payment proofs are waiting. */
function NotificationsButton() {
  const { data } = usePendingPayments()
  const count = data?.length ?? 0
  return (
    <Link to="/payments" aria-label={count ? `${count} payments to verify` : 'Notifications'} className={iconButton}>
      <Bell className="size-4" />
      {count > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-destructive ring-2 ring-card" aria-hidden />}
    </Link>
  )
}

/** Phones: the main sections in a thumb-reachable bar; the rest behind "More". */
function TabBar({ items, more }: { items: NavItem[]; more: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const { signOut } = useAuth()
  const location = useLocation()
  const moreActive = more.some((m) => location.pathname.startsWith(m.to))
  const cols = items.length + (more.length ? 1 : 0)
  const tab = 'group flex flex-col items-center gap-1 pt-2 pb-2 text-[11px] font-medium text-muted-foreground aria-[current=page]:text-foreground'
  const pill = 'relative grid h-8 w-14 place-items-center rounded-full transition-colors group-aria-[current=page]:bg-muted'

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className={tab}>
            <span className={pill}>
              <item.icon className="size-5" strokeWidth={1.8} />
              {navBadge(item, 'dot')}
            </span>
            {item.label}
          </NavLink>
        ))}
        {more.length > 0 && (
          <button type="button" onClick={() => setOpen(true)} className={tab} aria-current={moreActive ? 'page' : undefined}>
            <span className={pill}>
              <MoreHorizontal className="size-5" />
            </span>
            More
          </button>
        )}
      </nav>
      {more.length > 0 && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl bg-card px-4 pt-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <SheetTitle className="px-2 text-base font-semibold">More</SheetTitle>
            <SheetDescription className="sr-only">Other sections</SheetDescription>
            <nav aria-label="More" className="grid grid-cols-2 gap-2">
              {more.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-xl border px-4 text-[13px] font-medium aria-[current=page]:border-foreground/30 aria-[current=page]:bg-muted"
                >
                  <m.icon className="size-4.5 text-muted-foreground" />
                  {m.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <div className="w-36">
                <ThemeToggle />
              </div>
              <button type="button" onClick={signOut} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-destructive hover:bg-destructive/10">
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
  const { data: settings } = useSettings()
  const [searching, setSearching] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const items = NAV[profile.role]
  const current = items.find((n) => location.pathname.startsWith(n.to))
  const nested = !!current && location.pathname.replace(/\/$/, '') !== current.to
  const tabs = items.filter((n) => n.mobileTab)
  const more = items.filter((n) => !n.mobileTab)
  const isLandlord = profile.role === 'landlord'

  const toggleSidebar = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        // Storage blocked: the choice lasts for this visit only.
      }
      return !c
    })

  // Detail pages go back to wherever the user came from (keeps filters and months), else to the section.
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else if (current) navigate(current.to)
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
    <div className={cn('min-h-dvh md:pl-18', collapsed ? 'lg:pl-18' : 'lg:pl-60')}>
      <Sidebar wide={!collapsed} onToggle={toggleSidebar} />

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-background/90 px-4 backdrop-blur-md sm:px-6">
        {nested ? (
          <button
            type="button"
            onClick={goBack}
            aria-label={`Back to ${current?.label}`}
            className="-ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-foreground hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft className="size-4.5" />
          </button>
        ) : (
          <Link to={HOME_BY_ROLE[profile.role]} aria-label="Home" className="md:hidden">
            <BrandMark className="size-8" />
          </Link>
        )}
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{current?.label ?? settings?.property_name ?? 'Rentlio'}</p>
        {isLandlord && <SearchButton onOpen={() => setSearching(true)} />}
        {isLandlord && <NotificationsButton />}
        <UserMenu />
      </header>

      <main className="mx-auto w-full max-w-360 px-4 pt-2 pb-28 sm:px-6 md:pb-10">
        <Outlet />
      </main>

      <TabBar items={tabs} more={isLandlord ? more : []} />
      {isLandlord && <CommandPalette open={searching} onOpenChange={setSearching} />}
    </div>
  )
}
