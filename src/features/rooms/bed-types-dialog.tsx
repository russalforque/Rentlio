import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import { useBedTypes, useDeleteBedType, useSaveBedType, type BedType } from './api'

const MAX_NAME = 60

interface BedTypesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Lets the landlord maintain the list of bed types offered in the room form. */
export function BedTypesDialog({ open, onOpenChange }: BedTypesDialogProps) {
  const { data: bedTypes, isPending, error } = useBedTypes()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bed types</DialogTitle>
          <DialogDescription>The kinds of beds you can choose when setting up a room.</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
        ) : isPending ? (
          <div className="grid gap-2">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        ) : (
          <div className="grid gap-2">
            {bedTypes.length === 0 && <p className="text-sm text-muted-foreground">No bed types yet. Add one below.</p>}
            {bedTypes.map((bedType) => (
              <BedTypeRow key={bedType.id} bedType={bedType} />
            ))}
          </div>
        )}

        <AddBedType />
      </DialogContent>
    </Dialog>
  )
}

function BedTypeRow({ bedType }: { bedType: BedType }) {
  const save = useSaveBedType()
  const remove = useDeleteBedType()
  const [name, setName] = useState(bedType.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const changed = name.trim() !== bedType.name && name.trim() !== ''

  const onRename = (e: FormEvent) => {
    e.preventDefault()
    if (!changed) return
    save.mutate(
      { id: bedType.id, name: name.trim() },
      {
        onSuccess: () => toast.success('Bed type renamed'),
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  const onDelete = () =>
    remove.mutate(bedType.id, {
      onSuccess: () => toast.success(`${bedType.name} removed`),
      onError: (err) => {
        setConfirmDelete(false)
        toast.error(
          (err as { code?: string }).code === '23503'
            ? `${bedType.name} is used by a room. Remove it from those rooms first.`
            : getErrorMessage(err),
        )
      },
    })

  return (
    <form onSubmit={onRename} className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_NAME}
        aria-label={`Name of ${bedType.name}`}
      />
      {changed && (
        <Button type="submit" size="icon" variant="outline" disabled={save.isPending} aria-label="Save name">
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
      )}
      {confirmDelete ? (
        <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={remove.isPending}>
          {remove.isPending && <Loader2 className="animate-spin" />}
          Remove
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-destructive"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Remove ${bedType.name}`}
        >
          <Trash2 />
        </Button>
      )}
    </form>
  )
}

function AddBedType() {
  const save = useSaveBedType()
  const [name, setName] = useState('')

  const onAdd = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    save.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          toast.success(`${trimmed} added`)
          setName('')
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )
  }

  return (
    <form onSubmit={onAdd} className="flex items-center gap-2 border-t pt-4">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_NAME}
        placeholder="New bed type, e.g. Queen bed"
        aria-label="New bed type"
      />
      <Button type="submit" disabled={!name.trim() || save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        Add
      </Button>
    </form>
  )
}
