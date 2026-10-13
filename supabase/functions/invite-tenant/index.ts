// POST /functions/v1/invite-tenant
// Landlord-only. Gives a tenant portal access by email invitation:
//   * new tenant: creates the tenant record, emails an activation link and
//     optionally assigns a vacant room in the same step;
//   * existing tenant record without a login (tenant_id): adds the email and
//     links the new login to that record, keeping its rooms, bills and payments.
//
// The login is created here first (which fails if the email is already in
// use), then invited, then linked by _link_invited_user, which only accepts a
// brand-new unverified login. So an invitation can never be attached to an
// account someone registered for themselves.
import { z } from 'zod'
import { dbError, requireLandlord } from '../_shared/auth.ts'
import { confirmRedirect, HttpError, json, readJson, serve } from '../_shared/http.ts'

/** Same rule as public._valid_phone() in the database and isValidPhone() in the app. */
const isValidPhone = (v: string) => /^((\+?63|0)\d{9,10}|\+[1-9]\d{7,14})$/.test(v.replace(/[\s().-]/g, ''))

const bodySchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  full_name: z.string().trim().min(1, 'Enter the tenant name').max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || isValidPhone(v), 'Enter a valid phone number, e.g. 0917 123 4567 or +63 917 123 4567')
    .nullish(),
  tenant_id: z.uuid().nullish(),
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
  const { user, userClient, admin } = await requireLandlord(req)

  const parsed = bodySchema.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request')
  const { email, full_name, phone, tenant_id, assignment } = parsed.data
  if (tenant_id && assignment) throw new HttpError(400, 'Manage the room from the tenant page instead.')

  // Checks run as the landlord, so RLS applies. They give clear messages; the
  // database re-checks everything when linking.
  if (tenant_id) {
    const { data: tenant, error } = await userClient
      .from('profiles')
      .select('role, user_id, is_active')
      .eq('id', tenant_id)
      .maybeSingle()
    if (error) throw dbError(error)
    if (!tenant || tenant.role !== 'tenant') throw new HttpError(404, 'Tenant not found')
    if (tenant.user_id) throw new HttpError(409, 'This tenant already has portal access.')
    if (!tenant.is_active) throw new HttpError(409, 'Reactivate this tenant before enabling portal access.')
  }

  const [{ data: usedBy, error: usedError }, { data: pending, error: pendingError }] = await Promise.all([
    userClient.from('profiles').select('id').eq('email', email).limit(1),
    userClient.from('registration_requests').select('id').eq('email', email).eq('status', 'pending').limit(1),
  ])
  if (usedError) throw dbError(usedError)
  if (pendingError) throw dbError(pendingError)
  if (usedBy.length) throw new HttpError(409, 'Another tenant already uses this email address.')
  if (pending.length) {
    throw new HttpError(409, 'This email has a pending registration request. Review it under Registrations instead.')
  }

  // Check the room before creating anything so a bad choice leaves nothing behind.
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

  const metadata = { full_name, phone: phone || null }
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: metadata,
  })
  if (createError) {
    if (createError.code === 'email_exists' || /already been registered/i.test(createError.message)) {
      throw new HttpError(409, 'An account with this email already exists.')
    }
    console.error(createError)
    throw new HttpError(502, 'The account could not be created. Please try again.')
  }
  const loginId = created.user.id

  /** Removes the half-made login; its pending registration request goes with it. */
  const discardLogin = async () => {
    const { error } = await admin.auth.admin.deleteUser(loginId)
    if (error) console.error('Could not remove login after a failed invitation', loginId, error)
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo: confirmRedirect(req),
  })
  if (inviteError) {
    await discardLogin()
    if (inviteError.status === 429) {
      throw new HttpError(429, 'Too many invitation emails were sent recently. Please wait and try again.')
    }
    console.error(inviteError)
    throw new HttpError(502, 'The invitation email could not be sent. Please try again.')
  }

  const { data: tenantId, error: linkError } = await admin.rpc('_link_invited_user', {
    p_user_id: loginId,
    p_actor_id: user.id,
    p_tenant_id: tenant_id ?? null,
    p_full_name: full_name,
    p_phone: phone || null,
  })
  if (linkError) {
    await discardLogin()
    throw dbError(linkError)
  }

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

  return json({ tenant_id: tenantId as string, lease_id: leaseId, assignment_error: assignmentError }, 201)
})
