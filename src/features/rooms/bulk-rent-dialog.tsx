import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { FormField } from '@/components/app/form-field'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrency } from '@/hooks/use-settings'
import { getErrorMessage } from '@/lib/errors'
import { moneyInput } from '@/lib/form-fields'
import { formatMoney } from '@/lib/format'
import { useBulkSetRent, type RoomOverview } from './api'

const schema = z.object({ scope: z.string().min(1), rent: moneyInput('Monthly rent') })
type Input = z.input<typeof schema>
type Output = z.output<typeof schema>

export function BulkRentDialog({
  open,
  onOpenChange,
  rooms,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rooms: RoomOverview[]
}) {
  const currency = useCurrency()
  const bulk = useBulkSetRent()
  const floors = [...new Set(rooms.map((r) => r.floor).filter((f): f is number => f !== null))].sort((a, b) => a - b)

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: { scope: 'all', rent: '' },
  })

  const scopeRooms = (scope: string) =>
    scope === 'all' ? rooms : rooms.filter((r) => `floor-${r.floor}` === scope)
  const affected = scopeRooms(useWatch({ control, name: 'scope' })).length

  const onSubmit = ({ scope, rent }: Output) =>
    bulk.mutate(
      { roomIds: scopeRooms(scope).map((r) => r.id), rent },
      {
        onSuccess: () => {
          toast.success(`Standard rent set to ${formatMoney(rent, currency)} for ${scopeRooms(scope).length} rooms`)
          reset()
          onOpenChange(false)
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Set standard rent</DialogTitle>
            <DialogDescription>
              Applies to new tenant assignments. Tenants already in a room keep the rent they agreed to.
            </DialogDescription>
          </DialogHeader>
          <FormField id="scope" label="Rooms">
            <Controller
              control={control}
              name="scope"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rooms ({rooms.length})</SelectItem>
                    {floors.map((f) => (
                      <SelectItem key={f} value={`floor-${f}`}>
                        Floor {f} ({rooms.filter((r) => r.floor === f).length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="bulk-rent" label="Monthly rent" error={errors.rent?.message}>
            <Input id="bulk-rent" inputMode="decimal" className="tabular" autoFocus aria-invalid={!!errors.rent} {...register('rent')} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={bulk.isPending || affected === 0}>
              {bulk.isPending && <Loader2 className="animate-spin" />}
              Update {affected} {affected === 1 ? 'room' : 'rooms'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
