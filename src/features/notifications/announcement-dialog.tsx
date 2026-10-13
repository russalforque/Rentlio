import { Loader2, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/app/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/errors'
import { useSendAnnouncement } from './api'

/** Landlord: a notice to every tenant with portal access. */
export function AnnouncementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const send = useSendAnnouncement()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<{ title?: string; message?: string }>({})

  const close = (next: boolean) => {
    if (!next) {
      setTitle('')
      setMessage('')
      setErrors({})
    }
    onOpenChange(next)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next = {
      title: title.trim().length < 3 ? 'Give the announcement a short title' : undefined,
      message: message.trim().length < 3 ? 'Write the announcement' : undefined,
    }
    setErrors(next)
    if (next.title || next.message) return
    send.mutate(
      { title: title.trim(), message: message.trim() },
      {
        onSuccess: (count) => {
          toast.success(count ? `Sent to ${count} ${count === 1 ? 'tenant' : 'tenants'}` : 'No tenants with portal access to send to')
          close(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Every tenant with portal access sees this in their notifications. Tenants can turn announcements off.
            </DialogDescription>
          </DialogHeader>
          <FormField id="announcement-title" label="Title" error={errors.title}>
            <Input
              id="announcement-title"
              value={title}
              maxLength={120}
              placeholder="Water interruption on Saturday"
              aria-invalid={!!errors.title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormField>
          <FormField id="announcement-message" label="Message" error={errors.message} hint={`${message.length}/1000`}>
            <Textarea
              id="announcement-message"
              rows={5}
              value={message}
              maxLength={1000}
              placeholder="There will be no water from 9 AM to 12 NN for pipe repairs. Please store water the night before."
              aria-invalid={!!errors.message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Megaphone />}
              Send announcement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
