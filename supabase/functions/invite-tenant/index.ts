// POST /functions/v1/invite-tenant
// Landlord-only. Creates a tenant account, emails them an activation link, and
// optionally assigns them to a vacant room in the same step.
import { z } from 'zod'
import { dbError, requireLandlord } from '../_shared/auth.ts'
import { confirmRedirect, HttpError, json, readJson, serve } from '../_shared/http.ts'

const bodySchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  full_name: z.string().trim().min(1, 'Enter the tenant name').max(120),
  phone: z.string().trim().max(40).nullish(),
  assignment: z
    .object({
      room_id: z.uuid(),
      start_date: z.iso.date(),
      monthly_rent: z.number().nonnegative().max(9_999_999_999).nullish(),
      deposit_amount: z.number().nonnegative().max(9_999_999_999).nullish(),
    })
    .nullish(),
})

serve(async (req) => {
  const { userClient, admin } = await requireLandlord(req)

  const parsed = bodySchema.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request')
  const { email, full_name, phone, assignment } = parsed.data

  // Check the room before creating the account so a bad choice does not leave
  // behind an unassigned tenant.
  if (assignment) {
    const { data: room, error } = await userClient
      .from('room_overview')
      .select('room_number, occupancy')
      .eq('id', assignment.room_id)
      .maybeSingle()
    if (error) throw dbError(error)
    if (!room) throw new HttpError(400, 'Room not found')
    if (room.occupancy !== 'vacant') {
      throw new HttpError(409, `Room ${room.room_number} is not available (${room.occupancy})`)
    }
  }

  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_as: 'tenant', full_name, phone: phone || null },
    redirectTo: confirmRedirect(req),
  })
  if (inviteError) {
    if (inviteError.code === 'email_exists' || /already been registered/i.test(inviteError.message)) {
      throw new HttpError(409, 'An account with this email already exists.')
    }
    if (inviteError.status === 429) {
      throw new HttpError(429, 'Too many invitation emails were sent recently. Please wait and try again.')
    }
    console.error(inviteError)
    throw new HttpError(502, 'The invitation email could not be sent. Please try again.')
  }

  const tenantId = invite.user.id
  let leaseId: string | null = null
  let assignmentError: string | null = null

  if (assignment) {
    // Runs as the landlord, so assign_tenant applies all of its own checks.
    const { data, error } = await userClient.rpc('assign_tenant', {
      p_tenant_id: tenantId,
      p_room_id: assignment.room_id,
      p_start_date: assignment.start_date,
      p_monthly_rent: assignment.monthly_rent ?? null,
      p_deposit_amount: assignment.deposit_amount ?? null,
    })
    if (error) assignmentError = dbError(error).message
    else leaseId = data as string
  }

  return json({ tenant_id: tenantId, lease_id: leaseId, assignment_error: assignmentError }, 201)
})
