import { ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, DoorOpen, Mail, Phone, ScrollText, ShieldCheck, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import { Detail, Panel, StatusPill } from '@/components/app/panel'
import { TenantPageHeader } from '@/components/app/tenant-page-header'
import { TenantIllustration } from '@/components/app/tenant-illustration'
import roomIllustration from '@/assets/my_room.png'
import noRoomIllustration from '@/assets/empty_room_information.png'
import { EmptyState, ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDepositLedger } from '@/features/tenants/api'
import { useMyDepositBalance, useMyTenancy } from '@/features/portal/api'
import { useProfile } from '@/hooks/use-auth'
import { useCurrency, useSettings } from '@/hooks/use-settings'
import { nextLeaseDueDate, todayISO } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'
import './room.css'

const DEPOSIT_LABEL = { received: 'Deposit received', deduction: 'Deduction', refund: 'Refund' } as const

function SectionError({ message, retry, pending }: { message: string; retry: () => void; pending: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" disabled={pending} onClick={retry}>{pending ? 'Retrying…' : 'Try again'}</Button>
    </div>
  )
}

export function TenantRoomPage() {
  const profile = useProfile()
  const currency = useCurrency()
  const settings = useSettings()
  const tenancy = useMyTenancy()
  const deposit = useMyDepositBalance()
  const ledger = useDepositLedger(profile.id)
  const lease = tenancy.data?.current
  const s = settings.data
  const nextDue = lease ? nextLeaseDueDate(lease.start_date, todayISO(new Date(), s?.timezone)) : null
  const hasContact = !!(s?.contact_phone || s?.contact_email)

  return (
    <div className="tenant-page tenant-room @container space-y-5 sm:space-y-6">
      <TenantPageHeader
        title="My room"
        description="Your rental details, deposit and information for your stay."
        actions={hasContact && (
          <Button variant="outline" asChild>
            <a href="#property-contact" aria-label="Contact landlord"><Phone aria-hidden /><span className="hidden sm:inline">Contact landlord</span></a>
          </Button>
        )}
      />

      {tenancy.error ? (
        <ErrorState error={tenancy.error} onRetry={() => void tenancy.refetch()} />
      ) : tenancy.isPending ? (
        <section aria-label="Room details" aria-busy="true" className="surface space-y-5 p-5 sm:p-6">
          <span role="status" className="sr-only">Loading your room details</span>
          <Skeleton className="h-12 w-48 max-w-full" />
          <Skeleton className="h-24" />
          <Skeleton className="h-12" />
        </section>
      ) : !lease ? (
        <EmptyState icon={DoorOpen} title="No room assigned" description="Your landlord has not assigned you an active room yet. Your rental details will appear here once a room is assigned."
          illustration={<TenantIllustration src={noRoomIllustration} width={150} height={141} decorative loading="eager" className="mb-4" />} />
      ) : (
        <section aria-labelledby="room-heading" className="room-overview surface min-w-0 overflow-hidden">
          <div className="room-overview-body">
            <div className="room-overview-main">
              <div className="room-overview-copy">
                <StatusPill tone="neutral" className="gap-1.5"><span className="size-1.5 rounded-full bg-current" aria-hidden />Active tenancy</StatusPill>
                <p className="room-eyebrow">YOUR ROOM</p>
                <h2 id="room-heading" className="room-number font-display"><span className="sr-only">Room </span>{lease.rooms?.room_number ?? 'not specified'}</h2>
                <p className="room-property-name"><Building2 className="size-3.5 shrink-0" strokeWidth={1.6} aria-hidden /><span>{s?.property_name || 'Your rental'}</span></p>
              </div>
              <figure className="room-artwork">
                <TenantIllustration src={roomIllustration} width={182} height={266} decorative loading="eager" className="room-hero-image" />
                <figcaption>Room illustration</figcaption>
              </figure>
            </div>
            {lease.rooms?.description && <p className="room-description">{lease.rooms.description}</p>}
          </div>

          <div className="room-financials">
            <dl className="min-w-0">
              <dt className="room-field-label">Monthly rent</dt>
              <dd className="room-rent-amount font-display tabular">{formatMoney(lease.monthly_rent, currency)}</dd>
            </dl>
            <div className="room-upcoming">
              <dl className="min-w-0">
                <dt className="room-field-label flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />Next rent date</dt>
                <dd className="mt-1.5 text-sm font-semibold">{formatDate(nextDue)}</dd>
              </dl>
              <Button asChild className="min-h-11"><Link to="/my/bills">View bills <ArrowUpRight aria-hidden /></Link></Button>
            </div>
          </div>

          <dl className="room-facts">
            <Detail label="Move-in date">{formatDate(lease.start_date)}</Detail>
            <Detail label="Room capacity">{lease.rooms?.capacity == null ? 'Not specified' : `${lease.rooms.capacity} ${lease.rooms.capacity === 1 ? 'person' : 'people'}`}</Detail>
            <Detail label="Floor" className="[&_dd]:break-words">{lease.rooms?.floor ?? 'Not specified'}</Detail>
          </dl>
        </section>
      )}

      <div className="grid min-w-0 items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div className="@container min-w-0 space-y-5">
          <Panel title="Security deposit" description="Held by your landlord, separate from rent." className="room-deposit" action={<span className="room-section-icon"><ShieldCheck className="size-4" strokeWidth={1.6} aria-hidden /></span>}>
            <div className="room-deposit-total" aria-busy={deposit.isPending}>
              {deposit.error ? (
                <SectionError message="Could not load your deposit balance." retry={() => void deposit.refetch()} pending={deposit.isFetching} />
              ) : deposit.isPending ? (
                <div role="status"><span className="sr-only">Loading deposit balance</span><Skeleton className="h-9 w-40 max-w-full" /></div>
              ) : (
                <div><p className="room-field-label">Current balance</p><p className="room-deposit-amount font-display tabular"><span className="sr-only">Deposit balance: </span>{formatMoney(deposit.data, currency)}</p></div>
              )}
            </div>
            <div className="mt-5 border-t pt-4" aria-busy={ledger.isPending}>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">Deposit activity</h3>
              {ledger.error ? (
                <div className="pt-3"><SectionError message="Could not load deposit activity." retry={() => void ledger.refetch()} pending={ledger.isFetching} /></div>
              ) : ledger.isPending ? (
                <div role="status" className="space-y-3 pt-3"><span className="sr-only">Loading deposit activity</span><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
              ) : !ledger.data?.length ? (
                <p className="pt-2 text-[13px] leading-relaxed text-muted-foreground">No deposit transactions recorded yet. Deposits, deductions and refunds will appear here.</p>
              ) : (
                <ul className="divide-y">
                  {ledger.data.map((d) => (
                    <li key={d.id} className="room-ledger-entry">
                      <span className="room-ledger-icon" aria-hidden>{d.type === 'received' ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{DEPOSIT_LABEL[d.type]}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(d.transaction_date)}</p>
                        {d.notes && <p className="mt-1 text-[13px] leading-relaxed break-words text-muted-foreground">{d.notes}</p>}
                      </div>
                      <p className="room-ledger-amount tabular">
                        <span className="sr-only">{d.type === 'received' ? 'Credit: ' : 'Debit: '}</span>
                        {d.type === 'received' ? '+' : '−'}{formatMoney(d.amount, currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          {(s?.payment_instructions || s?.house_rules) && (
            <Panel title="Good to know" bodyClassName="gap-3">
              {s.payment_instructions && (
                <section aria-labelledby="payment-instructions-heading" className="room-info-block">
                  <h3 id="payment-instructions-heading" className="flex items-center gap-2 text-sm font-medium"><Wallet className="size-4 text-muted-foreground" aria-hidden />How to pay</h3>
                  <p className="mt-2 text-[13px] leading-relaxed break-words whitespace-pre-line text-muted-foreground">{s.payment_instructions}</p>
                </section>
              )}
              {s.house_rules && (
                <section aria-labelledby="house-rules-heading" className="room-info-block">
                  <h3 id="house-rules-heading" className="flex items-center gap-2 text-sm font-medium"><ScrollText className="size-4 text-muted-foreground" aria-hidden />House rules</h3>
                  <p className="mt-2 text-[13px] leading-relaxed break-words whitespace-pre-line text-muted-foreground">{s.house_rules}</p>
                </section>
              )}
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div id="property-contact" tabIndex={-1} className="scroll-mt-24 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Panel title="Property & landlord" className="room-contact" action={<span className="room-section-icon"><Building2 className="size-4" strokeWidth={1.6} aria-hidden /></span>}>
              {settings.error ? (
                <SectionError message="Could not load property details, payment instructions and house rules." retry={() => void settings.refetch()} pending={settings.isFetching} />
              ) : settings.isPending ? (
                <div role="status" aria-busy="true" className="space-y-3"><span className="sr-only">Loading property and contact details</span><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
              ) : s ? (
                <>
                  <div className="flex min-w-0 items-start gap-3">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{s.property_name}</p>
                      {s.property_address && <p className="mt-1 text-[13px] leading-relaxed break-words text-muted-foreground">{s.property_address}</p>}
                    </div>
                  </div>
                  <div className="mt-5 border-t pt-4">
                    <h3 className="text-xs font-medium text-muted-foreground">Landlord contact</h3>
                    {s.contact_name && <p className="mt-2 text-sm font-medium break-words">{s.contact_name}</p>}
                    {hasContact ? (
                      <div className="room-contact-links mt-3">
                        {s.contact_phone && (
                          <a href={`tel:${s.contact_phone}`}>
                            <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 break-words"><span className="sr-only">Call landlord: </span>{s.contact_phone}</span>
                            <ArrowUpRight className="ml-auto size-3.5 shrink-0" aria-hidden />
                          </a>
                        )}
                        {s.contact_email && (
                          <a href={`mailto:${s.contact_email}`}>
                            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 break-all"><span className="sr-only">Email landlord: </span>{s.contact_email}</span>
                            <ArrowUpRight className="ml-auto size-3.5 shrink-0" aria-hidden />
                          </a>
                        )}
                      </div>
                    ) : <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Your landlord has not added a phone number or email address yet.</p>}
                  </div>
                </>
              ) : <p className="text-[13px] text-muted-foreground">Property information has not been added yet.</p>}
            </Panel>
          </div>

          {!tenancy.error && !!tenancy.data?.history.length && (tenancy.data.history.length > 1 || !lease) && (
            <Panel title="Rental history" flush>
              <ul className="divide-y border-t">
                {tenancy.data.history.map((l) => (
                  <li key={l.id} className="min-w-0 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-sm font-medium break-words">Room {l.rooms?.room_number ?? 'not specified'}</p>
                      {l.id === lease?.id && <StatusPill tone="neutral">Current</StatusPill>}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{formatDate(l.start_date)} – {l.end_date ? formatDate(l.end_date) : 'Present'}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
