import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bell,
  ChartNoAxesCombined,
  CreditCard,
  DoorOpen,
  House,
  LayoutDashboard,
  ReceiptText,
  Settings,
  UserCheck,
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
  badge?: 'pendingPayments' | 'pendingRegistrations'
  /** Included in the phone bottom bar. */
  mobileTab?: boolean
  /** Pinned to the bottom of the sidebar instead of the main list. */
  footer?: boolean
}

export const NAV: Record<Enums<'user_role'>, NavItem[]> = {
  landlord: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Menu', mobileTab: true },
    { to: '/rooms', label: 'Rooms', icon: DoorOpen, group: 'Menu', mobileTab: true },
    { to: '/tenants', label: 'Tenants', icon: Users, group: 'Menu', mobileTab: true },
    { to: '/registrations', label: 'Registrations', icon: UserCheck, group: 'Menu', badge: 'pendingRegistrations' },
    { to: '/billing', label: 'Billing', icon: ReceiptText, group: 'Finance' },
    { to: '/payments', label: 'Payments', icon: Wallet, group: 'Finance', badge: 'pendingPayments', mobileTab: true },
    { to: '/finances', label: 'Finances', icon: ChartNoAxesCombined, group: 'Finance' },
    { to: '/reports', label: 'Reports', icon: BarChart3, group: 'Finance' },
    { to: '/settings', label: 'Settings', icon: Settings, footer: true },
    { to: '/account', label: 'Account', icon: UserRound, footer: true },
  ],
  tenant: [
    { to: '/home', label: 'Home', icon: House, mobileTab: true },
    { to: '/my/bills', label: 'Bills', icon: ReceiptText, mobileTab: true },
    { to: '/my/pay-online', label: 'Pay', icon: CreditCard, mobileTab: true },
    { to: '/my/room', label: 'My room', icon: DoorOpen, mobileTab: true },
    { to: '/my/payments', label: 'Payment history', icon: Wallet, group: 'Account' },
    { to: '/notifications', label: 'Notifications', icon: Bell, group: 'Account' },
    { to: '/account', label: 'Profile', icon: UserRound, group: 'Account', footer: true },
  ],
}
