import { Bell, CheckCheck, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Segmented } from '@/components/app/panel'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useMarkAllRead, useUnreadCount, type NotificationFilter } from './api'
import { NotificationList } from './notification-list'

function CountDot({ count }: { count: number }) {
  if (!count) return null
  return (
    <span
      className="absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular ring-2 ring-background"
      aria-hidden
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

const bellLabel = (count: number) => (count ? `Notifications, ${count} unread` : 'Notifications')

/** "Mark all as read" for a panel or page header. */
export function MarkAllReadButton({ className }: { className?: string }) {
  const { data: count = 0 } = useUnreadCount()
  const markAll = useMarkAllRead()
  return (
    <button
      type="button"
      onClick={() => markAll.mutate()}
      disabled={!count || markAll.isPending}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <CheckCheck className="size-3.5" aria-hidden /> Mark all as read
    </button>
  )
}

function NotificationPanel({ onNavigate }: { onNavigate: () => void }) {
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const { data: count = 0 } = useUnreadCount()
  return (
    <div className="flex max-h-[min(36rem,calc(100dvh-6rem))] flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 pt-3.5 pb-3">
        <p className="text-[15px] font-semibold">Notifications</p>
        <MarkAllReadButton className="-mr-1.5" />
      </div>
      <div className="px-4 py-2.5">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: count ? `Unread (${count > 99 ? '99+' : count})` : 'Unread' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
        <NotificationList filter={filter} compact onNavigate={onNavigate} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-2 py-1.5">
        <Link
          to="/notifications"
          onClick={onNavigate}
          className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          View all notifications
        </Link>
        <Link
          to="/account#notifications"
          onClick={onNavigate}
          aria-label="Notification settings"
          title="Notification settings"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Settings2 className="size-4" />
        </Link>
      </div>
    </div>
  )
}

/**
 * Header bell with the unread count. Desktop opens a compact panel; phones go
 * to the full notifications page, which suits a small screen better than a
 * shrunken dropdown.
 */
export function NotificationBell({ className }: { className: string }) {
  const { data: count = 0 } = useUnreadCount()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Link to="/notifications" aria-label={bellLabel(count)} className={cn(className, 'md:hidden')}>
        <Bell className="size-4.5" />
        <CountDot count={count} />
      </Link>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={bellLabel(count)} className={cn(className, 'hidden md:grid', open && 'text-foreground')}>
            <Bell className="size-4" />
            <CountDot count={count} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[25rem] overflow-hidden p-0">
          <NotificationPanel onNavigate={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
      <span className="sr-only" role="status" aria-live="polite">
        {count ? `${count} unread notifications` : ''}
      </span>
    </>
  )
}
