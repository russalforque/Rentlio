import type { TenantOverview } from '@/features/tenants/api'
import type { RegistrationRequest } from './api'

export type MatchReason = 'name' | 'phone' | 'room'

export interface Candidate {
  tenant: TenantOverview
  reasons: MatchReason[]
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 1)

/** Last 7 digits, so "+63 917 123 4567" and "0917-123-4567" compare equal. */
const phoneKey = (s: string | null) => {
  const digits = (s ?? '').replace(/\D/g, '')
  return digits.length >= 7 ? digits.slice(-7) : null
}

/**
 * Tenant records that could belong to the applicant: active, with no login
 * yet. Ordered by how much of what the applicant typed matches. These are
 * hints for the landlord only; the applicant's details are unverified claims
 * and never approve anything on their own.
 */
export function rankCandidates(request: RegistrationRequest, tenants: TenantOverview[]): Candidate[] {
  const nameWords = new Set(words(request.full_name))
  const phone = phoneKey(request.phone)
  const room = request.requested_room?.trim().toLowerCase() || null

  return tenants
    .filter((t) => t.is_active && !t.has_portal_access)
    .map((tenant) => {
      const reasons: MatchReason[] = []
      const shared = words(tenant.full_name).filter((w) => nameWords.has(w)).length
      if (shared > 0) reasons.push('name')
      if (phone && phoneKey(tenant.phone) === phone) reasons.push('phone')
      if (room && tenant.room_number?.toLowerCase() === room) reasons.push('room')
      return { tenant, reasons, score: reasons.length * 10 + shared }
    })
    .sort((a, b) => b.score - a.score || a.tenant.full_name.localeCompare(b.tenant.full_name))
    .map(({ tenant, reasons }) => ({ tenant, reasons }))
}
