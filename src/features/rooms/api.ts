import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesInsert, TablesUpdate, Views } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type RoomOverview = Views<'room_overview'>
export type BedType = Tables<'bed_types'>
export interface RoomBed {
  bed_type_id: string
  quantity: number
}
export interface RoomBedWithType extends RoomBed {
  room_id: string
  bed_type: { name: string }
}
export type ElectricityMeter = 'aircon' | 'outlet' | 'light'

export const roomKeys = {
  all: ['rooms'] as const,
  overview: () => [...roomKeys.all, 'overview'] as const,
  beds: () => [...roomKeys.all, 'beds'] as const,
  electricityMeters: () => [...roomKeys.all, 'electricity-meters'] as const,
  bedTypes: () => [...roomKeys.all, 'bed-types'] as const,
}

const byRoomNumber = (a: RoomOverview, b: RoomOverview) =>
  a.room_number.localeCompare(b.room_number, undefined, { numeric: true })

export function useRoomOverview() {
  return useQuery({
    queryKey: roomKeys.overview(),
    queryFn: async () => {
      const { data, error } = await supabase.from('room_overview').select('*')
      if (error) throw error
      return data.sort(byRoomNumber)
    },
  })
}

/** Every room's beds with the bed type name, grouped by room id. */
export function useRoomBeds() {
  return useQuery({
    queryKey: roomKeys.beds(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_beds')
        .select('room_id, bed_type_id, quantity, bed_type:bed_types!inner(name)')
      if (error) throw error
      const byRoom = new Map<string, RoomBedWithType[]>()
      for (const bed of data) byRoom.set(bed.room_id, [...(byRoom.get(bed.room_id) ?? []), bed])
      for (const beds of byRoom.values()) beds.sort((a, b) => a.bed_type.name.localeCompare(b.bed_type.name))
      return byRoom
    },
  })
}

export function useRoomElectricityMeters() {
  return useQuery({
    queryKey: roomKeys.electricityMeters(),
    queryFn: async () => {
      const { data, error } = await supabase.from('rooms').select('id, electricity_meters')
      if (error) throw error
      return new Map(
        data.map((room) => [
          room.id,
          room.electricity_meters.filter(
            (meter): meter is ElectricityMeter => meter === 'aircon' || meter === 'outlet' || meter === 'light',
          ),
        ]),
      )
    },
  })
}

export function useBedTypes() {
  return useQuery({
    queryKey: roomKeys.bedTypes(),
    queryFn: async () => {
      const { data, error } = await supabase.from('bed_types').select('*').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useSaveBedType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id?: string; name: string }) => {
      const { data, error } = id
        ? await supabase.from('bed_types').update({ name }).eq('id', id).select('*').single()
        : await supabase.from('bed_types').insert({ name }).select('*').single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  })
}

export function useDeleteBedType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('bed_types').delete({ count: 'exact' }).eq('id', id)
      if (error) throw error
      if (count === 0) throw new Error('Bed type could not be deleted.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  })
}

/** Saves the room and replaces its beds atomically. */
export function useSaveRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      beds,
    }: {
      id?: string
      values: Omit<TablesInsert<'rooms'>, 'id'> & TablesUpdate<'rooms'>
      beds: RoomBed[]
    }) => {
      const { error } = await supabase.rpc('save_room_with_beds', {
        p_room_id: id,
        p_room_number: values.room_number,
        p_floor: values.floor ?? null,
        p_monthly_rent: values.monthly_rent ?? 0,
        p_capacity: values.capacity ?? 1,
        p_description: values.description ?? null,
        p_is_under_maintenance: values.is_under_maintenance ?? false,
        p_electricity_meters: values.electricity_meters ?? ['aircon', 'outlet', 'light'],
        p_beds: beds.map((b) => ({ bed_type_id: b.bed_type_id, quantity: b.quantity })),
      })
      if (error) throw error
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: roomKeys.all }),
        qc.invalidateQueries({ queryKey: ['billing'] }),
        qc.invalidateQueries({ queryKey: ['tenants'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  })
}

export function useDeleteRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('rooms').delete({ count: 'exact' }).eq('id', id)
      if (error) throw error
      if (count === 0) throw new Error('Room could not be deleted.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  })
}

/** Sets the standard rent of many rooms. Existing leases keep their agreed rent. */
export function useBulkSetRent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ roomIds, rent }: { roomIds: string[]; rent: number }) => {
      const { error } = await supabase.from('rooms').update({ monthly_rent: rent }).in('id', roomIds)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.all }),
  })
}
