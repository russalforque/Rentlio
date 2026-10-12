// Database test suite. Runs every migration against an in-process Postgres
// (PGlite) with minimal stand-ins for Supabase's auth and storage schemas, then
// exercises the security and billing rules as real roles.
//
//   npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets (id),
    name text not null
  );
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant usage on schema public to anon, authenticated;
`

const db = new PGlite()
await db.exec(SUPABASE_STUBS)

for (const file of readdirSync(migrationsDir).sort()) {
  if (file.includes('scheduled_billing')) continue // pg_cron is not available in PGlite
  await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
}

// --- helpers ---------------------------------------------------------------------
let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`)
    process.exitCode = 1
  }
  await db.exec('reset role')
}

async function as(userId, sql, params = []) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
  await db.exec(userId ? 'set role authenticated' : 'set role anon')
  try {
    return (await db.query(sql, params)).rows
  } finally {
    await db.exec('reset role')
  }
}

async function asAdmin(sql, params = []) {
  await db.exec('reset role')
  return (await db.query(sql, params)).rows
}

async function rejects(promise, pattern) {
  try {
    await promise
  } catch (err) {
    if (pattern && !pattern.test(err.message)) {
      throw new Error(`Expected error matching ${pattern}, got: ${err.message}`, { cause: err })
    }
    return
  }
  throw new Error(`Expected an error matching ${pattern}`)
}

async function createUser(email, meta = {}) {
  const [{ id }] = await asAdmin(
    `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, $2) returning id`,
    [email, JSON.stringify(meta)],
  )
  return id
}

const roomId = async (num) =>
  (await asAdmin(`select id from public.rooms where room_number = $1`, [num]))[0].id
const bill = async (id) => (await asAdmin(`select * from public.bills where id = $1`, [id]))[0]
const num = (v) => Number(v)

// --- fixtures ----------------------------------------------------------------------
const landlord = await createUser('owner@example.com', { full_name: 'Owner' })
const alice = await createUser('alice@example.com', { invited_as: 'tenant', full_name: 'Alice' })
const bob = await createUser('bob@example.com', { invited_as: 'tenant', full_name: 'Bob' })
const stray = await createUser('stray@example.com')
const r101 = await roomId('101')
const r102 = await roomId('102')
const r103 = await roomId('103')
const PERIOD = '2026-10-01'

console.log('\nAccounts')
await test('first non-invited user becomes the landlord', async () => {
  const [p] = await asAdmin(`select role, is_active from public.profiles where id = $1`, [landlord])
  assert.equal(p.role, 'landlord')
  assert.equal(p.is_active, true)
})
await test('invited users become tenants; later non-invited users are inert', async () => {
  const rows = await asAdmin(`select id, role, is_active from public.profiles where id in ($1, $2)`, [alice, stray])
  assert.deepEqual(rows.find((r) => r.id === alice), { id: alice, role: 'tenant', is_active: true })
  assert.deepEqual(rows.find((r) => r.id === stray), { id: stray, role: 'tenant', is_active: false })
})
await test('28 rooms are seeded', async () => {
  const [{ count }] = await asAdmin(`select count(*)::int as count from public.rooms`)
  assert.equal(count, 28)
})

console.log('\nLandlord setup')
await test('landlord updates settings and room rent directly', async () => {
  await as(landlord, `update public.app_settings set electricity_rate = 12, water_rate = 30, billing_day = 1, due_days = 7`)
  await as(landlord, `update public.rooms set monthly_rent = 5000 where id in ($1, $2)`, [r101, r102])
  const [s] = await asAdmin(`select electricity_rate from public.app_settings`)
  assert.equal(num(s.electricity_rate), 12)
})
await test('invalid timezone is rejected', async () => {
  await rejects(as(landlord, `update public.app_settings set timezone = 'Mars/Base'`), /Unknown timezone/)
})
await test('tenant cannot change settings or rooms', async () => {
  await as(alice, `update public.app_settings set electricity_rate = 0`)
  await as(alice, `update public.rooms set monthly_rent = 1 where id = $1`, [r101])
  const [s] = await asAdmin(`select electricity_rate from public.app_settings`)
  const [r] = await asAdmin(`select monthly_rent from public.rooms where id = $1`, [r101])
  assert.equal(num(s.electricity_rate), 12)
  assert.equal(num(r.monthly_rent), 5000)
})
await test('landlord manages bed types and sets the beds in a room', async () => {
  const [{ id: bunk }] = await as(landlord, `insert into public.bed_types (name) values ('Bunk bed') returning id`)
  await rejects(as(landlord, `insert into public.bed_types (name) values (' bunk BED ')`), /bed_types_name_key/)
  const [{ id: single }] = await asAdmin(`select id from public.bed_types where name = 'Single bed'`)
  await as(landlord, `select public.set_room_beds($1, $2)`,
    [r101, JSON.stringify([{ bed_type_id: bunk, quantity: 2 }, { bed_type_id: single, quantity: 1 }])])
  await as(landlord, `select public.set_room_beds($1, $2)`, [r101, JSON.stringify([{ bed_type_id: bunk, quantity: 3 }])])
  const beds = await asAdmin(`select bed_type_id, quantity from public.room_beds where room_id = $1`, [r101])
  assert.deepEqual(beds, [{ bed_type_id: bunk, quantity: 3 }])
  await rejects(as(landlord, `select public.set_room_beds($1, $2)`,
    [r101, JSON.stringify([{ bed_type_id: bunk, quantity: 1 }, { bed_type_id: bunk, quantity: 1 }])]), /only be listed once/)
  await rejects(as(landlord, `delete from public.bed_types where id = $1`, [bunk]), /room_beds/)
})
await test('tenant cannot change bed types or room beds', async () => {
  await rejects(as(alice, `insert into public.bed_types (name) values ('Hammock')`), /row-level security/)
  await rejects(as(alice, `select public.set_room_beds($1, '[]')`, [r101]), /Only the landlord/)
  await rejects(as(alice, `delete from public.room_beds`), /permission denied/)
  const [{ n }] = await asAdmin(`select count(*)::int as n from public.room_beds where room_id = $1`, [r101])
  assert.equal(n, 1)
})

console.log('\nAssignments')
let aliceLease, bobLease
await test('landlord assigns tenants with deposit and rent override', async () => {
  ;[{ assign_tenant: aliceLease }] = await as(landlord,
    `select public.assign_tenant($1, $2, '2026-09-15', null, 5000)`, [alice, r101])
  ;[{ assign_tenant: bobLease }] = await as(landlord,
    `select public.assign_tenant($1, $2, '2026-09-20', 4500)`, [bob, r102])
  const [l] = await asAdmin(`select monthly_rent from public.leases where id = $1`, [bobLease])
  assert.equal(num(l.monthly_rent), 4500)
})
await test('a room cannot be double-booked and a tenant cannot hold two rooms', async () => {
  await rejects(as(landlord, `select public.assign_tenant($1, $2, '2026-10-01')`, [alice, r103]), /already has an active room/)
  await rejects(as(landlord, `select public.assign_tenant($1, $2, '2026-10-01')`, [bob, r101]), /already|occupied/)
})
await test('inactive accounts cannot be assigned', async () => {
  await rejects(as(landlord, `select public.assign_tenant($1, $2, '2026-10-01')`, [stray, r103]), /inactive/)
})
await test('tenants cannot call landlord functions', async () => {
  await rejects(as(alice, `select public.assign_tenant($1, $2, '2026-10-01')`, [alice, r103]), /Only the landlord/)
  await rejects(as(alice, `select public.generate_bills($1)`, [PERIOD]), /Only the landlord/)
})

console.log('\nBilling')
let aliceBill, bobBill
await test('readings + generation produce rent and metered utility lines', async () => {
  await as(landlord, `select public.record_meter_readings($1, $2)`, [PERIOD, JSON.stringify([
    { room_id: r101, electricity_previous: 1000, electricity_current: 1100, water_previous: 50, water_current: 60 },
  ])])
  const [{ generate_bills: created }] = await as(landlord, `select public.generate_bills($1)`, [PERIOD])
  assert.equal(created, 2)
  ;[{ id: aliceBill }] = await asAdmin(`select id from public.bills where lease_id = $1`, [aliceLease])
  ;[{ id: bobBill }] = await asAdmin(`select id from public.bills where lease_id = $1`, [bobLease])
  const b = await bill(aliceBill)
  assert.equal(num(b.total_amount), 5000 + 100 * 12 + 10 * 30)
  assert.equal(b.status, 'unpaid')
  assert.equal(b.due_date.toISOString().slice(0, 10), '2026-10-08')
})
await test('generating the same month again creates no duplicates', async () => {
  const [{ generate_bills: created }] = await as(landlord, `select public.generate_bills($1)`, [PERIOD])
  assert.equal(created, 0)
  await rejects(asAdmin(
    `insert into public.bills (lease_id, tenant_id, room_id, period, issue_date, due_date)
     values ($1, $2, $3, $4, $4, $4)`, [aliceLease, alice, r101, PERIOD]), /duplicate key/)
})
await test('readings recorded after generation update the bill; previous auto-fills', async () => {
  await as(landlord, `select public.record_meter_readings('2026-09-01', $1)`, [JSON.stringify([
    { room_id: r102, electricity_current: 500, water_current: 20 },
  ])])
  await as(landlord, `select public.record_meter_readings($1, $2)`, [PERIOD, JSON.stringify([
    { room_id: r102, electricity_current: 550, water_current: 25 },
  ])])
  const b = await bill(bobBill)
  assert.equal(num(b.total_amount), 4500 + 50 * 12 + 5 * 30)
})
await test('meter readings cannot go backwards', async () => {
  await rejects(as(landlord, `select public.record_meter_readings($1, $2)`, [PERIOD, JSON.stringify([
    { room_id: r102, electricity_current: 400 },
  ])]), /lower than previous/)
})
await test('extra charges and rent adjustments recalculate totals', async () => {
  const [{ add_bill_charge: itemId }] = await as(landlord,
    `select public.add_bill_charge($1, 'Key replacement', 250)`, [aliceBill])
  assert.equal(num((await bill(aliceBill)).total_amount), 6750)
  await as(landlord, `select public.remove_bill_charge($1)`, [itemId])
  assert.equal(num((await bill(aliceBill)).total_amount), 6500)
  const [{ id: utilityItem }] = await asAdmin(
    `select id from public.bill_items where bill_id = $1 and kind = 'electricity'`, [aliceBill])
  await rejects(as(landlord, `select public.update_bill_item($1, null, 0)`, [utilityItem]), /meter reading/)
})

console.log('\nTenant isolation')
await test('tenant sees only their own bills, profile, room, lease', async () => {
  const bills = await as(alice, `select id from public.bills`)
  assert.deepEqual(bills.map((b) => b.id), [aliceBill])
  const profiles = await as(alice, `select id from public.profiles`)
  assert.deepEqual(profiles.map((p) => p.id), [alice])
  const rooms = await as(alice, `select id from public.rooms`)
  assert.deepEqual(rooms.map((r) => r.id), [r101])
  const leases = await as(alice, `select id from public.leases`)
  assert.deepEqual(leases.map((l) => l.id), [aliceLease])
  const items = await as(alice, `select distinct bill_id from public.bill_items`)
  assert.deepEqual(items.map((i) => i.bill_id), [aliceBill])
  const overview = await as(alice, `select id from public.room_overview`)
  assert.deepEqual(overview.map((r) => r.id), [r101])
  const readings = await as(alice, `select room_id from public.meter_readings`)
  assert.deepEqual(readings.map((r) => r.room_id), [r101])
})
await test('tenant cannot write bills, payments or their own role directly', async () => {
  await rejects(as(alice, `update public.bills set amount_paid = total_amount where id = $1`, [aliceBill]), /permission denied/)
  await rejects(as(alice, `insert into public.payments (bill_id, tenant_id, amount, method, paid_on, submitted_by, status)
    values ($1, $2, 1, 'cash', current_date, $2, 'verified')`, [aliceBill, alice]), /permission denied/)
  await rejects(as(alice, `update public.profiles set role = 'landlord' where id = $1`, [alice]), /permission denied/)
  await rejects(as(alice, `select public._generate_bills($1)`, [PERIOD]), /permission denied/)
})
await test('tenant can edit own contact details but not other tenants', async () => {
  await as(alice, `update public.profiles set phone = '0917' where id = $1`, [alice])
  await as(alice, `update public.profiles set phone = 'hacked' where id = $1`, [bob])
  const rows = await asAdmin(`select id, phone from public.profiles where id in ($1, $2)`, [alice, bob])
  assert.equal(rows.find((r) => r.id === alice).phone, '0917')
  assert.equal(rows.find((r) => r.id === bob).phone, null)
})
await test('anonymous users see nothing', async () => {
  await rejects(as(null, `select * from public.bills`), /permission denied/)
  await rejects(as(null, `select * from public.app_settings`), /permission denied/)
  await rejects(as(null, `select * from public.tenant_overview`), /permission denied/)
  await rejects(as(null, `select * from public.deposit_balances`), /permission denied/)
  await rejects(as(null, `select public.move_tenant(gen_random_uuid(), gen_random_uuid(), current_date)`), /permission denied/)
})

console.log('\nPayments')
await test("tenant cannot pay someone else's bill or skip proof", async () => {
  await rejects(as(alice, `select public.submit_payment($1, 100, 'gcash', current_date, $2)`, [bobBill, `${alice}/p.jpg`]), /Bill not found/)
  await rejects(as(alice, `select public.submit_payment($1, 100, 'gcash', current_date, $2)`, [aliceBill, `${bob}/p.jpg`]), /Proof/)
  await rejects(as(alice, `select public.submit_payment($1, 999999, 'gcash', current_date, $2)`, [aliceBill, `${alice}/p.jpg`]), /exceeds/)
})
let p1
await test('submitted payment stays pending and does not reduce the balance', async () => {
  ;[{ submit_payment: p1 }] = await as(alice,
    `select public.submit_payment($1, 2000, 'gcash', current_date, $2, 'REF-1')`, [aliceBill, `${alice}/p1.jpg`])
  const b = await bill(aliceBill)
  assert.equal(b.status, 'unpaid')
  assert.equal(num(b.balance), 6500)
})
await test('tenant cannot verify their own payment', async () => {
  await rejects(as(alice, `select public.review_payment($1, true)`, [p1]), /Only the landlord/)
})
await test('verification makes the bill partial; full balance makes it paid', async () => {
  await as(landlord, `select public.review_payment($1, true)`, [p1])
  let b = await bill(aliceBill)
  assert.equal(b.status, 'partial')
  assert.equal(num(b.balance), 4500)
  const [{ submit_payment: p2 }] = await as(alice,
    `select public.submit_payment($1, 4500, 'bank_transfer', current_date, $2)`, [aliceBill, `${alice}/p2.jpg`])
  await rejects(as(landlord, `select public.review_payment($1, true, 5000)`, [p2]), /exceeds/)
  await as(landlord, `select public.review_payment($1, true)`, [p2])
  b = await bill(aliceBill)
  assert.equal(b.status, 'paid')
  assert.equal(num(b.balance), 0)
  await rejects(as(landlord, `select public.review_payment($1, false, null, 'dup')`, [p2]), /already been verified/)
})
await test('rejection needs a reason and leaves the balance unchanged', async () => {
  const [{ submit_payment: p3 }] = await as(bob,
    `select public.submit_payment($1, 1000, 'gcash', current_date, $2)`, [bobBill, `${bob}/p3.jpg`])
  await rejects(as(landlord, `select public.review_payment($1, false)`, [p3]), /reason/)
  await as(landlord, `select public.review_payment($1, false, null, 'Blurry screenshot')`, [p3])
  const b = await bill(bobBill)
  assert.equal(b.status, 'unpaid')
})
await test('landlord records a cash payment directly (verified)', async () => {
  await as(landlord, `select public.record_payment($1, 1000, 'cash', current_date)`, [bobBill])
  assert.equal((await bill(bobBill)).status, 'partial')
})

console.log('\nDeposits')
await test('deposit ledger is separate from bills', async () => {
  const [d] = await as(landlord, `select balance from public.deposit_balances where tenant_id = $1`, [alice])
  assert.equal(num(d.balance), 5000)
  const [{ total }] = await asAdmin(`select coalesce(sum(amount_paid), 0) as total from public.bills where tenant_id = $1`, [alice])
  assert.equal(num(total), 6500)
})
await test('deductions need a note and cannot exceed the balance', async () => {
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'deduction', 100, current_date)`, [aliceLease]), /reason/)
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'refund', 6000, current_date, 'Move out')`, [aliceLease]), /exceeds/)
  await as(landlord, `select public.record_deposit_transaction($1, 'deduction', 800, current_date, 'Wall repair')`, [aliceLease])
  const [d] = await as(alice, `select balance from public.deposit_balances`)
  assert.equal(num(d.balance), 4200)
})

console.log('\nHistory preservation')
await test('bills with verified payments cannot be voided', async () => {
  await rejects(as(landlord, `select public.void_bill($1, 'mistake')`, [aliceBill]), /cannot be voided/)
})
await test('voiding keeps the bill and allows a corrected one for the same month', async () => {
  const [{ id: carol }] = await asAdmin(
    `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'carol@example.com', '{"invited_as":"tenant"}') returning id`)
  await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01')`, [carol, r103])
  await as(landlord, `select public.generate_bills($1)`, [PERIOD])
  const [{ id: carolBill }] = await asAdmin(`select id from public.bills where tenant_id = $1`, [carol])
  await as(landlord, `select public.void_bill($1, 'Wrong rent')`, [carolBill])
  const [{ generate_bills: created }] = await as(landlord, `select public.generate_bills($1)`, [PERIOD])
  assert.equal(created, 1)
  const rows = await asAdmin(`select status from public.bills where tenant_id = $1 order by created_at`, [carol])
  assert.deepEqual(rows.map((r) => r.status), ['void', 'unpaid'])
})
await test('nobody can delete bills or payments', async () => {
  await rejects(as(landlord, `delete from public.bills where id = $1`, [aliceBill]), /permission denied/)
  await rejects(as(landlord, `delete from public.payments where id = $1`, [p1]), /permission denied/)
})
await test('ending a lease frees the room and keeps the history', async () => {
  await as(landlord, `select public.end_lease($1, '2026-10-31')`, [bobLease])
  const [r] = await as(landlord, `select occupancy from public.room_overview where id = $1`, [r102])
  assert.equal(r.occupancy, 'vacant')
  const bills = await as(bob, `select id from public.bills`)
  assert.equal(bills.length, 1)
})
await test('a lease ended mid-month still gets that month billed, but not later months', async () => {
  const [{ id: dave }] = await asAdmin(
    `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'dave@example.com', '{"invited_as":"tenant"}') returning id`)
  const [{ assign_tenant: lease }] = await as(landlord,
    `select public.assign_tenant($1, $2, '2026-08-01')`, [dave, await roomId('104')])
  await as(landlord, `select public.end_lease($1, '2026-11-10')`, [lease])
  await as(landlord, `select public.generate_bills('2026-11-01')`)
  await as(landlord, `select public.generate_bills('2026-12-01')`)
  const rows = await asAdmin(`select period from public.bills where lease_id = $1`, [lease])
  assert.deepEqual(rows.map((r) => r.period.toISOString().slice(0, 7)), ['2026-11'])
})

console.log('\nTenant management')
await test('tenant_overview lists invited tenants only, and tenants see only themselves', async () => {
  const all = await as(landlord, `select id, account_status from public.tenant_overview`)
  assert.ok(all.some((t) => t.id === alice))
  assert.ok(!all.some((t) => t.id === stray), 'stray dashboard user must not be listed')
  assert.equal(all.find((t) => t.id === alice).account_status, 'invited')
  const own = await as(alice, `select id from public.tenant_overview`)
  assert.deepEqual(own.map((t) => t.id), [alice])
})
await test('activating an invite flips the status to active', async () => {
  await as(alice, `select public.mark_account_activated()`)
  const [t] = await as(landlord, `select account_status from public.tenant_overview where id = $1`, [alice])
  assert.equal(t.account_status, 'active')
})
await test('deactivation requires ending the tenancy first and is landlord-only', async () => {
  await rejects(as(landlord, `select public.set_tenant_active($1, false)`, [alice]), /End this tenant/)
  await rejects(as(alice, `select public.set_tenant_active($1, false)`, [bob]), /Only the landlord/)
  await as(landlord, `select public.set_tenant_active($1, false)`, [bob])
  let [t] = await as(landlord, `select account_status from public.tenant_overview where id = $1`, [bob])
  assert.equal(t.account_status, 'inactive')
  await rejects(as(bob, `select public.submit_payment($1, 1, 'gcash', current_date, $2)`, [bobBill, `${bob}/x.jpg`]), /not active/)
  await as(landlord, `select public.set_tenant_active($1, true)`, [bob])
  ;[t] = await as(landlord, `select account_status from public.tenant_overview where id = $1`, [bob])
  assert.notEqual(t.account_status, 'inactive')
  await rejects(as(landlord, `select public.set_tenant_active($1, false)`, [landlord]), /Tenant not found/)
})
await test('moving into an occupied room fails and leaves the current lease intact', async () => {
  await rejects(as(landlord, `select public.move_tenant($1, $2, '2026-11-01')`, [aliceLease, r103]), /occupied/)
  const [l] = await asAdmin(`select status from public.leases where id = $1`, [aliceLease])
  assert.equal(l.status, 'active')
  await rejects(as(landlord, `select public.move_tenant($1, $2, '2026-09-01')`, [aliceLease, await roomId('105')]), /after the current lease start/)
})
await test('moving rooms ends the old lease the day before and carries the deposit', async () => {
  const r105 = await roomId('105')
  const [{ move_tenant: newLease }] = await as(landlord,
    `select public.move_tenant($1, $2, '2026-11-01', 5200)`, [aliceLease, r105])
  const [old] = await asAdmin(`select status, end_date from public.leases where id = $1`, [aliceLease])
  assert.equal(old.status, 'ended')
  assert.equal(old.end_date.toISOString().slice(0, 10), '2026-10-31')
  const [t] = await as(landlord, `select room_number, lease_rent, deposit_balance from public.tenant_overview where id = $1`, [alice])
  assert.equal(t.room_number, '105')
  assert.equal(num(t.lease_rent), 5200)
  assert.equal(num(t.deposit_balance), 4200)
  // The deposit can be refunded against the new lease.
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'refund', 4300, current_date, 'Move out')`, [newLease]), /exceeds/)
  await as(landlord, `select public.record_deposit_transaction($1, 'refund', 4200, current_date, 'Move out')`, [newLease])
  const [d] = await as(alice, `select balance from public.deposit_balances`)
  assert.equal(num(d.balance), 0)
})

console.log('\nRead models')
await test('bill_overview flags overdue bills and is tenant-isolated', async () => {
  const mine = await as(bob, `select tenant_id, is_overdue, room_number from public.bill_overview`)
  assert.ok(mine.length > 0 && mine.every((b) => b.tenant_id === bob))
  // October bills were due 2026-10-08; whether they are overdue depends on today's date.
  const [{ overdue }] = await asAdmin(
    `select (public.property_today() > '2026-10-08') as overdue`)
  const open = await as(landlord,
    `select is_overdue from public.bill_overview where period = '2026-10-01' and status in ('unpaid','partial')`)
  assert.ok(open.every((b) => b.is_overdue === overdue))
  const paid = await as(landlord, `select is_overdue from public.bill_overview where status = 'paid'`)
  assert.ok(paid.every((b) => b.is_overdue === false))
})
await test('payment_overview shows tenants only their own payments', async () => {
  const mine = await as(alice, `select tenant_id, recorded_by_landlord from public.payment_overview`)
  assert.ok(mine.length >= 2 && mine.every((p) => p.tenant_id === alice))
  const cash = await as(landlord, `select recorded_by_landlord from public.payment_overview where method = 'cash'`)
  assert.ok(cash.length > 0 && cash.every((p) => p.recorded_by_landlord))
})
await test('meter_reading_sheet carries previous readings forward', async () => {
  const rows = await as(landlord, `select * from public.meter_reading_sheet('2026-11-01')`)
  assert.equal(rows.length, 28)
  const r101 = rows.find((r) => r.room_number === '101')
  assert.equal(num(r101.electricity_previous), 1100)
  assert.equal(r101.electricity_current, null)
  const r102 = rows.find((r) => r.room_number === '102')
  assert.equal(num(r102.electricity_previous), 550)
  const tenantRows = await as(alice, `select room_number from public.meter_reading_sheet('2026-11-01')`)
  assert.ok(tenantRows.every((r) => ['101', '105'].includes(r.room_number)))
})

await test('landlord shares contact details; tenants can read but not change them', async () => {
  await as(landlord, `update public.app_settings set contact_name = 'Owner', contact_phone = '0917', house_rules = 'Quiet after 10pm'`)
  await as(alice, `update public.app_settings set contact_phone = 'hacked'`)
  const [s] = await as(alice, `select contact_name, contact_phone, house_rules from public.app_settings`)
  assert.deepEqual(s, { contact_name: 'Owner', contact_phone: '0917', house_rules: 'Quiet after 10pm' })
})

console.log('\nScheduler')
await test('scheduled billing is idempotent and not client-callable', async () => {
  await rejects(as(landlord, `select public.run_scheduled_billing()`), /permission denied/)
  await asAdmin(`select public.run_scheduled_billing()`)
  const [{ n }] = await asAdmin(`select public.run_scheduled_billing() as n`)
  assert.equal(n, 0)
})

console.log('\nStorage')
await test('tenants upload proofs only to their own folder and read only their own', async () => {
  await as(alice, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${alice}/a.jpg`])
  await rejects(as(alice, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${bob}/x.jpg`]), /row-level security/)
  await asAdmin(`insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${bob}/b.jpg`])
  const visible = await as(alice, `select name from storage.objects`)
  assert.deepEqual(visible.map((o) => o.name), [`${alice}/a.jpg`])
  const all = await as(landlord, `select name from storage.objects`)
  assert.equal(all.length, 2)
})
await test('tenants cannot upload documents', async () => {
  await rejects(as(alice, `insert into storage.objects (bucket_id, name) values ('tenant-documents', $1)`, [`${alice}/id.pdf`]), /row-level security/)
})

console.log('\nProfile photos')
await test('users upload and remove only their own photo; landlord sees all', async () => {
  const put = (user, owner) =>
    as(user, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${owner}/me.jpg`])
  await put(alice, alice)
  await rejects(put(alice, bob), /row-level security/)
  await put(bob, bob)
  await put(landlord, landlord)
  const seen = await as(alice, `select name from storage.objects where bucket_id = 'avatars'`)
  assert.deepEqual(seen.map((o) => o.name), [`${alice}/me.jpg`])
  const all = await as(landlord, `select name from storage.objects where bucket_id = 'avatars'`)
  assert.equal(all.length, 3)
  await as(alice, `delete from storage.objects where bucket_id = 'avatars'`)
  const [{ n }] = await asAdmin(`select count(*)::int as n from storage.objects where bucket_id = 'avatars'`)
  assert.equal(n, 2)
})
await test("avatar_path must point into the user's own folder", async () => {
  await as(alice, `update public.profiles set avatar_path = $2 where id = $1`, [alice, `${alice}/me.jpg`])
  await rejects(as(alice, `update public.profiles set avatar_path = $2 where id = $1`, [alice, `${bob}/me.jpg`]), /avatar_path_check/)
  const [t] = await as(landlord, `select avatar_path from public.tenant_overview where id = $1`, [alice])
  assert.equal(t.avatar_path, `${alice}/me.jpg`)
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`)
