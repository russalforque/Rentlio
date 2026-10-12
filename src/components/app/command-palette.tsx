import type { LucideIcon } from 'lucide-react'
import { CornerDownLeft, DoorOpen, Gauge, Inbox, Search, Sparkles, UserRound } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useRoomOverview } from '@/features/rooms/api'
import { useTenants } from '@/features/tenants/api'
import { NAV } from '@/layouts/nav'
import { cn } from '@/lib/utils'

interface Command {
  id: string
  group: 'Pages' | 'Actions' | 'Tenants' | 'Rooms'
  label: string
  hint?: string
  icon: LucideIcon
  to: string
  keywords?: string
}

const ACTIONS: Command[] = [
  { id: 'a-readings', group: 'Actions', label: 'Enter meter readings', icon: Gauge, to: '/billing/readings', keywords: 'electricity water meter' },
  { id: 'a-verify', group: 'Actions', label: 'Verify payment proofs', icon: Inbox, to: '/payments', keywords: 'approve review proof' },
  { id: 'a-generate', group: 'Actions', label: 'Generate this month’s bills', icon: Sparkles, to: '/billing', keywords: 'bill invoice' },
]

/** Results only mount while the palette is open, so tenants and rooms load on demand. */
function PaletteBody({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const listId = useId()
  const { data: tenants } = useTenants()
  const { data: rooms } = useRoomOverview()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pages: Command[] = NAV.landlord.map((n) => ({ id: `p-${n.to}`, group: 'Pages', label: n.label, icon: n.icon, to: n.to }))
    const people: Command[] = (tenants ?? []).map((t) => ({
      id: `t-${t.id}`,
      group: 'Tenants',
      label: t.full_name || t.email,
      hint: t.room_number ? `Room ${t.room_number}` : 'No room',
      icon: UserRound,
      to: `/tenants/${t.id}`,
      keywords: `${t.email} ${t.phone ?? ''} ${t.room_number ?? ''}`,
    }))
    const places: Command[] = (rooms ?? []).map((r) => ({
      id: `r-${r.id}`,
      group: 'Rooms',
      label: `Room ${r.room_number}`,
      hint: r.tenant_name ?? (r.occupancy === 'maintenance' ? 'Maintenance' : 'Vacant'),
      icon: DoorOpen,
      to: r.tenant_id ? `/tenants/${r.tenant_id}` : '/rooms',
      keywords: r.tenant_name ?? '',
    }))
    const match = (c: Command) => !q || `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q)
    // With no query, show navigation only; people and rooms appear as you type.
    return [
      ...pages.filter(match),
      ...ACTIONS.filter(match),
      ...(q ? people.filter(match).slice(0, 6) : []),
      ...(q ? places.filter(match).slice(0, 6) : []),
    ]
  }, [query, tenants, rooms])

  const go = (c: Command | undefined) => {
    if (!c) return
    onDone()
    navigate(c.to)
  }
  const current = Math.min(active, Math.max(0, results.length - 1))

  return (
    <div className="flex max-h-[min(70dvh,560px)] flex-col">
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[current] ? `${listId}-${results[current].id}` : undefined}
          aria-label="Search pages, tenants and rooms"
          placeholder="Search pages, tenants, rooms…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              go(results[current])
            }
          }}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline">Esc</kbd>
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 && <li className="px-3 py-10 text-center text-sm text-muted-foreground">No matches for “{query}”</li>}
        {results.map((c, i) => (
          <li key={c.id} role="presentation">
            {(i === 0 || results[i - 1]?.group !== c.group) && (
              <p className="eyebrow px-3 pt-3 pb-1.5" aria-hidden>
                {c.group}
              </p>
            )}
            <div
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={i === current}
              onPointerMove={() => setActive(i)}
              onClick={() => go(c)}
              className={cn(
                'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[13px]',
                i === current && 'bg-muted text-foreground',
              )}
            >
              <c.icon className="size-4 shrink-0 opacity-70" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
              {c.hint && <span className="truncate text-xs text-muted-foreground">{c.hint}</span>}
              {i === current && <CornerDownLeft className="size-3.5 shrink-0 opacity-60" aria-hidden />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:top-[14%] sm:max-w-xl sm:translate-y-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Jump to a page, tenant or room.</DialogDescription>
        {open && <PaletteBody onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
