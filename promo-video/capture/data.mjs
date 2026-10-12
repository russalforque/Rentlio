// Demo data for a fictional 28-room property, shaped like Rentlio's views.
export const TODAY = '2026-10-08'
const PERIODS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 10 + i, 1))
  return d.toISOString().slice(0, 10)
}) // 2025-11-01 .. 2026-10-01
export const CURRENT = '2026-10-01'

const uuid = (prefix, n) => `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`
const ts = (date, time = '09:00:00') => `${date}T${time}+08:00`

const NAMES = [
  'Jessa Santos', 'Miguel Bautista', 'Carla Reyes', 'Paolo Mendoza', 'Bea Villanueva', 'Joshua Garcia',
  'Andrea Lim', 'Kevin Navarro', 'Trisha Aquino', 'Mark Dizon', 'Nicole Tan', 'Rafael Cruz',
  'Angela Ramos', 'Jerome Castillo', 'Patricia Flores', 'Daniel Torres', 'Hannah Gomez', 'Carlo Pascual',
  'Mika Fernandez', 'Luis Domingo', 'Sofia Ocampo', 'Ryan Salazar', 'Kim Rivera', 'Enzo Morales',
]

export const settings = {
  id: true, property_name: 'Maple Court Residences', property_address: '28 Maple St., Quezon City',
  currency_code: 'PHP', timezone: 'Asia/Manila', billing_day: 1, due_days: 10, auto_billing_enabled: true,
  electricity_rate: 12, water_billing_mode: 'flat', water_flat_fee: 350, water_rate: 0,
  payment_instructions: 'GCash 0917 555 0128 (A. Dela Cruz) or BPI 1234-5678-90. Upload a screenshot as proof.',
  contact_name: 'Ana Dela Cruz', contact_email: 'ana@maplecourt.ph', contact_phone: '0917 555 0128',
  house_rules: 'Quiet hours 10pm–7am.\nNo smoking inside rooms.\nGuests must leave by 10pm.',
  updated_at: ts('2026-09-01'),
}

export const landlord = {
  id: uuid('landlord', 1), role: 'landlord', full_name: 'Ana Dela Cruz', email: 'ana@maplecourt.ph',
  phone: '0917 555 0128', is_active: true, avatar_path: null, invited_at: null, activated_at: ts('2025-10-01'),
  emergency_contact_name: null, emergency_contact_phone: null, created_at: ts('2025-10-01'), updated_at: ts('2025-10-01'),
}

const roomNumbers = [...Array.from({ length: 14 }, (_, i) => 101 + i), ...Array.from({ length: 14 }, (_, i) => 201 + i)]
const VACANT = new Set([107, 112, 209])
const MAINT = new Set([205])

export const rooms = []
export const tenants = []
export const profiles = [landlord]
export const leases = []
let t = 0
for (const num of roomNumbers) {
  const id = uuid('room', num)
  const floor = num > 200 ? 2 : 1
  const rent = floor === 2 ? 6500 : 6000
  const room = {
    id, room_number: String(num), floor, capacity: num % 3 === 0 ? 2 : 1, description: num % 3 === 0 ? 'Corner room, two windows' : 'Standard room',
    monthly_rent: rent, is_under_maintenance: MAINT.has(num), occupancy: MAINT.has(num) ? 'maintenance' : VACANT.has(num) ? 'vacant' : 'occupied',
    lease_id: null, lease_rent: null, lease_start_date: null, tenant_id: null, tenant_name: null, tenant_email: null, tenant_phone: null,
    outstanding_balance: 0,
  }
  if (room.occupancy === 'occupied') {
    const name = NAMES[t]
    const tenantId = uuid('tenant', t + 1)
    const leaseId = uuid('lease', t + 1)
    const start = PERIODS[0]
    const email = name.toLowerCase().replace(/[^a-z]+/g, '.') + '@mail.com'
    const phone = `0917 ${String(200 + t * 7).padStart(3, '0')} ${String(1000 + t * 37).slice(-4)}`
    Object.assign(room, { lease_id: leaseId, lease_rent: rent, lease_start_date: start, tenant_id: tenantId, tenant_name: name, tenant_email: email, tenant_phone: phone })
    profiles.push({
      id: tenantId, role: 'tenant', full_name: name, email, phone, is_active: true, avatar_path: null,
      invited_at: ts('2025-10-20'), activated_at: ts('2025-10-21'), emergency_contact_name: null, emergency_contact_phone: null,
      created_at: ts('2025-10-20'), updated_at: ts('2025-10-20'),
    })
    leases.push({ id: leaseId, tenant_id: tenantId, room_id: id, monthly_rent: rent, start_date: start, end_date: null, status: 'active', notes: null, created_at: ts('2025-10-20'), updated_at: ts('2025-10-20'), rooms: { room_number: String(num), floor, description: room.description, capacity: room.capacity } })
    tenants.push({ room, tenantId, leaseId, name, email, phone })
    t++
  }
  rooms.push(room)
}

// Bills, items and payments ------------------------------------------------------
export const bills = []
export const billItems = []
export const payments = []
let billNo = 1001
let payNo = 1
const METHODS = ['gcash', 'gcash', 'bank_transfer', 'maya', 'cash', 'gcash']

// Who is behind this month (index into tenants) and how
const OCT_PAID = new Set([0, 2, 3, 5, 8, 9, 11, 13, 15, 16, 18, 20])
const OCT_PENDING = new Map([[1, 'gcash'], [6, 'bank_transfer'], [14, 'maya']])
const OCT_PARTIAL = new Set([10, 19])
const SEP_OVERDUE = new Set([7, 22])
// Collected-rate shape for the history chart: earlier months a bit lower
const LATE_EARLIER = (pi, ti) => pi < 10 && (ti * 7 + pi * 3) % 17 === 0

PERIODS.forEach((period, pi) => {
  for (const [ti, tn] of tenants.entries()) {
    const id = uuid('bill', billNo)
    const kwh = 80 + ((ti * 37 + pi * 11) % 90)
    const rent = tn.room.lease_rent
    const elec = kwh * settings.electricity_rate
    const water = settings.water_flat_fee
    const total = rent + elec + water
    const issue = period
    const due = period.slice(0, 8) + '11'
    let paid = total
    let pendingAmount = 0
    let pendingCount = 0
    if (period === CURRENT) {
      if (OCT_PAID.has(ti)) paid = total
      else if (OCT_PARTIAL.has(ti)) paid = 4000
      else paid = 0
      if (OCT_PENDING.has(ti)) { pendingAmount = total; pendingCount = 1 }
    } else if (period === '2026-09-01' && SEP_OVERDUE.has(ti)) paid = 3000
    const balance = total - paid
    const status = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
    const overdue = balance > 0 && due < TODAY
    const bill = {
      id, bill_number: billNo, period, lease_id: tn.leaseId, room_id: tn.room.id, room_number: tn.room.room_number,
      tenant_id: tn.tenantId, tenant_name: tn.name, tenant_email: tn.email, total_amount: total, amount_paid: paid, balance,
      status, is_overdue: overdue, issue_date: issue, due_date: due, notes: null, pending_amount: pendingAmount,
      pending_payments: pendingCount, void_reason: null, voided_at: null, created_at: ts(issue, '00:05:00'),
    }
    bills.push(bill)
    const item = (n, kind, description, quantity, unit_price, amount) => billItems.push({
      id: uuid('item', billNo * 10 + n), bill_id: id, kind, description, quantity, unit_price, amount, sort_order: n,
      meter_reading_id: null, created_at: ts(issue, '00:05:00'), updated_at: ts(issue, '00:05:00'),
    })
    item(1, 'rent', `Rent – Room ${tn.room.room_number}`, 1, rent, rent)
    item(2, 'electricity', `Electricity (${kwh} kWh)`, kwh, settings.electricity_rate, elec)
    item(3, 'water', 'Water (flat)', 1, water, water)

    const base = { bill_id: id, bill_number: billNo, period, room_number: tn.room.room_number, tenant_id: tn.tenantId, tenant_name: tn.name, notes: null, rejection_reason: null, submitted_by: tn.tenantId, reviewed_by: landlord.id }
    if (paid > 0) {
      const day = String(3 + ((ti * 3 + pi) % 7)).padStart(2, '0')
      const paidOn = period.slice(0, 8) + day
      const method = METHODS[(ti + pi) % METHODS.length]
      payments.push({
        ...base, id: uuid('pay', payNo++), amount: paid, method, paid_on: paidOn, status: 'verified',
        reference_number: method === 'cash' ? null : `REF${700000 + payNo * 13}`, proof_path: method === 'cash' ? null : `${tn.tenantId}/proof-${payNo}.jpg`,
        recorded_by_landlord: method === 'cash', reviewed_at: ts(paidOn, `1${ti % 9}:${String(10 + ti).slice(-2)}:00`), created_at: ts(paidOn, '08:30:00'),
        bill_status: status, bill_balance: balance,
      })
    }
    if (pendingCount) {
      const method = OCT_PENDING.get(ti)
      const paidOn = ['2026-10-06', '2026-10-07', '2026-10-08'][[1, 6, 14].indexOf(ti)]
      payments.push({
        ...base, id: uuid('pay', payNo++), amount: total, method, paid_on: paidOn, status: 'pending', reviewed_by: null, reviewed_at: null,
        reference_number: `REF${880000 + ti * 101}`, proof_path: `${tn.tenantId}/proof-pending.jpg`, recorded_by_landlord: false,
        created_at: ts(paidOn, '19:42:00'), bill_status: status, bill_balance: balance,
      })
    }
    billNo++
  }
})

for (const r of rooms) r.outstanding_balance = bills.filter((b) => b.room_id === r.id).reduce((s, b) => s + b.balance, 0)

export const tenantOverview = tenants.map((tn, i) => ({
  id: tn.tenantId, full_name: tn.name, email: tn.email, phone: tn.phone, account_status: 'active', is_active: true,
  avatar_path: null, invited_at: ts('2025-10-20'), activated_at: ts('2025-10-21'), created_at: ts('2025-10-20'),
  emergency_contact_name: null, emergency_contact_phone: null, lease_id: tn.leaseId, lease_rent: tn.room.lease_rent,
  lease_start_date: tn.room.lease_start_date, room_id: tn.room.id, room_number: tn.room.room_number,
  deposit_balance: tn.room.lease_rent, outstanding_balance: tn.room.outstanding_balance,
}))
// Two invited tenants who have not activated yet
tenantOverview.push(
  { ...tenantOverview[0], id: uuid('tenant', 90), full_name: 'Lara Velasco', email: 'lara.velasco@mail.com', account_status: 'invited', activated_at: null, lease_id: null, room_id: null, room_number: null, lease_rent: null, outstanding_balance: 0, deposit_balance: 0 },
)

export const depositBalances = tenants.map((tn) => ({ tenant_id: tn.tenantId, balance: tn.room.lease_rent, total_received: tn.room.lease_rent, total_deducted: 0, total_refunded: 0 }))

export const readingSheet = (period) => rooms
  .filter((r) => r.occupancy === 'occupied')
  .map((r, i) => {
    const prev = 4200 + i * 173
    const filled = period !== CURRENT || i < 17
    return {
      room_id: r.id, room_number: r.room_number, floor: r.floor, tenant_name: r.tenant_name, is_billable: true,
      reading_id: filled ? uuid('read', i + 1) : null,
      electricity_previous: prev, electricity_current: filled ? prev + 80 + ((i * 37 + 11 * 11) % 90) : null,
      water_previous: 300 + i * 9, water_current: filled ? 300 + i * 9 + 4 + (i % 5) : null,
    }
  })

export const billingRuns = [
  { id: uuid('run', 4), period: '2026-10-01', ran_at: ts('2026-10-01', '00:00:12'), bills_created: 24, triggered_by: 'schedule', run_by: null },
  { id: uuid('run', 3), period: '2026-09-01', ran_at: ts('2026-09-01', '00:00:09'), bills_created: 24, triggered_by: 'schedule', run_by: null },
  { id: uuid('run', 2), period: '2026-08-01', ran_at: ts('2026-08-01', '00:00:10'), bills_created: 24, triggered_by: 'schedule', run_by: null },
]

export const bedTypes = [
  { id: uuid('bed', 1), name: 'Double', created_at: ts('2025-10-01'), updated_at: ts('2025-10-01') },
  { id: uuid('bed', 2), name: 'Single', created_at: ts('2025-10-01'), updated_at: ts('2025-10-01') },
]
export const roomBeds = rooms.map((r) => ({ room_id: r.id, bed_type_id: bedTypes[r.capacity === 2 ? 0 : 1].id, quantity: 1, bed_type: { name: r.capacity === 2 ? 'Double' : 'Single' } }))

export const featuredTenant = tenants[1] // Room 102, has a pending GCash payment this month
export const featuredTenantPortal = tenants[4] // tenant portal demo (unpaid, can pay now)
