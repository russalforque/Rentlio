import type { Enums } from '@/lib/database.types'

export const HOME_BY_ROLE: Record<Enums<'user_role'>, string> = {
  landlord: '/dashboard',
  tenant: '/home',
}
