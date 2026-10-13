import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  CalendarClock,
  CalendarX2,
  CircleX,
  DoorClosed,
  DoorOpen,
  FileText,
  FileX2,
  HandCoins,
  KeyRound,
  Megaphone,
  ReceiptText,
  ServerCrash,
  UserCheck,
  UserPlus,
  UserX,
  Wallet,
} from 'lucide-react'
import { format, isThisYear, isToday, isYesterday } from 'date-fns'
import type { Enums } from '@/lib/database.types'
import type { Notification, NotificationCategory, NotificationType } from './api'

export const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  registration_submitted: UserPlus,
  payment_submitted: Wallet,
  tenant_activated: KeyRound,
  move_in_today: DoorOpen,
  move_out_today: DoorClosed,
  bills_due_soon: CalendarClock,
  bills_overdue: CalendarX2,
  bills_generated: ReceiptText,
  billing_failed: AlertTriangle,
  system_error: ServerCrash,
  registration_approved: UserCheck,
  registration_rejected: UserX,
  bill_issued: ReceiptText,
  bill_voided: FileX2,
  rent_due_soon: CalendarClock,
  rent_due_today: BellRing,
  rent_overdue: CalendarX2,
  payment_rejected: CircleX,
  lease_started: DoorOpen,
  lease_updated: FileText,
  lease_ended: DoorClosed,
  announcement: Megaphone,
  payment_verified: BadgeCheck,
  payment_recorded: HandCoins,
}

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  payment: 'Payment',
  billing: 'Billing',
  account: 'Account',
  rental: 'Rental',
  system: 'System',
}

/** Soft tinted icon tile per category: enough to scan by, quiet enough not to shout. */
const CATEGORY_TONE: Record<NotificationCategory, string> = {
  payment: 'bg-success/10 text-success',
  billing: 'bg-info/10 text-info',
  account: 'bg-chip-violet/10 text-chip-violet',
  rental: 'bg-warning/15 text-warning-foreground',
  system: 'bg-muted text-foreground/70',
}

/** Things that need doing now read as urgent whatever their category. */
const URGENT = new Set<NotificationType>(['rent_overdue', 'bills_overdue', 'payment_rejected', 'billing_failed', 'system_error'])

export function toneFor(n: Pick<Notification, 'type' | 'category'>): string {
  return URGENT.has(n.type) ? 'bg-destructive/10 text-destructive' : CATEGORY_TONE[n.category]
}

/**
 * Where opening a notice leads. The target page loads through RLS like any
 * other, so a record the user may no longer see shows that page's "not found"
 * state rather than leaking anything.
 */
export function notificationLink(n: Notification, role: Enums<'user_role'>): string | null {
  const landlord = role === 'landlord'
  const id = n.related_entity_id
  switch (n.related_entity_type) {
    case 'bill':
      return id ? (landlord ? `/billing/bills/${id}` : `/my/bills/${id}`) : landlord ? '/billing' : '/my/bills'
    case 'payment':
      return landlord ? (n.type === 'payment_submitted' ? '/payments' : '/payments?tab=history') : '/my/payments'
    case 'tenant':
      return landlord && id ? `/tenants/${id}` : null
    case 'registration':
      return landlord ? '/registrations' : null
    case 'lease':
      return landlord ? null : '/my/room'
    case 'billing':
      return landlord ? '/billing' : '/my/bills'
  }
  if (n.type === 'registration_approved') return landlord ? '/dashboard' : '/home'
  return null
}

/** "Just now", "5m ago", "3h ago", "Yesterday, 4:05 PM", "Oct 3, 4:05 PM". */
export function relativeTime(iso: string, now: number): string {
  const d = new Date(iso)
  const secs = Math.max(0, (now - d.getTime()) / 1000)
  if (secs < 60) return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (isToday(d)) return `${Math.floor(secs / 3600)}h ago`
  if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`
  return format(d, isThisYear(d) ? 'MMM d, h:mm a' : 'MMM d, yyyy')
}

export type DayGroup = 'Today' | 'Yesterday' | 'Earlier'

/** Splits a newest-first list into Today / Yesterday / Earlier, keeping order. */
export function groupByDay(items: Notification[]): { label: DayGroup; items: Notification[] }[] {
  const groups: { label: DayGroup; items: Notification[] }[] = []
  for (const n of items) {
    const d = new Date(n.created_at)
    const label: DayGroup = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : 'Earlier'
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(n)
    else groups.push({ label, items: [n] })
  }
  return groups
}
