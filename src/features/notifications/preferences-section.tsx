import { ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/app/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAuth, useProfile } from '@/hooks/use-auth'
import { getErrorMessage } from '@/lib/errors'
import { useNotificationPreferences, useUpdatePreferences, type PreferenceKey } from './api'

const OPTIONS: Record<'landlord' | 'tenant', { key: PreferenceKey; label: string; description: string }[]> = {
  landlord: [
    { key: 'payment_updates', label: 'Payments', description: 'Payment proofs waiting for you to verify.' },
    { key: 'rent_reminders', label: 'Due and overdue summaries', description: 'A daily note of bills falling due soon and bills that became overdue.' },
    { key: 'general_updates', label: 'Tenant and billing activity', description: 'Move-ins and move-outs, tenants joining the portal, and automatic billing runs.' },
  ],
  tenant: [
    { key: 'payment_updates', label: 'Payment confirmations', description: 'When a payment you made is confirmed or recorded.' },
    { key: 'rent_reminders', label: 'Rent reminders', description: 'Before your rent is due, on the due date, and if it becomes overdue.' },
    { key: 'announcements', label: 'Announcements', description: 'Notices from your landlord, such as maintenance or water interruptions.' },
    { key: 'general_updates', label: 'Rental updates', description: 'Changes to your room, rent or tenancy.' },
  ],
}

export function NotificationPreferencesSection() {
  const profile = useProfile()
  const { state } = useAuth()
  const userId = state.status === 'signed-in' ? state.session.user.id : ''
  const { data, isPending } = useNotificationPreferences(userId)
  const update = useUpdatePreferences(userId)
  const options = OPTIONS[profile.role]
  const { hash } = useLocation()

  // Linked from the notification panel as /account#notifications.
  useEffect(() => {
    if (hash === '#notifications') document.getElementById('notifications')?.scrollIntoView({ block: 'start' })
  }, [hash])

  const toggle = (key: PreferenceKey, on: boolean) => {
    if (!data) return
    update.mutate({ ...data, [key]: on }, { onError: (err) => toast.error(getErrorMessage(err)) })
  }

  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      description="Choose which optional notices you receive in the app. Changes save automatically."
    >
      <div className="divide-y">
        {options.map((o) => (
          <div key={o.key} className="flex items-start justify-between gap-4 py-3 first:pt-0">
            <div className="min-w-0">
              <label htmlFor={`pref-${o.key}`} className="text-sm font-medium">
                {o.label}
              </label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{o.description}</p>
            </div>
            {isPending ? (
              <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
            ) : (
              <Switch id={`pref-${o.key}`} checked={data?.[o.key] ?? true} onCheckedChange={(on) => toggle(o.key, on)} />
            )}
          </div>
        ))}
        <p className="flex items-start gap-2 pt-3 text-[13px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {profile.role === 'landlord'
            ? 'New registrations, failed billing runs and other problems needing attention are always shown.'
            : 'New bills, cancelled bills, rejected payments and account changes are always shown.'}
        </p>
      </div>
    </SettingsSection>
  )
}
