// POST /functions/v1/manage-tenant
// Landlord-only account actions that need the Auth admin API:
//   resend_invite - email a fresh activation link to a tenant who has not activated
//   deactivate    - block sign-in (tenancy must already be ended); history is kept
//   reactivate    - restore sign-in
import { z } from 'zod'
import { dbError, requireLandlord } from '../_shared/auth.ts'
import { confirmRedirect, HttpError, json, readJson, serve } from '../_shared/http.ts'

const bodySchema = z.object({
  action: z.enum(['resend_invite', 'deactivate', 'reactivate']),
  tenant_id: z.uuid(),
})

// Supabase has no permanent ban; ~100 years is the documented approach.
const BAN_FOREVER = '876000h'

serve(async (req) => {
  const { userClient, admin } = await requireLandlord(req)

  const parsed = bodySchema.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, 'Invalid request')
  const { action, tenant_id } = parsed.data

  const { data: tenant, error: tenantError } = await userClient
    .from('profiles')
    .select('id, role, email, full_name, phone, is_active, activated_at')
    .eq('id', tenant_id)
    .maybeSingle()
  if (tenantError) throw dbError(tenantError)
  if (!tenant || tenant.role !== 'tenant') throw new HttpError(404, 'Tenant not found')

  switch (action) {
    case 'resend_invite': {
      if (tenant.activated_at) throw new HttpError(409, 'This tenant has already activated their account.')
      if (!tenant.is_active) throw new HttpError(409, 'Reactivate this account before resending the invitation.')
      const { error } = await admin.auth.admin.inviteUserByEmail(tenant.email, {
        data: { invited_as: 'tenant', full_name: tenant.full_name, phone: tenant.phone },
        redirectTo: confirmRedirect(req),
      })
      if (error) {
        if (error.status === 429) throw new HttpError(429, 'Too many emails sent recently. Please wait and try again.')
        console.error(error)
        throw new HttpError(502, 'The invitation email could not be sent. Please try again.')
      }
      const { error: updateError } = await admin
        .from('profiles')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', tenant_id)
      if (updateError) throw dbError(updateError)
      return json({ ok: true })
    }

    case 'deactivate': {
      // Database first: it refuses while the tenant still has an active lease.
      const { error } = await userClient.rpc('set_tenant_active', { p_tenant_id: tenant_id, p_active: false })
      if (error) throw dbError(error)
      const { error: banError } = await admin.auth.admin.updateUserById(tenant_id, { ban_duration: BAN_FOREVER })
      if (banError) {
        // Keep account state consistent with what Auth allows.
        await userClient.rpc('set_tenant_active', { p_tenant_id: tenant_id, p_active: true })
        console.error(banError)
        throw new HttpError(502, 'Could not deactivate the sign-in. Please try again.')
      }
      return json({ ok: true })
    }

    case 'reactivate': {
      const { error: unbanError } = await admin.auth.admin.updateUserById(tenant_id, { ban_duration: 'none' })
      if (unbanError) {
        console.error(unbanError)
        throw new HttpError(502, 'Could not restore the sign-in. Please try again.')
      }
      const { error } = await userClient.rpc('set_tenant_active', { p_tenant_id: tenant_id, p_active: true })
      if (error) throw dbError(error)
      return json({ ok: true })
    }
  }
})
