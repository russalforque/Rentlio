import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const settingsQueryKey = ['app_settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').single()
      if (error) throw error
      return data
    },
    staleTime: 5 * 60_000,
  })
}

/** Currency code for formatting; falls back while settings load. */
export function useCurrency(): string {
  return useSettings().data?.currency_code ?? 'PHP'
}
