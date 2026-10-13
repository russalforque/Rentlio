import { Ban, Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/errors'
import { useInviteTenant, useSetPortalSuspended, type TenantOverview } from './api'

interface Props {
  tenant: TenantOverview
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Adds an email to a tenant record without a login and sends an invitation.
 * The login is linked to this record, so its room, bills and payments carry over.
 */
export function EnablePortalDialog({ tenant, open, onOpenChange }: Props) {
  const invite = useInviteTenant()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = z.email().safeParse(email.trim().toLowerCase())
    if (!parsed.success) {
      setError('Enter a valid email address')
      return
    }
    setError(null)
    invite.mutate(
      { email: parsed.data, full_name: tenant.full_name, phone: tenant.phone, tenant_id: tenant.id, assignment: null },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${parsed.data}`)
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Enable portal access</DialogTitle>
            <DialogDescription>
              {tenant.full_name} gets an email to set a password. Their room, bills and payment history stay exactly as
              they are.
            </DialogDescription>
          </DialogHeader>
          <FormField id="portal-email" label="Tenant's email" error={error ?? undefined} hint="Make sure it belongs to this tenant.">
            <Input
              id="portal-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={invite.isPending}>
              {invite.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Blocks the tenant's portal access; rent, bills and the tenancy continue. */
export function SuspendPortalDialog({ tenant, open, onOpenChange }: Props) {
  const suspend = useSetPortalSuspended()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (reason.trim().length < 3) {
      setError('Give a reason for the suspension')
      return
    }
    setError(null)
    suspend.mutate(
      { tenantId: tenant.id, suspended: true, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`${tenant.full_name}'s portal access was suspended`)
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Suspend portal access?</DialogTitle>
            <DialogDescription>
              {tenant.full_name} can still sign in but will see nothing until you restore access. Billing and the tenancy
              continue as normal.
            </DialogDescription>
          </DialogHeader>
          <FormField id="suspend-reason" label="Reason" error={error ?? undefined} hint="The tenant sees this.">
            <Textarea
              id="suspend-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!error}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" variant="destructive" className="w-full sm:w-auto" disabled={suspend.isPending}>
              {suspend.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
              Suspend access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
