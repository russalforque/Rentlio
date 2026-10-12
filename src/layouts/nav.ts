import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  DoorOpen,
  House,
  LayoutDashboard,
  ReceiptText,
  Settings,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import type { Enums } from '@/lib/database.types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Sidebar section heading. */
  group?: string
  /** Shows a live count next to the label. */
  badge?: 'pendingPayments'
  /** Included in the phone bottom bar. */
  mobileTab?: boolean
  /** Pinned to the bottom of the sidebar instead of the main list. */
  footer?: boolean
}

export const NAV: Record<Enums<'user_role'>, NavItem[]> = {
  landlord: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Menu', mobileTab: true },
    { to: '/rooms', label: 'Rooms', icon: DoorOpen, group: 'Menu' },
    { to: '/tenants', label: 'Tenants', icon: Users, group: 'Menu', mobileTab: true },
    { to: '/billing', label: 'Billing', icon: ReceiptText, group: 'Finance', mobileTab: true },
    { to: '/payments', label: 'Payments', icon: Wallet, group: 'Finance', badge: 'pendingPayments', mobileTab: true },
    { to: '/reports', label: 'Reports', icon: BarChart3, group: 'Finance' },
    { to: '/settings', label: 'Settings', icon: Settings, footer: true },
    { to: '/account', label: 'Account', icon: UserRound, footer: true },
  ],
  tenant: [
    { to: '/home', label: 'Home', icon: House, mobileTab: true },
    { to: '/my/bills', label: 'Bills', icon: ReceiptText, mobileTab: true },
    { to: '/my/payments', label: 'Payments', icon: Wallet, mobileTab: true },
    { to: '/my/room', label: 'My room', icon: DoorOpen, mobileTab: true },
    { to: '/account', label: 'Account', icon: UserRound, mobileTab: true, footer: true },
  ],
}
