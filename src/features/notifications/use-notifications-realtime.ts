import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { bumpUnread, notificationKeys, patchNotifications, prependNotification, type Notification, type NotificationCategory } from './api'

/** Data on screen that a new notice of each category means has changed. */
const STALE_BY_CATEGORY: Record<NotificationCategory, QueryKey[]> = {
  payment: [['payments'], ['billing'], ['finances'], ['tenants'], ['rooms'], ['dashboard']],
  billing: [['billing']],
  account: [['registrations'], ['tenants']],
  rental: [['portal'], ['tenants'], ['rooms']],
  system: [['billing']],
}

/**
 * Live notifications for the signed-in login. Mount once, in the app shell.
 *
 *   * The channel is filtered to the user's own rows, and Realtime enforces the
 *     notifications RLS policy as well, so nobody receives anyone else's.
 *   * New notices go straight into the cached lists and the unread count, so
 *     no extra request is made; ids already seen are ignored.
 *   * Read changes from another tab or device are mirrored.
 *   * After the connection drops and comes back, everything is refetched once,
 *     since notices may have been missed in between.
 */
export function useNotificationsRealtime(userId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    const seen = new Set<string>()
    let interrupted = false
    let countTimer: ReturnType<typeof setTimeout> | undefined

    // Many read events arrive together after "mark all as read" elsewhere.
    const refreshCountSoon = () => {
      clearTimeout(countTimer)
      countTimer = setTimeout(() => qc.invalidateQueries({ queryKey: notificationKeys.unreadCount() }), 400)
    }

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on<Notification>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_user_id=eq.${userId}` },
        ({ new: n }) => {
          if (seen.has(n.id)) return
          seen.add(n.id)
          prependNotification(qc, n)
          if (!n.is_read) bumpUnread(qc, 1)
          for (const key of STALE_BY_CATEGORY[n.category] ?? []) void qc.invalidateQueries({ queryKey: key })
        },
      )
      .on<Notification>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_user_id=eq.${userId}` },
        ({ new: n }) => {
          patchNotifications(qc, (x) => (x.id === n.id ? { ...x, is_read: n.is_read, read_at: n.read_at } : x))
          refreshCountSoon()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (interrupted) void qc.invalidateQueries({ queryKey: notificationKeys.all })
          interrupted = false
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // The client rejoins on its own; we only note that a catch-up is due.
          interrupted = true
        }
      })

    return () => {
      clearTimeout(countTimer)
      void supabase.removeChannel(channel)
    }
  }, [qc, userId])
}
