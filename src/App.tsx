import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import type { ComponentType } from 'react'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'
import { FullPageSpinner } from '@/components/app/full-page-spinner'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/layouts/app-shell'
import { AuthLayout } from '@/layouts/auth-layout'
import { queryClient } from '@/lib/query-client'
import { isSupabaseConfigured } from '@/lib/supabase'
import { NotFoundPage, SetupRequiredPage } from '@/pages/shared/misc-pages'
import { AuthProvider } from '@/providers/auth-provider'
import { GuestOnly, HomeRedirect, RequireRole } from '@/routes/guards'

/** A lazily loaded route: pages download on demand, so tenants never fetch landlord screens. */
function page<M>(path: string, load: () => Promise<M>, pick: (m: M) => ComponentType): RouteObject {
  return { path, lazy: () => load().then((m) => ({ Component: pick(m) })) }
}

const router = createBrowserRouter([
  {
    HydrateFallback: FullPageSpinner,
    children: [
      { path: '/', element: <HomeRedirect /> },
      page('/auth/confirm', () => import('@/pages/auth/auth-confirm'), (m) => m.AuthConfirmPage),
      {
        element: <AuthLayout />,
        children: [
          {
            element: <GuestOnly />,
            children: [
              page('/login', () => import('@/pages/auth/login'), (m) => m.LoginPage),
              page('/forgot-password', () => import('@/pages/auth/forgot-password'), (m) => m.ForgotPasswordPage),
              page('/register', () => import('@/pages/auth/register'), (m) => m.RegisterPage),
            ],
          },
          page('/set-password', () => import('@/pages/auth/set-password'), (m) => m.SetPasswordPage),
        ],
      },
      {
        element: <RequireRole />,
        children: [
          // Standalone so it prints as a clean page; RLS limits it to the caller's own receipts.
          page('/receipts/:id', () => import('@/pages/shared/receipt'), (m) => m.ReceiptPage),
          {
            element: <AppShell />,
            children: [
              page('/account', () => import('@/pages/shared/account'), (m) => m.AccountPage),
              page('/notifications', () => import('@/pages/shared/notifications'), (m) => m.NotificationsPage),
              {
                element: <RequireRole role="landlord" />,
                children: [
                  page('/dashboard', () => import('@/pages/landlord/dashboard'), (m) => m.DashboardPage),
                  page('/rooms', () => import('@/pages/landlord/rooms'), (m) => m.RoomsPage),
                  page('/tenants', () => import('@/pages/landlord/tenants'), (m) => m.TenantsPage),
                  page('/tenants/:id', () => import('@/pages/landlord/tenant-detail'), (m) => m.TenantDetailPage),
                  page('/registrations', () => import('@/pages/landlord/registrations'), (m) => m.RegistrationsPage),
                  page('/billing', () => import('@/pages/landlord/billing'), (m) => m.BillingPage),
                  page('/billing/readings', () => import('@/pages/landlord/readings'), (m) => m.ReadingsPage),
                  page('/billing/bills/:id', () => import('@/pages/landlord/bill-detail'), (m) => m.BillDetailPage),
                  page('/payments', () => import('@/pages/landlord/payments'), (m) => m.PaymentsPage),
                  page('/reports', () => import('@/pages/landlord/reports'), (m) => m.ReportsPage),
                  page('/settings', () => import('@/pages/landlord/settings'), (m) => m.SettingsPage),
                ],
              },
              {
                element: <RequireRole role="tenant" />,
                children: [
                  page('/home', () => import('@/pages/tenant/home'), (m) => m.TenantHomePage),
                  page('/my/bills', () => import('@/pages/tenant/bills'), (m) => m.TenantBillsPage),
                  page('/my/bills/:id', () => import('@/pages/tenant/bill'), (m) => m.TenantBillPage),
                  page('/my/payments', () => import('@/pages/tenant/payments'), (m) => m.TenantPaymentsPage),
                  page('/my/room', () => import('@/pages/tenant/room'), (m) => m.TenantRoomPage),
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {isSupabaseConfigured ? (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      ) : (
        <SetupRequiredPage />
      )}
      <Toaster richColors closeButton position="top-center" />
    </ThemeProvider>
  )
}
