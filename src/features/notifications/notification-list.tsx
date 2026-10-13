import { BellOff, CheckCheck, Loader2, RotateCw } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/hooks/use-auth'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useMarkRead, useNotifications, type Notification, type NotificationFilter } from './api'
import { CATEGORY_LABEL, groupByDay, notificationLink, relativeTime, toneFor, TYPE_ICON } from './meta'

/** Current time, ticking each minute so "5m ago" stays true while a list is open. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function NotificationItem({
  n,
  now,
  compact,
  onOpen,
  onMarkRead,
}: {
  n: Notification
  now: number
  compact?: boolean
  onOpen: (n: Notification) => void
  onMarkRead: (n: Notification) => void
}) {
  const titleId = useId()
  const bodyId = useId()
  const Icon = TYPE_ICON[n.type]
  const unread = !n.is_read
  const time = relativeTime(n.created_at, now)
  // Announcements are read in place, in full; everything else is a short line that leads somewhere.
  const full = n.type === 'announcement'

  return (
    <li className={cn('group relative flex gap-3 px-4 transition-colors hover:bg-muted/50', compact ? 'py-3' : 'py-3.5 sm:px-5')}>
      {/* The whole row opens the notice; the read dot sits above it as its own control. */}
      <button
        type="button"
        onClick={() => onOpen(n)}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="absolute inset-0 z-0 rounded-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      />
      <span className={cn('pointer-events-none relative grid size-9 shrink-0 place-items-center rounded-lg', toneFor(n))} aria-hidden>
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p id={titleId} className={cn('min-w-0 text-[13px] leading-snug', unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
            <span className="sr-only">{unread ? 'Unread. ' : ''}{CATEGORY_LABEL[n.category]}: </span>
            {n.title}
          </p>
          <time dateTime={n.created_at} title={new Date(n.created_at).toLocaleString()} className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular">
            {time}
          </time>
        </div>
        <p
          id={bodyId}
          className={cn(
            'mt-0.5 text-[13px] leading-relaxed break-words text-muted-foreground',
            full ? 'whitespace-pre-line' : 'line-clamp-2',
          )}
        >
          {n.message}
        </p>
      </div>
      <div className="relative z-10 -mr-2 flex w-8 shrink-0 items-start justify-center">
        {unread && (
          <button
            type="button"
            onClick={() => onMarkRead(n)}
            aria-label={`Mark "${n.title}" as read`}
            title="Mark as read"
            className="grid size-8 place-items-center rounded-full transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="size-2 rounded-full bg-primary" aria-hidden />
          </button>
        )}
      </div>
    </li>
  )
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3.5">
          <span className="size-9 shrink-0 animate-pulse rounded-lg bg-muted" />
          <span className="flex-1 space-y-2 pt-0.5">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-muted" />
          </span>
        </div>
      ))}
    </div>
  )
}

interface ListProps {
  filter: NotificationFilter
  /** Dropdown density: tighter rows and a smaller empty state. */
  compact?: boolean
  /** Called after a notice is opened, e.g. to close the dropdown. */
  onNavigate?: () => void
}

/**
 * Newest-first notices grouped into Today / Yesterday / Earlier. Older pages
 * load as the end of the list scrolls into view, with a button as fallback.
 */
export function NotificationList({ filter, compact, onNavigate }: ListProps) {
  const profile = useProfile()
  const navigate = useNavigate()
  const now = useNow()
  const query = useNotifications(filter)
  const markRead = useMarkRead()
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query

  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const open = (n: Notification) => {
    if (!n.is_read) markRead.mutate([n.id])
    const to = notificationLink(n, profile.role)
    if (to) {
      onNavigate?.()
      void navigate(to)
    }
  }

  if (query.isPending) return <ListSkeleton rows={compact ? 4 : 6} />

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
        <p className="text-[13px] font-medium">Could not load notifications</p>
        <p className="mt-1 text-xs text-muted-foreground">{getErrorMessage(query.error)}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>
          <RotateCw /> Try again
        </Button>
      </div>
    )
  }

  const items = query.data.pages.flat()
  if (items.length === 0) {
    const Icon = filter === 'unread' ? CheckCheck : BellOff
    return (
      <div className={cn('flex flex-col items-center px-6 text-center', compact ? 'py-10' : 'py-16')}>
        <span className="mb-3 grid size-11 place-items-center rounded-xl border bg-muted text-foreground/60">
          <Icon className="size-5" aria-hidden />
        </span>
        <p className="text-[14px] font-semibold">{filter === 'unread' ? "You're all caught up" : 'No notifications yet'}</p>
        <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
          {filter === 'unread'
            ? 'New notices about bills, payments and your account will appear here.'
            : profile.role === 'landlord'
              ? 'Payments to verify, new registrations and billing updates will appear here.'
              : 'Bills, payment confirmations and rent reminders will appear here.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      {groupByDay(items).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3
            className={cn(
              'sticky z-20 border-b bg-card/95 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm',
              // In the dropdown the list scrolls itself; on the page, the window scrolls under the app header.
              compact ? 'top-0' : 'top-[calc(4rem+env(safe-area-inset-top))] sm:px-5',
            )}
          >
            {group.label}
          </h3>
          <ul className="divide-y">
            {group.items.map((n) => (
              <NotificationItem key={n.id} n={n} now={now} compact={compact} onOpen={open} onMarkRead={(x) => markRead.mutate([x.id])} />
            ))}
          </ul>
        </section>
      ))}
      {hasNextPage ? (
        <div ref={sentinel} className="border-t px-4 py-2 text-center">
          <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage && <Loader2 className="animate-spin" />}
            {isFetchingNextPage ? 'Loading…' : 'Show older notifications'}
          </Button>
        </div>
      ) : (
        items.length > 8 && <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">You've reached the end</p>
      )}
    </div>
  )
}
