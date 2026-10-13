import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type Notification = Tables<'notifications'>
export type NotificationType = Enums<'notification_type'>
export type NotificationCategory = Enums<'notification_category'>
export type NotificationFilter = 'all' | 'unread'
export type PreferenceKey = 'payment_updates' | 'rent_reminders' | 'announcements' | 'general_updates'
export type NotificationPreferences = Record<PreferenceKey, boolean>

export const PAGE_SIZE = 20

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filter: NotificationFilter) => [...notificationKeys.lists(), filter] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
}

/** Keyset cursor: the last row of the previous page. Stable while new rows arrive at the top. */
interface Cursor {
  created_at: string
  id: string
}
export type NotificationPages = InfiniteData<Notification[], Cursor | null>

// Queries --------------------------------------------------------------------------

/** Newest first, a page at a time. RLS limits this to the signed-in login's own notices. */
export function useNotifications(filter: NotificationFilter) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(filter),
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)
      if (filter === 'unread') q = q.eq('is_read', false)
      if (pageParam) {
        const at = `"${pageParam.created_at}"`
        q = q.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${pageParam.id})`)
      }
      const { data, error } = await q
      if (error) throw error
      return data
    },
    getNextPageParam: (last): Cursor | null => {
      const tail = last.at(-1)
      return last.length < PAGE_SIZE || !tail ? null : { created_at: tail.created_at, id: tail.id }
    },
  })
}

/** A count-only request served by a partial index; kept live by the realtime subscription. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 5 * 60_000,
  })
}

// Cache helpers (shared with the realtime subscription) ----------------------------

/** Applies a change to every loaded notification in every list. */
export function patchNotifications(qc: QueryClient, fn: (n: Notification) => Notification) {
  qc.setQueriesData<NotificationPages>({ queryKey: notificationKeys.lists() }, (data) =>
    data ? { ...data, pages: data.pages.map((page) => page.map(fn)) } : data,
  )
}

/** Puts a new notice at the top of the loaded lists, once. Returns false if it was already there. */
export function prependNotification(qc: QueryClient, n: Notification): boolean {
  let added = false
  for (const filter of ['all', 'unread'] as const) {
    if (filter === 'unread' && n.is_read) continue
    qc.setQueryData<NotificationPages>(notificationKeys.list(filter), (data) => {
      if (!data || data.pages.some((page) => page.some((x) => x.id === n.id))) return data
      added = true
      const [first = [], ...rest] = data.pages
      return { ...data, pages: [[n, ...first], ...rest] }
    })
  }
  return added
}

export const bumpUnread = (qc: QueryClient, delta: number) =>
  qc.setQueryData<number>(notificationKeys.unreadCount(), (c) => (c === undefined ? c : Math.max(0, c + delta)))

// Mutations ------------------------------------------------------------------------

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids })
      if (error) throw error
    },
    // Optimistic: the dot clears at once; a failure restores the server state.
    onMutate: (ids) => {
      const now = new Date().toISOString()
      const unread = new Set<string>()
      patchNotifications(qc, (n) => {
        if (!ids.includes(n.id) || n.is_read) return n
        unread.add(n.id)
        return { ...n, is_read: true, read_at: now }
      })
      bumpUnread(qc, -unread.size)
    },
    onError: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('mark_all_notifications_read')
      if (error) throw error
      return data
    },
    onMutate: () => {
      const now = new Date().toISOString()
      patchNotifications(qc, (n) => (n.is_read ? n : { ...n, is_read: true, read_at: now }))
      qc.setQueryData(notificationKeys.unreadCount(), 0)
    },
    onError: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

// Preferences ----------------------------------------------------------------------

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  payment_updates: true,
  rent_reminders: true,
  announcements: true,
  general_updates: true,
}

/** No row yet means every optional notice is on. */
export function useNotificationPreferences(userId: string) {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: async (): Promise<NotificationPreferences> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('payment_updates, rent_reminders, announcements, general_updates')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data ?? DEFAULT_PREFERENCES
    },
  })
}

export function useUpdatePreferences(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      const { error } = await supabase.from('notification_preferences').upsert({ user_id: userId, ...prefs })
      if (error) throw error
    },
    onMutate: async (prefs) => {
      await qc.cancelQueries({ queryKey: notificationKeys.preferences() })
      const previous = qc.getQueryData<NotificationPreferences>(notificationKeys.preferences())
      qc.setQueryData(notificationKeys.preferences(), prefs)
      return { previous }
    },
    onError: (_err, _prefs, ctx) => qc.setQueryData(notificationKeys.preferences(), ctx?.previous),
  })
}

// Announcements ---------------------------------------------------------------------

export function useSendAnnouncement() {
  return useMutation({
    mutationFn: async ({ title, message }: { title: string; message: string }) => {
      const { data, error } = await supabase.rpc('send_announcement', { p_title: title, p_message: message })
      if (error) throw error
      return data
    },
  })
}
