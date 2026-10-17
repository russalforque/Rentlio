import { Megaphone, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/app/page-header'
import { FilterChips } from '@/components/app/panel'
import { Button } from '@/components/ui/button'
import { AnnouncementDialog } from '@/features/notifications/announcement-dialog'
import { useUnreadCount, type NotificationFilter } from '@/features/notifications/api'
import { MarkAllReadButton } from '@/features/notifications/notification-bell'
import { NotificationList } from '@/features/notifications/notification-list'
import { useProfile } from '@/hooks/use-auth'

export function NotificationsPage() {
  const profile = useProfile()
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [announcing, setAnnouncing] = useState(false)
  const { data: unread = 0 } = useUnreadCount()
  const isLandlord = profile.role === 'landlord'

  return (
    <div className={`${isLandlord ? '' : 'tenant-page'} mx-auto max-w-3xl space-y-6`}>
      <PageHeader
        title="Notifications"
        description={
          isLandlord
            ? 'Payments to verify, registrations, billing and reminders.'
            : 'Your bills, payments, reminders and notices from your landlord.'
        }
        actions={
          <>
            {isLandlord && (
              <Button variant="outline" onClick={() => setAnnouncing(true)}>
                <Megaphone /> <span className="hidden sm:inline">Announcement</span>
                <span className="sr-only sm:hidden">New announcement</span>
              </Button>
            )}
            <Button variant="outline" size="icon" asChild>
              <Link to="/account#notifications" aria-label="Notification settings" title="Notification settings">
                <Settings2 />
              </Link>
            </Button>
          </>
        }
        tabs={
          <div className="flex items-center justify-between gap-3">
            <FilterChips
              label="Show"
              className="mx-0 min-w-0 px-0"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread', count: unread },
              ]}
            />
            <MarkAllReadButton className="shrink-0" />
          </div>
        }
      />

      {/* overflow-clip keeps the rounded corners without breaking the sticky day headings. */}
      <div className="surface overflow-clip">
        <NotificationList filter={filter} />
      </div>

      {isLandlord && <AnnouncementDialog open={announcing} onOpenChange={setAnnouncing} />}
    </div>
  )
}
