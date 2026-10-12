import { zodResolver } from '@hookform/resolvers/zod'
import { BedDouble, ChevronRight, Loader2, Plus, Settings2, Trash2, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
import { NativeSelect } from '@/components/app/native-select'
import { ErrorState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/errors'
import { intInput, moneyInput, optionalIntInput } from '@/lib/form-fields'
import { optionalText } from '@/lib/validation'
import { useBedTypes, useDeleteRoom, useRoomBeds, useSaveRoom, type RoomBed, type RoomOverview } from './api'
import { BedTypesDialog } from './bed-types-dialog'

const schema = z.object({
  room_number: z.string().trim().min(1, 'Enter a room number').max(20, 'Use at most 20 characters'),
  floor: optionalIntInput(-5, 200),
  monthly_rent: moneyInput('Monthly rent'),
  capacity: intInput(1, 20),
  description: optionalText(1000),
  is_under_maintenance: z.boolean(),
  beds: z
    .array(z.object({ bed_type_id: z.string().min(1, 'Choose a bed type'), quantity: intInput(1, 20) }))
    .superRefine((beds, ctx) => {
      const seen = new Set<string>()
      beds.forEach((bed, i) => {
        if (bed.bed_type_id && seen.has(bed.bed_type_id)) {
          ctx.addIssue({ code: 'custom', path: [i, 'bed_type_id'], message: 'Already listed; change the quantity instead' })
        }
        seen.add(bed.bed_type_id)
      })
    }),
})
type Input = z.input<typeof schema>
type Output = z.output<typeof schema>

interface RoomFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omit to create a new room. */
  room?: RoomOverview
}

export function RoomFormDialog({ open, onOpenChange, room }: RoomFormDialogProps) {
  const roomBeds = useRoomBeds()
  const [bedTypesOpen, setBedTypesOpen] = useState(false)
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          {/* Wait for the room's beds so saving never wipes them; remount per room so defaults are fresh. */}
          {open &&
            (roomBeds.error ? (
              <ErrorState error={roomBeds.error} onRetry={() => roomBeds.refetch()} />
            ) : roomBeds.isPending ? (
              <Skeleton className="h-96" />
            ) : (
              <RoomForm
                key={room?.id ?? 'new'}
                room={room}
                beds={room ? (roomBeds.data.get(room.id) ?? []) : []}
                onManageBedTypes={() => setBedTypesOpen(true)}
                onDone={() => onOpenChange(false)}
              />
            ))}
        </DialogContent>
      </Dialog>
      {/* Outside the room form: React bubbles submit events through portals. */}
      <BedTypesDialog open={bedTypesOpen} onOpenChange={setBedTypesOpen} />
    </>
  )
}

interface RoomFormProps {
  room?: RoomOverview
  beds: RoomBed[]
  onManageBedTypes: () => void
  onDone: () => void
}

function RoomForm({ room, beds, onManageBedTypes, onDone }: RoomFormProps) {
  const { data: bedTypes } = useBedTypes()
  const save = useSaveRoom()
  const remove = useDeleteRoom()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: {
      room_number: room?.room_number ?? '',
      floor: room?.floor?.toString() ?? '',
      monthly_rent: room ? String(room.monthly_rent) : '',
      capacity: String(room?.capacity ?? 1),
      description: room?.description ?? '',
      is_under_maintenance: room?.is_under_maintenance ?? false,
      beds: beds.map((b) => ({ bed_type_id: b.bed_type_id, quantity: String(b.quantity) })),
    },
  })
  const bedRows = useFieldArray({ control, name: 'beds' })

  const onSubmit = ({ beds: newBeds, ...values }: Output) =>
    save.mutate(
      { id: room?.id, values, beds: newBeds },
      {
        onSuccess: () => {
          toast.success(room ? `Room ${values.room_number} updated` : `Room ${values.room_number} added`)
          onDone()
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  const onDelete = () => {
    if (!room) return
    remove.mutate(room.id, {
      onSuccess: () => {
        toast.success(`Room ${room.room_number} deleted`)
        onDone()
      },
      onError: (err) => {
        setConfirmDelete(false)
        toast.error(
          (err as { code?: string }).code === '23503'
            ? 'This room has rental history, so it cannot be deleted. Mark it as under maintenance instead.'
            : getErrorMessage(err),
        )
      },
    })
  }

  const maintenance = useWatch({ control, name: 'is_under_maintenance' })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{room ? `Edit room ${room.room_number}` : 'Add a room'}</DialogTitle>
        <DialogDescription>
          The standard rent is used when you assign a new tenant. Current tenants keep their agreed rent.
        </DialogDescription>
      </DialogHeader>

      {room?.tenant_id && (
        <Link
          to={`/tenants/${room.tenant_id}`}
          onClick={onDone}
          className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm hover:bg-muted"
        >
          <UserRound className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            Tenant: <span className="font-semibold">{room.tenant_name || room.tenant_email}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FormField id="room_number" label="Room number" error={errors.room_number?.message}>
          <Input id="room_number" aria-invalid={!!errors.room_number} {...register('room_number')} />
        </FormField>
        <FormField id="floor" label="Floor" error={errors.floor?.message}>
          <Input id="floor" inputMode="numeric" aria-invalid={!!errors.floor} {...register('floor')} />
        </FormField>
        <FormField id="monthly_rent" label="Standard monthly rent" error={errors.monthly_rent?.message}>
          <Input
            id="monthly_rent"
            inputMode="decimal"
            className="tabular"
            aria-invalid={!!errors.monthly_rent}
            {...register('monthly_rent')}
          />
        </FormField>
        <FormField id="capacity" label="Capacity (persons)" error={errors.capacity?.message}>
          <Input id="capacity" inputMode="numeric" aria-invalid={!!errors.capacity} {...register('capacity')} />
        </FormField>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Beds</Label>
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={onManageBedTypes}>
            <Settings2 /> Bed types
          </Button>
        </div>
        {bedRows.fields.length === 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
            <BedDouble className="size-4" /> No beds listed for this room yet.
          </p>
        )}
        {bedRows.fields.map((field, i) => {
          const rowErrors = errors.beds?.[i]
          return (
            <div key={field.id} className="grid gap-1">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <NativeSelect
                    aria-label={`Bed type ${i + 1}`}
                    aria-invalid={!!rowErrors?.bed_type_id}
                    {...register(`beds.${i}.bed_type_id`)}
                  >
                    <option value="">Choose a bed type</option>
                    {bedTypes?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <Input
                  inputMode="numeric"
                  className="w-20 tabular"
                  aria-label={`Number of beds ${i + 1}`}
                  aria-invalid={!!rowErrors?.quantity}
                  {...register(`beds.${i}.quantity`)}
                />
                <Button type="button" size="icon" variant="ghost" onClick={() => bedRows.remove(i)} aria-label="Remove bed">
                  <X />
                </Button>
              </div>
              {(rowErrors?.bed_type_id || rowErrors?.quantity) && (
                <p className="text-[13px] text-destructive">
                  {rowErrors.bed_type_id?.message ?? rowErrors.quantity?.message}
                </p>
              )}
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => bedRows.append({ bed_type_id: '', quantity: '1' })}
        >
          <Plus /> Add bed
        </Button>
      </div>

      <FormField id="description" label="Notes" error={errors.description?.message} hint="Optional, e.g. aircon, own bathroom.">
        <Textarea id="description" rows={2} {...register('description')} />
      </FormField>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div>
          <Label htmlFor="is_under_maintenance">Under maintenance</Label>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {maintenance && room?.occupancy === 'occupied'
              ? 'The current tenant stays assigned; the room just cannot be given to a new tenant.'
              : 'Rooms under maintenance cannot be assigned to tenants.'}
          </p>
        </div>
        <Controller
          control={control}
          name="is_under_maintenance"
          render={({ field }) => (
            <Switch id="is_under_maintenance" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {room && room.occupancy !== 'occupied' ? (
          confirmDelete ? (
            <Button type="button" variant="destructive" onClick={onDelete} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="animate-spin" />}
              Confirm delete
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete room
            </Button>
          )
        ) : (
          <span />
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {room ? 'Save changes' : 'Add room'}
        </Button>
      </DialogFooter>
    </form>
  )
}
