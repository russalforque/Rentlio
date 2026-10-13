import { format } from 'date-fns'
import { CalendarClock, Gauge, Inbox, type LucideIcon, MailWarning, Percent, ReceiptText, Send, Tags, UserCheck } from 'lucide-react'
import type { RoomOverview } from '@/features/rooms/api'
import { formatMoney, formatPeriod } from '@/lib/format'
import { pct, type MonthRow } from './metrics'

/** Rows always shown, padded with standing insights when there is little to do. */
const MIN_ROWS = 4

export interface ActionItem {
  key: string
  icon: LucideIcon
  title: string
  note: string
  to?: string
  trailing?: { text: string; alert?: boolean }
}

export interface ActionInput {
  period: string
  today: Date
  billingDay: number
  next: { issue: Date; due: Date }
  rooms: RoomOverview[]
  /** Lease ids that already have a live bill for `period`. */
  billedLeases: Set<string>
  pendingCount: number
  /** Billable rooms on this period's meter sheet still lacking a reading. */
  missingReadings: number
  invitedTenants: number
  /** Self-registrations waiting for the landlord's decision. */
  pendingRegistrations: number
  /** This month's bills generated but not yet finalized and sent. */
  draftBills: number
  /** Drafts with every required charge, ready to send. */
  readyDrafts: number
  thisMonth: MonthRow | undefined
  currency: string
}

/** Things to act on first, each one tap from the fix. */
export function buildTodos(i: ActionInput): ActionItem[] {
  const todos: ActionItem[] = []
  const month = formatPeriod(i.period)

  if (i.pendingCount) {
    todos.push({
      key: 'verify',
      icon: Inbox,
      title: `${i.pendingCount} ${i.pendingCount === 1 ? 'payment' : 'payments'} to verify`,
      note: 'Tenants uploaded proof of payment',
      to: '/payments',
      trailing: { text: 'Review', alert: true },
    })
  }

  if (i.pendingRegistrations > 0) {
    todos.push({
      key: 'registrations',
      icon: UserCheck,
      title: `${i.pendingRegistrations} ${i.pendingRegistrations === 1 ? 'registration' : 'registrations'} to review`,
      note: 'Verify identity before granting access',
      to: '/registrations',
      trailing: { text: 'Review', alert: true },
    })
  }

  // Bills are generated on the billing day, so before it a missing bill is expected, not a to-do.
  // Matched per lease: comparing counts lets a mid-month move-out's bill hide an unbilled room.
  if (i.today.getDate() >= i.billingDay) {
    const unbilled = i.rooms.filter((r) => r.occupancy === 'occupied' && r.lease_id && !i.billedLeases.has(r.lease_id)).length
    if (unbilled > 0) {
      todos.push({
        key: 'generate',
        icon: ReceiptText,
        title: i.billedLeases.size === 0 ? `${month} bills not generated` : `${unbilled} ${unbilled === 1 ? 'room' : 'rooms'} without a bill`,
        note: `Occupied rooms missing their ${month} bill`,
        to: `/billing?period=${i.period}`,
      })
    }
  }

  if (i.draftBills > 0) {
    todos.push({
      key: 'finalize',
      icon: Send,
      title: `${i.draftBills} ${month} ${i.draftBills === 1 ? 'bill' : 'bills'} not sent`,
      note: i.readyDrafts > 0 ? `${i.readyDrafts} ready to finalize` : 'Waiting for meter readings',
      to: `/billing?period=${i.period}`,
      trailing: i.readyDrafts > 0 ? { text: 'Send' } : undefined,
    })
  }

  if (i.missingReadings > 0) {
    todos.push({
      key: 'readings',
      icon: Gauge,
      title: `${i.missingReadings} meter ${i.missingReadings === 1 ? 'reading' : 'readings'} missing`,
      note: `Needed for ${month} electricity charges`,
      to: `/billing/readings?period=${i.period}`,
    })
  }

  const unpriced = i.rooms.filter((r) => r.monthly_rent <= 0).length
  if (unpriced > 0) {
    todos.push({ key: 'rent', icon: Tags, title: `${unpriced} ${unpriced === 1 ? 'room has' : 'rooms have'} no rent`, note: 'Set a standard monthly rent', to: '/rooms' })
  }

  if (i.invitedTenants > 0) {
    todos.push({
      key: 'invites',
      icon: MailWarning,
      title: `${i.invitedTenants} ${i.invitedTenants === 1 ? 'invite' : 'invites'} not accepted`,
      note: 'Tenants who have not activated their account',
      to: '/tenants',
    })
  }

  return todos
}

/** Standing facts that fill the card when the to-do list is short. */
function buildStanding({ thisMonth, next, currency }: ActionInput): ActionItem[] {
  return [
    {
      key: 'rate',
      icon: Percent,
      title: 'Collection rate',
      note: thisMonth?.billed
        ? `${formatMoney(thisMonth.collected, currency)} of ${formatMoney(thisMonth.billed, currency)} this month`
        : 'Nothing billed this month yet',
      trailing: thisMonth?.billed ? { text: `${pct(thisMonth.collected, thisMonth.billed)}%` } : undefined,
    },
    {
      key: 'next',
      icon: CalendarClock,
      title: 'Next billing run',
      note: `Issued ${format(next.issue, 'EEE, MMM d')} · due ${format(next.due, 'MMM d')}`,
    },
  ]
}

/** To-dos first, then standing insights up to MIN_ROWS. */
export function buildActionRows(input: ActionInput) {
  const todos = buildTodos(input)
  return { todoCount: todos.length, rows: [...todos, ...buildStanding(input)].slice(0, Math.max(MIN_ROWS, todos.length)) }
}
