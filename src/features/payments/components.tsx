import { ExternalLink, FileText, ImageOff, Loader2, Paperclip, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { StatusPill, type Tone } from '@/components/app/panel'
import { Button } from '@/components/ui/button'
import type { Enums } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { PROOF_TYPES, useProofUrl, validateProof } from './api'

const STATUS: Record<Enums<'payment_status'>, { label: string; tone: Tone }> = {
  pending: { label: 'Awaiting verification', tone: 'info' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'destructive' },
}

export function PaymentStatusBadge({ status, className }: { status: Enums<'payment_status'>; className?: string }) {
  const s = STATUS[status]
  return (
    <StatusPill tone={s.tone} className={className}>
      {s.label}
    </StatusPill>
  )
}

/** Inline preview of a private proof file (image or PDF) via a signed URL. */
export function ProofPreview({ path, className }: { path: string | null; className?: string }) {
  const { data: url, isPending, error } = useProofUrl(path)
  const [broken, setBroken] = useState(false)

  if (!path) {
    return (
      <div className={cn('grid place-items-center rounded-xl border border-dashed p-6 text-sm text-muted-foreground', className)}>
        No proof attached
      </div>
    )
  }
  if (isPending) {
    return (
      <div className={cn('grid place-items-center rounded-xl border bg-muted/40 p-10', className)}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error || !url) {
    return (
      <div className={cn('grid place-items-center rounded-xl border p-6 text-sm text-destructive', className)}>
        Could not load the proof file.
      </div>
    )
  }

  const isPdf = path.toLowerCase().endsWith('.pdf')
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-muted/30', className)}>
      {isPdf || broken ? (
        <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
          {isPdf ? <FileText className="size-8" /> : <ImageOff className="size-8" />}
          {isPdf ? 'PDF document' : 'Preview not available for this image format'}
        </div>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          <img
            src={url}
            alt="Proof of payment"
            className="max-h-[60dvh] w-full object-contain"
            onError={() => setBroken(true)}
          />
        </a>
      )}
      <div className="flex justify-end border-t bg-card px-3 py-2">
        <Button asChild variant="ghost" size="sm">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink /> Open in new tab
          </a>
        </Button>
      </div>
    </div>
  )
}

/** File picker for proofs/receipts with client-side type and size checks. */
export function ProofFileInput({
  file,
  onChange,
  error,
  required,
}: {
  file: File | null
  onChange: (file: File | null) => void
  error?: string
  required?: boolean
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const shown = localError ?? error

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">
        {required ? 'Proof of payment' : 'Receipt (optional)'}
      </span>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <span className="text-xs text-muted-foreground tabular">{(file.size / 1024).toFixed(0)} KB</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            aria-label="Remove file"
          >
            <X />
          </Button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center text-sm transition-colors hover:border-primary/50 hover:bg-secondary/50',
            shown && 'border-destructive',
          )}
        >
          <Paperclip className="size-5 text-muted-foreground" />
          <span className="font-medium">Choose a photo, screenshot or PDF</span>
          <span className="text-xs text-muted-foreground">Up to 5 MB</span>
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={PROOF_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          const problem = f ? validateProof(f) : null
          setLocalError(problem)
          onChange(problem ? null : f)
        }}
      />
      {shown && <p className="text-[13px] text-destructive">{shown}</p>}
    </div>
  )
}
