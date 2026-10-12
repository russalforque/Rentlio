import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrency } from '@/hooks/use-settings'
import { formatMoney } from '@/lib/format'
import { useVacantRooms } from './api'

export interface PickedRoom {
  id: string
  room_number: string
  monthly_rent: number
}

interface RoomPickerProps {
  id: string
  value: string
  onChange: (room: PickedRoom) => void
  invalid?: boolean
}

/** Select of vacant rooms; reports the whole room so callers can prefill rent. */
export function RoomPicker({ id, value, onChange, invalid }: RoomPickerProps) {
  const { data: rooms, isPending } = useVacantRooms()
  const currency = useCurrency()

  return (
    <Select
      value={value}
      onValueChange={(roomId) => {
        const room = rooms?.find((r) => r.id === roomId)
        if (room) onChange(room)
      }}
      disabled={isPending || !rooms?.length}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue
          placeholder={isPending ? 'Loading rooms…' : rooms?.length ? 'Choose a vacant room' : 'No vacant rooms'}
        />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {rooms?.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            Room {r.room_number}
            <span className="text-muted-foreground">
              {r.floor !== null && ` · Floor ${r.floor}`}
              {r.monthly_rent > 0 && ` · ${formatMoney(r.monthly_rent, currency)}`}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
