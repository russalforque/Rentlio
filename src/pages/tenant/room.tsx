import { Building2, DoorOpen, Mail, Phone, PiggyBank, ScrollText, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDepositLedger } from '@/features/tenants/api'
import { useMyDepositBalance, useMyTenancy } from '@/features/portal/api'
import { useProfile } from '@/hooks/use-auth'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { formatDate, formatMoney } from '@/lib/format'

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  )
}

const DEPOSIT_LABEL = { received: 'Deposit received', deduction: 'Deduction', refund: 'Refund' } as const

export function TenantRoomPage() {
  const profile = useProfile()
  const currency = useCurrency()
  const settings = useSettings()
  const tenancy = useMyTenancy()
  const deposit = useMyDepositBalance()
  const ledger = useDepositLedger(profile.id)

  if (tenancy.error) return <ErrorState error={tenancy.error} onRetry={() => tenancy.refetch()} />
  const lease = tenancy.data?.current
  const s = settings.data

  return (
    <div className="space-y-5">
      <PageHeader title="My room" description="Your room, rental terms and how to reach your landlord." />

      {tenancy.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !lease ? (
        <EmptyState icon={DoorOpen} title="No room assigned" description="Your landlord has not assigned you a room yet." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-3xl">Room {lease.rooms?.room_number}</CardTitle>
            {lease.rooms?.description && <p className="text-[13px] text-muted-foreground">{lease.rooms.description}</p>}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Item label="Monthly rent">
                <span className="tabular">{formatMoney(lease.monthly_rent, currency)}</span>
              </Item>
              <Item label="Move-in date">{formatDate(lease.start_date)}</Item>
              <Item label="Floor">{lease.rooms?.floor ?? '—'}</Item>
              {s && <Item label="Bills issued">Day {s.billing_day}, due {s.due_days} days later</Item>}
            </dl>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBank className="size-4 text-muted-foreground" /> Security deposit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold tabular">{formatMoney(deposit.data ?? 0, currency)}</p>
            <p className="text-[13px] text-muted-foreground">Held by your landlord, separate from rent.</p>
            {!!ledger.data?.length && (
              <ul className="mt-4 divide-y border-t text-sm">
                {ledger.data.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {DEPOSIT_LABEL[d.type]}
                      <span className="block text-[12px] text-muted-foreground">
                        {formatDate(d.transaction_date)}
                        {d.notes && ` · ${d.notes}`}
                      </span>
                    </span>
                    <span className="font-medium tabular">
                      {d.type === 'received' ? '+' : '−'}
                      {formatMoney(d.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-muted-foreground" /> Property & landlord
            </CardTitle>
          </CardHeader>
          <CardContent>
            {settings.isPending ? (
              <Skeleton className="h-24" />
            ) : s ? (
              <dl className="grid gap-3 text-sm">
                <Item label="Property">
                  {s.property_name}
                  {s.property_address && <span className="block font-normal text-muted-foreground">{s.property_address}</span>}
                </Item>
                {(s.contact_name || s.contact_phone || s.contact_email) && (
                  <Item label="Contact">
                    {s.contact_name && <span className="block">{s.contact_name}</span>}
                    {s.contact_phone && (
                      <a href={`tel:${s.contact_phone}`} className="flex items-center gap-1.5 font-normal hover:text-primary">
                        <Phone className="size-3.5 text-muted-foreground" /> {s.contact_phone}
                      </a>
                    )}
                    {s.contact_email && (
                      <a href={`mailto:${s.contact_email}`} className="flex items-center gap-1.5 font-normal break-all hover:text-primary">
                        <Mail className="size-3.5 text-muted-foreground" /> {s.contact_email}
                      </a>
                    )}
                  </Item>
                )}
              </dl>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {s?.payment_instructions && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4 text-muted-foreground" /> How to pay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{s.payment_instructions}</p>
          </CardContent>
        </Card>
      )}

      {s?.house_rules && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="size-4 text-muted-foreground" /> House rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{s.house_rules}</p>
          </CardContent>
        </Card>
      )}

      {(tenancy.data?.history.length ?? 0) > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rental history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {tenancy.data?.history.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 py-2">
                  <span className="font-medium">Room {l.rooms?.room_number}</span>
                  <span className="text-muted-foreground">
                    {formatDate(l.start_date)} – {l.end_date ? formatDate(l.end_date) : 'present'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
