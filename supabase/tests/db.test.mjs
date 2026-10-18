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
    email_confirmed_at timestamptz,
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
    name text not null,
    metadata jsonb not null default '{}'::jsonb
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

// Freeze the property's clock so date rules (finalizing, overdue) do not depend on when the suite runs.
await db.exec(`
  create or replace function public.property_today() returns date language sql stable security definer
  set search_path = '' as $$
    select coalesce(nullif(current_setting('test.today', true), '')::date, (now() at time zone timezone)::date)
    from public.app_settings where id
  $$`)
let baseToday = '2026-10-01'
const setToday = (date) => db.query(`select set_config('test.today', $1, false)`, [date])
/** Runs fn with the property's clock at `date` (e.g. a payment made later in the story), then restores it. */
async function on(date, fn) {
  await setToday(date)
  try {
    return await fn()
  } finally {
    await setToday(baseToday)
  }
}
await setToday('2026-10-01')

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

/** A new login, as Supabase Auth creates it (self-signup, dashboard or invite). */
async function createUser(email, meta = {}, { confirmed = true } = {}) {
  const [{ id }] = await asAdmin(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values (gen_random_uuid(), $1, case when $2 then now() end, $3) returning id`,
    [email, confirmed, JSON.stringify(meta)],
  )
  return id
}

/** What the invite-tenant edge function does: create an unconfirmed login, then link it as service role. */
async function invite(email, fullName, tenantId = null) {
  const user = await createUser(email, { full_name: fullName }, { confirmed: false })
  await asAdmin(`select public._link_invited_user($1, $2, $3, $4)`, [user, landlord, tenantId, fullName])
  return user
}

const roomId = async (num) =>
  (await asAdmin(`select id from public.rooms where room_number = $1`, [num]))[0].id
const bill = async (id) => (await asAdmin(`select * from public.bills where id = $1`, [id]))[0]
const num = (v) => Number(v)
/** Stores a payment-proof object as the tenant's upload would, and returns its path. */
const proof = async (owner, name) => {
  const path = `${owner}/${name}`
  await asAdmin(`insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [path])
  return path
}

// --- fixtures ----------------------------------------------------------------------
const landlord = await createUser('owner@example.com', { full_name: 'Owner' })
await asAdmin(`select public.bootstrap_landlord('owner@example.com')`)
// Historical test periods predate the migration's initial live rate.
await asAdmin(`insert into public.water_rate_schedule (monthly_rate, effective_from) values (150, '2026-01-01')`)
const alice = await invite('alice@example.com', 'Alice')
const bob = await invite('bob@example.com', 'Bob')
const stray = await createUser('stray@example.com')
const r101 = await roomId('101')
const r102 = await roomId('102')
const r103 = await roomId('103')
const PERIOD = '2026-10-01'

console.log('\nAccounts')
await test('the landlord is set up explicitly with bootstrap_landlord', async () => {
  const [p] = await asAdmin(`select role, is_active from public.profiles where id = $1`, [landlord])
  assert.equal(p.role, 'landlord')
  assert.equal(p.is_active, true)
})
await test('invited users become tenants; other new logins only get a pending request', async () => {
  const rows = await asAdmin(`select id, role, is_active from public.profiles where id in ($1, $2)`, [alice, stray])
  assert.deepEqual(rows, [{ id: alice, role: 'tenant', is_active: true }])
  const [r] = await asAdmin(`select status from public.registration_requests where user_id = $1`, [stray])
  assert.equal(r.status, 'pending')
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
  const [{ generate_bills: created }] = await on('2026-10-20', () =>
    as(landlord, `select public.generate_bills($1)`, [PERIOD]))
  assert.equal(created, 2)
  ;[{ id: aliceBill }] = await asAdmin(`select id from public.bills where lease_id = $1`, [aliceLease])
  ;[{ id: bobBill }] = await asAdmin(`select id from public.bills where lease_id = $1`, [bobLease])
  const b = await bill(aliceBill)
  assert.equal(num(b.total_amount), 5000 + 100 * 12 + 150)
  assert.equal(b.status, 'unpaid')
  assert.equal(b.due_date.toISOString().slice(0, 10), '2026-10-15')
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
  assert.equal(num(b.total_amount), 4500 + 50 * 12 + 150)
})
await test('meter readings cannot go backwards', async () => {
  await rejects(as(landlord, `select public.record_meter_readings($1, $2)`, [PERIOD, JSON.stringify([
    { room_id: r102, electricity_current: 400 },
  ])]), /lower than previous/)
})
await test('extra charges and rent adjustments recalculate totals', async () => {
  const [{ add_bill_charge: itemId }] = await as(landlord,
    `select public.add_bill_charge($1, 'Key replacement', 250)`, [aliceBill])
  assert.equal(num((await bill(aliceBill)).total_amount), 6600)
  await as(landlord, `select public.remove_bill_charge($1)`, [itemId])
  assert.equal(num((await bill(aliceBill)).total_amount), 6350)
  const [{ id: utilityItem }] = await asAdmin(
    `select id from public.bill_items where bill_id = $1 and kind = 'electricity'`, [aliceBill])
  await rejects(as(landlord, `select public.update_bill_item($1, null, 0)`, [utilityItem]), /meter reading/)
})

console.log('\nConsolidated bill lifecycle')
await test('a generated bill is a draft: hidden from the tenant and closed to payments', async () => {
  const [b] = await as(landlord, `select is_finalized, missing_charges from public.bill_overview where id = $1`, [aliceBill])
  assert.deepEqual(b, { is_finalized: false, missing_charges: [] })
  assert.equal((await as(alice, `select 1 from public.bills`)).length, 0)
  assert.equal((await as(alice, `select 1 from public.bill_items`)).length, 0)
  assert.equal((await as(alice, `select 1 from public.bill_overview`)).length, 0)
  await rejects(as(alice, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`,
    [aliceBill, await proof(alice, 'early.jpg')]), /Bill not found/)
  await rejects(as(landlord, `select public.record_payment($1, 100, 'cash', public.property_today())`, [aliceBill]), /Finalize this bill/)
  await rejects(asAdmin(`insert into public.payments (bill_id, tenant_id, amount, method, paid_on, submitted_by, status, reviewed_by, reviewed_at)
    values ($1, $2, 100, 'cash', public.property_today(), $3, 'verified', $3, now())`, [aliceBill, alice, landlord]), /finalized bill/)
})
await test('a bill cannot be finalized until its required charges are in', async () => {
  const carl = await invite('carl@example.com', 'Carl')
  const [{ assign_tenant: lease }] = await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01', 3000)`,
    [carl, await roomId('106')])
  await as(landlord, `select public.generate_bills($1)`, [PERIOD])
  const [{ id }] = await asAdmin(`select id from public.bills where lease_id = $1`, [lease])
  const [d] = await as(landlord, `select missing_charges from public.bill_overview where id = $1`, [id])
  assert.deepEqual(d.missing_charges, ['electricity'])
  await rejects(as(landlord, `select public.finalize_bill($1)`, [id]), /no electricity charge/)
  await rejects(as(carl, `select public.finalize_bill($1)`, [id]), /Only the landlord/)
  // Bulk finalizing skips incomplete drafts.
  assert.equal((await as(landlord, `select public.finalize_bills($1) as n`, [PERIOD]))[0].n, 2)
  assert.equal((await bill(id)).finalized_at, null)
  // A room without its own meter can be finalized explicitly without utilities.
  await as(landlord, `select public.finalize_bill($1, true)`, [id])
  assert.ok((await bill(id)).finalized_at)
  await on('2026-10-02', () => as(landlord, `select public.record_payment($1, 3000, 'cash', '2026-10-02')`, [id]))
  await as(landlord, `select public.end_lease($1, '2026-10-31')`, [lease])
})
await test('finalizing issues the bill: tenant sees one consolidated bill with every charge', async () => {
  for (const id of [aliceBill, bobBill]) assert.ok((await bill(id)).finalized_at)
  const [b] = await as(alice, `select total_amount, rent_amount, electricity_amount, water_amount, other_amount,
    is_finalized, due_date from public.bill_overview`)
  assert.deepEqual(
    { total: num(b.total_amount), rent: num(b.rent_amount), electricity: num(b.electricity_amount), water: num(b.water_amount), other: num(b.other_amount) },
    { total: 6350, rent: 5000, electricity: 1200, water: 150, other: 0 })
  assert.equal(b.is_finalized, true)
  assert.equal(b.due_date.toISOString().slice(0, 10), '2026-10-15')
  const kinds = (await as(alice, `select kind from public.bill_items order by sort_order`)).map((i) => i.kind)
  assert.deepEqual(kinds, ['rent', 'electricity', 'water'])
  await rejects(as(landlord, `select public.finalize_bill($1)`, [aliceBill]), /already finalized/)
})
await test('charges on a finalized bill are locked', async () => {
  const [{ id: rentItem }] = await asAdmin(`select id from public.bill_items where bill_id = $1 and kind = 'rent'`, [aliceBill])
  await rejects(as(landlord, `select public.update_bill_item($1, null, 4000)`, [rentItem]), /finalized\. Reopen it/)
  await rejects(as(landlord, `select public.add_bill_charge($1, 'Late fee', 100)`, [aliceBill]), /finalized/)
  await rejects(as(landlord, `select public.record_meter_readings($1, $2)`, [PERIOD, JSON.stringify([
    { room_id: r101, electricity_previous: 1000, electricity_current: 1150, water_previous: 50, water_current: 60 },
  ])]), /already finalized/)
  // Re-saving the same values is harmless.
  await as(landlord, `select public.record_meter_readings($1, $2)`, [PERIOD, JSON.stringify([
    { room_id: r101, electricity_previous: 1000, electricity_current: 1100, water_previous: 50, water_current: 60 },
  ])])
  await rejects(asAdmin(`delete from public.bill_items where id = $1`, [rentItem]), /finalized/)
  assert.equal(num((await bill(aliceBill)).total_amount), 6350)
})
await test('a finalized bill without payments can be reopened, corrected and reissued', async () => {
  await rejects(as(alice, `select public.reopen_bill($1)`, [aliceBill]), /Only the landlord/)
  await as(landlord, `select public.reopen_bill($1)`, [bobBill])
  assert.equal((await as(bob, `select 1 from public.bills`)).length, 0)
  await as(landlord, `select public.add_bill_charge($1, 'Gate key', 150)`, [bobBill])
  await as(landlord, `select public.finalize_bill($1)`, [bobBill])
  const b = await bill(bobBill)
  assert.equal(b.revision, 2)
  assert.equal(num(b.total_amount), 4500 + 600 + 150 + 150)
  const [{ id: key }] = await asAdmin(`select id from public.bill_items where bill_id = $1 and kind = 'other'`, [bobBill])
  await as(landlord, `select public.reopen_bill($1)`, [bobBill])
  await as(landlord, `select public.remove_bill_charge($1)`, [key])
  await as(landlord, `select public.finalize_bill($1)`, [bobBill])
  assert.equal(num((await bill(bobBill)).total_amount), 5250)
})
await test('a bill finalized after its issue date gets the full payment window', async () => {
  const dana = await invite('dana@example.com', 'Dana')
  const [{ assign_tenant: lease }] = await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01', 2000)`,
    [dana, await roomId('107')])
  await as(landlord, `select public.generate_bills($1)`, [PERIOD])
  const [{ id }] = await asAdmin(`select id from public.bills where lease_id = $1`, [lease])
  await setToday('2026-10-12')
  try {
    await as(landlord, `select public.finalize_bill($1, true)`, [id])
  } finally {
    await setToday(baseToday)
  }
  const b = await bill(id)
  assert.equal(b.issue_date.toISOString().slice(0, 10), '2026-10-01')
  assert.equal(b.due_date.toISOString().slice(0, 10), '2026-10-01')
  await on('2026-10-12', () => as(landlord, `select public.record_payment($1, 2000, 'cash', '2026-10-12')`, [id]))
  await as(landlord, `select public.end_lease($1, '2026-10-31')`, [lease])
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
    values ($1, $2, 1, 'cash', public.property_today(), $2, 'verified')`, [aliceBill, alice]), /permission denied/)
  await rejects(as(alice, `update public.profiles set role = 'landlord' where id = $1`, [alice]), /permission denied/)
  await rejects(as(alice, `select public._generate_bills($1)`, [PERIOD]), /permission denied/)
})
await test('tenant can edit own contact details but not other tenants', async () => {
  await as(alice, `update public.profiles set phone = '0917 123 4567' where id = $1`, [alice])
  await as(alice, `update public.profiles set phone = 'hacked' where id = $1`, [bob])
  const rows = await asAdmin(`select id, phone from public.profiles where id in ($1, $2)`, [alice, bob])
  assert.equal(rows.find((r) => r.id === alice).phone, '0917 123 4567')
  assert.equal(rows.find((r) => r.id === bob).phone, null)
})
await test('anonymous users see nothing', async () => {
  await rejects(as(null, `select * from public.bills`), /permission denied/)
  await rejects(as(null, `select * from public.app_settings`), /permission denied/)
  await rejects(as(null, `select * from public.tenant_overview`), /permission denied/)
  await rejects(as(null, `select * from public.deposit_balances`), /permission denied/)
  await rejects(as(null, `select public.move_tenant(gen_random_uuid(), gen_random_uuid(), public.property_today())`), /permission denied/)
})

console.log('\nPayments')
await test("tenant cannot pay someone else's bill or skip proof", async () => {
  await rejects(as(alice, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`, [bobBill, `${alice}/p.jpg`]), /Bill not found/)
  await rejects(as(alice, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`, [aliceBill, `${bob}/p.jpg`]), /Proof/)
  await rejects(as(alice, `select public.submit_payment($1, 999999, 'gcash', public.property_today(), $2)`, [aliceBill, `${alice}/p.jpg`]), /exceeds/)
})
let p1
await test('submitted payment stays pending and does not reduce the balance', async () => {
  ;[{ submit_payment: p1 }] = await as(alice,
    `select public.submit_payment($1, 2000, 'gcash', public.property_today(), $2, 'REF-1')`, [aliceBill, await proof(alice, 'p1.jpg')])
  const b = await bill(aliceBill)
  assert.equal(b.status, 'unpaid')
  assert.equal(num(b.balance), 6350)
})
await test('tenant cannot verify their own payment', async () => {
  await rejects(as(alice, `select public.review_payment_confirmed($1, true, null, null, true)`, [p1]), /Only the landlord/)
})
await test('verification makes the bill partial; full balance makes it paid', async () => {
  await as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [p1])
  let b = await bill(aliceBill)
  assert.equal(b.status, 'partial')
  assert.equal(num(b.balance), 4350)
  const [{ submit_payment: p2 }] = await as(alice,
    `select public.submit_payment($1, 4350, 'bank_transfer', public.property_today(), $2)`, [aliceBill, await proof(alice, 'p2.jpg')])
  await rejects(as(landlord, `select public.review_payment_confirmed($1, true, 5000, null, true)`, [p2]), /exceeds/)
  await as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [p2])
  b = await bill(aliceBill)
  assert.equal(b.status, 'paid')
  assert.equal(num(b.balance), 0)
  await rejects(as(landlord, `select public.review_payment_confirmed($1, false, null, 'dup', false)`, [p2]), /already been verified/)
})
await test('rejection needs a reason and leaves the balance unchanged', async () => {
  const [{ submit_payment: p3 }] = await as(bob,
    `select public.submit_payment($1, 1000, 'gcash', public.property_today(), $2)`, [bobBill, await proof(bob, 'p3.jpg')])
  await rejects(as(landlord, `select public.review_payment_confirmed($1, false, null, null, false)`, [p3]), /reason/)
  await as(landlord, `select public.review_payment_confirmed($1, false, null, 'Blurry screenshot', false)`, [p3])
  const b = await bill(bobBill)
  assert.equal(b.status, 'unpaid')
})
await test('landlord records a cash payment directly (verified)', async () => {
  await as(landlord, `select public.record_payment($1, 1000, 'cash', public.property_today())`, [bobBill])
  assert.equal((await bill(bobBill)).status, 'partial')
})
await test('a provider reference number cannot back two payments', async () => {
  // Alice's verified GCash payment used REF-1; Bob cannot reuse it, in any casing.
  await rejects(as(bob, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2, ' ref-1 ')`,
    [bobBill, await proof(bob, 'reuse.jpg')]), /already been used/)
  await rejects(as(landlord, `select public.record_payment($1, 100, 'gcash', public.property_today(), 'REF-1')`, [bobBill]),
    /already been used/)
  // The same text under a different method, or as a cash note, is fine.
  const [{ record_payment: cash }] = await as(landlord,
    `select public.record_payment($1, 1, 'cash', public.property_today(), 'REF-1')`, [bobBill])
  assert.ok(cash)
})
await test('approval refuses a reference already verified on another payment', async () => {
  // A duplicate that predates the submission check (inserted directly).
  const [{ id }] = await asAdmin(
    `insert into public.payments (bill_id, tenant_id, amount, method, reference_number, paid_on, proof_path, submitted_by)
     values ($1, $2, 100, 'gcash', 'REF-1', public.property_today(), $3, $2) returning id`, [bobBill, bob, await proof(bob, 'legacy.jpg')])
  await rejects(as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [id]), /already verified/)
  await as(landlord, `select public.review_payment_confirmed($1, false, null, 'Duplicate reference', false)`, [id])
})
await test('proof must be an uploaded file not already used by another payment', async () => {
  await rejects(as(bob, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`, [bobBill, `${bob}/ghost.jpg`]),
    /not found/)
  const file = await proof(bob, 'once.jpg')
  const [{ submit_payment: id }] = await as(bob, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`, [bobBill, file])
  await rejects(as(bob, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`, [bobBill, file]), /already attached/)
  // After a rejection the tenant may resubmit the same file.
  await as(landlord, `select public.review_payment_confirmed($1, false, null, 'Wrong amount', false)`, [id])
  const [{ submit_payment: again }] = await as(bob, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`, [bobBill, file])
  await as(landlord, `select public.review_payment_confirmed($1, false, null, 'Test cleanup', false)`, [again])
})
await test('a paid bill can be neither edited nor reopened', async () => {
  const before = await bill(aliceBill)
  assert.equal(before.status, 'paid')
  const [{ id: rentItem }] = await asAdmin(`select id from public.bill_items where bill_id = $1 and kind = 'rent'`, [aliceBill])
  await rejects(as(landlord, `select public.update_bill_item($1, null, 100)`, [rentItem]), /finalized/)
  await rejects(as(landlord, `select public.reopen_bill($1)`, [aliceBill]), /has payments/)
  const after = await bill(aliceBill)
  assert.equal(num(after.balance), 0)
  assert.equal(num(after.total_amount), num(before.total_amount))
})

console.log('\nDeposits')
await test('deposit ledger is separate from bills', async () => {
  const [d] = await as(landlord, `select balance from public.deposit_balances where tenant_id = $1`, [alice])
  assert.equal(num(d.balance), 5000)
  const [{ total }] = await asAdmin(`select coalesce(sum(amount_paid), 0) as total from public.bills where tenant_id = $1`, [alice])
  assert.equal(num(total), 6350)
})
await test('deductions need a note and cannot exceed the balance', async () => {
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'deduction', 100, public.property_today())`, [aliceLease]), /reason/)
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'refund', 6000, public.property_today(), 'Move out')`, [aliceLease]), /exceeds/)
  await as(landlord, `select public.record_deposit_transaction($1, 'deduction', 800, public.property_today(), 'Wall repair')`, [aliceLease])
  const [d] = await as(alice, `select balance from public.deposit_balances`)
  assert.equal(num(d.balance), 4200)
})

console.log('\nHistory preservation')
await test('bills with verified payments cannot be voided', async () => {
  await rejects(as(landlord, `select public.void_bill($1, 'mistake')`, [aliceBill]), /cannot be voided/)
})
await test('voiding keeps the bill and allows a corrected one for the same month', async () => {
  const carol = await invite('carol@example.com', 'Carol')
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
  const dave = await invite('dave@example.com', 'Dave')
  const [{ assign_tenant: lease }] = await as(landlord,
    `select public.assign_tenant($1, $2, '2026-08-01')`, [dave, await roomId('104')])
  await as(landlord, `select public.end_lease($1, '2026-11-10')`, [lease])
  await on('2026-11-01', () => as(landlord, `select public.generate_bills('2026-11-01')`))
  await on('2026-12-01', () => as(landlord, `select public.generate_bills('2026-12-01')`))
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
  await rejects(as(bob, `select public.submit_payment($1, 1, 'gcash', public.property_today(), $2)`, [bobBill, `${bob}/x.jpg`]), /not active/)
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
  // The old lease had not reached its November anniversary, so no November bill exists.
  const nov = await asAdmin(`select status, void_reason from public.bills where lease_id = $1 and period = '2026-11-01'`, [aliceLease])
  assert.deepEqual(nov, [])
  const [t] = await as(landlord, `select room_number, lease_rent, deposit_balance from public.tenant_overview where id = $1`, [alice])
  assert.equal(t.room_number, '105')
  assert.equal(num(t.lease_rent), 5200)
  assert.equal(num(t.deposit_balance), 4200)
  // The deposit can be refunded against the new lease.
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'refund', 4300, public.property_today(), 'Move out')`, [newLease]), /exceeds/)
  await as(landlord, `select public.record_deposit_transaction($1, 'refund', 4200, public.property_today(), 'Move out')`, [newLease])
  const [d] = await as(alice, `select balance from public.deposit_balances`)
  assert.equal(num(d.balance), 0)
})

console.log('\nRead models')
await test('bill_overview flags overdue bills and is tenant-isolated', async () => {
  const mine = await as(bob, `select tenant_id, is_overdue, room_number from public.bill_overview`)
  assert.ok(mine.length > 0 && mine.every((b) => b.tenant_id === bob))
  const [{ today }] = await asAdmin(`select public.property_today()::text as today`)
  const open = await as(landlord,
    `select is_overdue, due_date from public.bill_overview where period = '2026-10-01' and status in ('unpaid','partial')`)
  assert.ok(open.every((b) => b.is_overdue === (today > b.due_date.toISOString().slice(0, 10))))
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

await test('internal functions and the scheduler are not executable by clients', async () => {
  const exposed = await asAdmin(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like '\\_%' or p.proname in ('run_scheduled_billing', 'handle_new_user', 'handle_user_email_change',
                                                   'handle_user_email_confirmed', 'bootstrap_landlord'))
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`)
  assert.deepEqual(exposed, [])
  const anonCallable = await asAdmin(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)
  assert.deepEqual(anonCallable, [])
})

console.log('\nStorage')
await test('tenants upload proofs only to their own folder and read only their own', async () => {
  await as(alice, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${alice}/a.jpg`])
  await rejects(as(alice, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${bob}/x.jpg`]), /row-level security/)
  await asAdmin(`insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${bob}/b.jpg`])
  const mine = [`${alice}/a.jpg`, `${bob}/b.jpg`]
  const visible = await as(alice, `select name from storage.objects where name = any($1)`, [mine])
  assert.deepEqual(visible.map((o) => o.name), [`${alice}/a.jpg`])
  const all = await as(landlord, `select name from storage.objects where name = any($1)`, [mine])
  assert.equal(all.length, 2)
  // Tenants never see another tenant's proofs, whatever the bucket listing.
  const others = await as(alice, `select name from storage.objects where bucket_id = 'payment-proofs' and name not like $1`, [`${alice}/%`])
  assert.equal(others.length, 0)
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

// --- Manual tenants, self-registration and approval ------------------------------------
const requestOf = async (user) =>
  (await asAdmin(`select * from public.registration_requests where user_id = $1`, [user]))[0]
const events = async (requestId) =>
  (await asAdmin(`select event from public.account_audit_log where request_id = $1 order by id`, [requestId]))
    .map((e) => e.event)
const PRIVATE_TABLES = ['profiles', 'rooms', 'room_beds', 'bed_types', 'leases', 'bills', 'bill_items', 'payments',
  'payment_allocations', 'payment_checkouts',
  'deposit_transactions', 'meter_readings', 'app_settings', 'registration_requests', 'account_audit_log']
async function seesNothing(user, { ownProfile = null } = {}) {
  for (const t of PRIVATE_TABLES.filter((t) => !(ownProfile && t === 'profiles'))) {
    const rows = await as(user, `select 1 from public.${t}`)
    assert.equal(rows.length, 0, `${t} must be empty`)
  }
  if (ownProfile) {
    // A suspended tenant still reads its own profile (to show why access is blocked), nothing more.
    const rows = await as(user, `select id from public.profiles`)
    assert.deepEqual(rows.map((r) => r.id), [ownProfile], 'only its own profile')
    const [own] = await as(user, `select lease_id, outstanding_balance, deposit_balance from public.tenant_overview`)
    assert.deepEqual(own, { lease_id: null, outstanding_balance: '0.00', deposit_balance: '0.00' })
  }
  for (const v of ['tenant_overview', 'bill_overview', 'payment_overview', 'room_overview'].filter((v) => !(ownProfile && v === 'tenant_overview'))) {
    const rows = await as(user, `select 1 from public.${v}`)
    assert.equal(rows.length, 0, `${v} must be empty`)
  }
}

console.log('\nManual tenants')
const r110 = await roomId('110')
let frank
await test('landlord creates a tenant without email or login, housed in one step', async () => {
  ;[{ create_manual_tenant: frank }] = await as(landlord,
    `select public.create_manual_tenant('Frank Cruz', '0917 000 0000', $1, '2026-11-01', 4000, 1000)`, [r110])
  const [p] = await asAdmin(`select user_id, email, role from public.profiles where id = $1`, [frank])
  assert.deepEqual(p, { user_id: null, email: null, role: 'tenant' })
  const [t] = await as(landlord, `select account_status, has_portal_access, room_number, deposit_balance
                                  from public.tenant_overview where id = $1`, [frank])
  assert.equal(t.account_status, 'no_portal')
  assert.equal(t.has_portal_access, false)
  assert.equal(t.room_number, '110')
  assert.equal(num(t.deposit_balance), 1000)
})
await test('manual tenants are billed and the landlord records cash payments', async () => {
  await on('2026-12-01', () => as(landlord, `select public.generate_bills('2026-12-01')`))
  const [b] = await asAdmin(`select id, total_amount from public.bills where tenant_id = $1 and period = '2026-12-01'`, [frank])
  assert.equal(num(b.total_amount), 4150)
  await as(landlord, `select public.finalize_bill($1, true)`, [b.id])
  await on('2026-12-03', () => as(landlord, `select public.record_payment($1, 4150, 'cash', '2026-12-03')`, [b.id]))
  assert.equal((await bill(b.id)).status, 'paid')
})
await test('a failed room assignment leaves no orphan tenant record', async () => {
  const before = (await asAdmin(`select count(*)::int as n from public.profiles`))[0].n
  await rejects(as(landlord, `select public.create_manual_tenant('Ghost', null, $1, '2026-11-01')`, [r110]), /occupied/)
  const after = (await asAdmin(`select count(*)::int as n from public.profiles`))[0].n
  assert.equal(after, before)
})
await test('only the landlord creates manual tenants, and names are required', async () => {
  await rejects(as(alice, `select public.create_manual_tenant('Mallory')`), /Only the landlord/)
  await rejects(as(stray, `select public.create_manual_tenant('Mallory')`), /Only the landlord/)
  await rejects(as(landlord, `select public.create_manual_tenant('   ')`), /Enter the tenant name/)
})

console.log('\nSelf-registration')
let grace, graceReq
await test('a sign-up becomes a pending request holding only the claimed details', async () => {
  grace = await createUser('Grace@Example.com', { full_name: ' Grace Cruz ', phone: '0918', requested_room: '110' },
    { confirmed: false })
  graceReq = await requestOf(grace)
  assert.equal(graceReq.status, 'pending')
  assert.equal(graceReq.email, 'grace@example.com')
  assert.equal(graceReq.full_name, 'Grace Cruz')
  assert.equal(graceReq.requested_room, '110')
  assert.equal(graceReq.email_verified_at, null)
  assert.equal((await asAdmin(`select 1 from public.profiles where user_id = $1`, [grace])).length, 0)
})
await test('sign-up metadata cannot grant a role or a tenant record', async () => {
  const eve = await createUser('eve@example.com', { invited_as: 'tenant', role: 'landlord', tenant_id: frank })
  assert.equal((await asAdmin(`select 1 from public.profiles where user_id = $1`, [eve])).length, 0)
  assert.equal((await requestOf(eve)).status, 'pending')
  await rejects(asAdmin(`select public.bootstrap_landlord('eve@example.com')`), /already exists/)
  await rejects(as(eve, `select public.bootstrap_landlord('eve@example.com')`), /permission denied/)
})
await test('duplicate registrations are refused', async () => {
  await rejects(asAdmin(`insert into public.registration_requests (user_id, email) values ($1, 'x@example.com')`, [grace]),
    /registration_requests_user_key/)
  const other = await createUser('other@example.com')
  await rejects(asAdmin(`update public.registration_requests set email = 'grace@example.com' where user_id = $1`, [other]),
    /registration_requests_pending_email/)
})
await test('pending users see no rental data at all, even when the room claim matches', async () => {
  await seesNothing(grace)
  await seesNothing(stray)
  const [mine] = await as(grace, `select * from public.my_registration()`)
  assert.equal(mine.status, 'pending')
  assert.equal(mine.email_verified, false)
  const [{ id: bill110 }] = await asAdmin(`select id from public.bills where tenant_id = $1 limit 1`, [frank])
  await rejects(as(grace, `select public.submit_payment($1, 1, 'gcash', public.property_today(), $2)`, [bill110, `${frank}/x.jpg`]),
    /not active/)
  await rejects(as(grace, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${frank}/x.jpg`]),
    /row-level security/)
  await rejects(as(grace, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${grace}/x.jpg`]),
    /row-level security/)
})
await test('applicants cannot approve, edit or link themselves', async () => {
  await rejects(as(grace, `select public.approve_registration($1, $2, 'existing_record', 'it is me')`, [graceReq.id, frank]),
    /Only the landlord/)
  await rejects(as(grace, `select public.reject_registration($1, 'nope')`, [graceReq.id]), /Only the landlord/)
  await rejects(as(grace, `update public.registration_requests set status = 'approved'`), /permission denied/)
  await rejects(as(grace, `insert into public.registration_requests (user_id, email) values ($1, 'g2@example.com')`, [grace]),
    /permission denied/)
  await rejects(as(grace, `insert into public.profiles (user_id, full_name) values ($1, 'Grace')`, [grace]), /permission denied/)
  await rejects(as(grace, `update public.profiles set user_id = $1 where id = $2`, [grace, frank]), /permission denied/)
  await rejects(as(grace, `select public._link_invited_user($1, $2, $3)`, [grace, landlord, frank]), /permission denied/)
  await rejects(as(grace, `select public.set_portal_suspended($1, false)`, [frank]), /Only the landlord/)
  assert.equal((await requestOf(grace)).status, 'pending')
})
await test('tenants cannot change their role, link or suspension state', async () => {
  for (const col of [`role = 'landlord'`, `user_id = null`, `suspended_at = null`, `is_active = true`, `email = 'a@b.co'`]) {
    await rejects(as(alice, `update public.profiles set ${col} where id = $1`, [alice]), /permission denied/)
  }
  await rejects(as(alice, `select public.approve_registration($1, null, 'in_person', 'looks fine')`, [graceReq.id]),
    /Only the landlord/)
})
await test('a request cannot be approved before the email is verified', async () => {
  await rejects(as(landlord, `select public.approve_registration($1, $2, 'existing_record', 'Checked ID')`, [graceReq.id, frank]),
    /not verified/)
  await asAdmin(`update auth.users set email_confirmed_at = now() where id = $1`, [grace])
  assert.ok((await requestOf(grace)).email_verified_at)
  assert.deepEqual(await events(graceReq.id), ['login_created', 'email_verified'])
})
await test('approval requires a stated identity check', async () => {
  await rejects(as(landlord, `select public.approve_registration($1, null, 'existing_record', 'Checked ID')`, [graceReq.id]),
    /Select the tenant record/)
  await rejects(as(landlord, `select public.approve_registration($1, $2, 'existing_record', '')`, [graceReq.id, frank]),
    /Describe how/)
  await rejects(as(landlord, `select public.approve_registration($1, $2, 'invitation', 'ok ok')`, [graceReq.id, frank]),
    /verified the applicant/)
  await rejects(as(landlord, `select public.approve_registration($1, $2, null, 'ok ok')`, [graceReq.id, frank]),
    /verified the applicant/)
})

console.log('\nLinking an existing manual tenant')
await test('approving with an existing record links the login and keeps all history', async () => {
  const [{ approve_registration: id }] = await as(landlord,
    `select public.approve_registration($1, $2, 'existing_record', 'Matched phone and lease, checked ID')`,
    [graceReq.id, frank])
  assert.equal(id, frank)
  const [p] = await asAdmin(`select user_id, email, activated_at from public.profiles where id = $1`, [frank])
  assert.equal(p.user_id, grace)
  assert.equal(p.email, 'grace@example.com')
  assert.ok(p.activated_at)
  assert.equal((await asAdmin(`select count(*)::int as n from public.profiles where full_name = 'Frank Cruz'`))[0].n, 1)
  // The new login now sees the record's existing bills, payments, lease and deposit.
  assert.equal((await as(grace, `select 1 from public.bills where tenant_id = $1`, [frank])).length, 1)
  assert.equal((await as(grace, `select 1 from public.payments where tenant_id = $1`, [frank])).length, 1)
  assert.equal((await as(grace, `select 1 from public.leases`)).length, 1)
  const [own] = await as(grace, `select id, account_status, deposit_balance from public.tenant_overview`)
  assert.equal(own.id, frank)
  assert.equal(own.account_status, 'active')
  assert.equal(num(own.deposit_balance), 1000)
  const [r] = await as(grace, `select room_number from public.rooms`)
  assert.equal(r.room_number, '110')
  assert.deepEqual(await events(graceReq.id),
    ['login_created', 'email_verified', 'registration_approved', 'account_linked'])
  const [req] = await as(landlord, `select status, tenant_id, identity_check, reviewed_by from public.registration_requests where id = $1`, [graceReq.id])
  assert.deepEqual(req, { status: 'approved', tenant_id: frank, identity_check: 'existing_record', reviewed_by: landlord })
})
await test('linked tenants upload proofs to the record folder and pay their own bills', async () => {
  await on('2027-01-01', () => as(landlord, `select public.generate_bills('2027-01-01')`))
  const [{ id: b }] = await asAdmin(`select id from public.bills where tenant_id = $1 and period = '2027-01-01'`, [frank])
  await as(landlord, `select public.add_bill_charge($1, 'Repair', 100)`, [b])
  await as(landlord, `select public.finalize_bill($1, true)`, [b])
  await as(grace, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${frank}/g.jpg`])
  await rejects(as(grace, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${grace}/g.jpg`]),
    /row-level security/)
  await as(grace, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2, 'GC-LINK-1')`, [b, `${frank}/g.jpg`])
  const [pm] = await as(landlord, `select tenant_id, recorded_by_landlord from public.payment_overview where reference_number = 'GC-LINK-1'`)
  assert.deepEqual(pm, { tenant_id: frank, recorded_by_landlord: false })
})
await test('a tenant record can never be linked to two logins', async () => {
  const henry = await createUser('henry@example.com', { full_name: 'Frank Cruz', requested_room: '110' })
  const henryReq = await requestOf(henry)
  await rejects(as(landlord, `select public.approve_registration($1, $2, 'in_person', 'Same name and room')`, [henryReq.id, frank]),
    /already linked/)
  await rejects(as(landlord, `select public.approve_registration($1, $2, 'existing_record', 'retry')`, [graceReq.id, frank]),
    /already approved/)
  await rejects(asAdmin(`update public.profiles set user_id = $1 where id = $2`, [grace, alice]), /profiles_user_id_key/)
  assert.equal((await requestOf(henry)).status, 'pending')
})
await test('cross-tenant isolation holds after linking', async () => {
  assert.equal((await as(grace, `select 1 from public.bills where tenant_id <> $1`, [frank])).length, 0)
  assert.equal((await as(alice, `select 1 from public.bills where tenant_id = $1`, [frank])).length, 0)
  assert.equal((await as(alice, `select 1 from public.tenant_overview where id = $1`, [frank])).length, 0)
  assert.equal((await as(grace, `select 1 from public.profiles where id <> $1`, [frank])).length, 0)
  const proofs = await as(alice, `select 1 from storage.objects where name like $1`, [`${frank}/%`])
  assert.equal(proofs.length, 0)
})

console.log('\nNew records, rejection and suspension')
await test('approving after in-person verification creates a new record with no room', async () => {
  const ivy = await createUser('ivy@example.com', { full_name: 'Ivy Santos', requested_room: '111' })
  const req = await requestOf(ivy)
  await rejects(as(landlord, `select public.approve_registration($1, null, 'existing_record', 'n/a')`, [req.id]),
    /Select the tenant record/)
  const [{ approve_registration: id }] = await as(landlord,
    `select public.approve_registration($1, null, 'in_person', 'Met in person, saw government ID')`, [req.id])
  const [t] = await as(landlord, `select full_name, email, account_status, lease_id from public.tenant_overview where id = $1`, [id])
  assert.deepEqual(t, { full_name: 'Ivy Santos', email: 'ivy@example.com', account_status: 'active', lease_id: null })
  assert.equal((await as(ivy, `select 1 from public.rooms`)).length, 0)
  assert.equal((await as(ivy, `select 1 from public.bills`)).length, 0)
  assert.equal((await as(ivy, `select 1 from public.app_settings`)).length, 1)
})
await test('rejected applicants keep seeing nothing and learn the reason', async () => {
  const jay = await createUser('jay@example.com', { full_name: 'Jay', requested_room: '101' })
  const req = await requestOf(jay)
  await rejects(as(landlord, `select public.reject_registration($1, '')`, [req.id]), /Give a reason/)
  await as(landlord, `select public.reject_registration($1, 'Not a tenant of this property')`, [req.id])
  const [mine] = await as(jay, `select status, rejection_reason from public.my_registration()`)
  assert.deepEqual(mine, { status: 'rejected', rejection_reason: 'Not a tenant of this property' })
  await seesNothing(jay)
  await rejects(as(landlord, `select public.approve_registration($1, null, 'in_person', 'changed my mind')`, [req.id]),
    /already rejected/)
  assert.deepEqual(await events(req.id), ['login_created', 'registration_rejected'])
})
await test('suspension cuts portal access without touching the tenancy', async () => {
  await rejects(as(landlord, `select public.set_portal_suspended($1, true)`, [frank]), /Give a reason/)
  await as(landlord, `select public.set_portal_suspended($1, true, 'Disputed account owner')`, [frank])
  await seesNothing(grace, { ownProfile: frank })
  const [{ id: b }] = await asAdmin(`select id from public.bills where tenant_id = $1 limit 1`, [frank])
  await rejects(as(grace, `select public.submit_payment($1, 1, 'cash', public.property_today(), $2)`, [b, `${frank}/z.jpg`]), /not active/)
  const [t] = await as(landlord, `select account_status, suspension_reason, lease_id from public.tenant_overview where id = $1`, [frank])
  assert.equal(t.account_status, 'suspended')
  assert.equal(t.suspension_reason, 'Disputed account owner')
  assert.ok(t.lease_id, 'tenancy continues')
  await as(landlord, `select public.set_portal_suspended($1, false)`, [frank])
  assert.equal((await as(grace, `select 1 from public.bills`)).length, 2)
  const log = await asAdmin(`select event from public.account_audit_log where tenant_id = $1 and event::text like 'account_%suspended' order by id`, [frank])
  assert.deepEqual(log.map((e) => e.event), ['account_suspended', 'account_unsuspended'])
})
await test('manual tenants have no portal to suspend; tenants cannot suspend', async () => {
  const [{ create_manual_tenant: kim }] = await as(landlord, `select public.create_manual_tenant('Kim')`)
  await rejects(as(landlord, `select public.set_portal_suspended($1, true, 'test it')`, [kim]), /no portal access/)
  await rejects(as(alice, `select public.set_portal_suspended($1, true, 'test it')`, [bob]), /Only the landlord/)
})

console.log('\nPortal invitations for existing records')
await test('an invitation links a brand-new login to a manual record', async () => {
  const [{ create_manual_tenant: leo }] = await as(landlord, `select public.create_manual_tenant('Leo', null, $1, '2026-11-01')`,
    [await roomId('111')])
  const login = await invite('leo@example.com', 'Leo', leo)
  const [t] = await as(landlord, `select account_status, email from public.tenant_overview where id = $1`, [leo])
  assert.deepEqual(t, { account_status: 'invited', email: 'leo@example.com' })
  assert.equal((await as(login, `select 1 from public.leases`)).length, 1)
  await rejects(invite('leo2@example.com', 'Leo', leo), /already has portal access/)
})
await test('an invitation can never attach an existing self-registration', async () => {
  const [{ create_manual_tenant: mia }] = await as(landlord, `select public.create_manual_tenant('Mia')`)
  const squatter = await createUser('mia@example.com', { full_name: 'Mia' })
  await rejects(asAdmin(`select public._link_invited_user($1, $2, $3)`, [squatter, landlord, mia]), /cannot be linked/)
  await rejects(asAdmin(`select public._link_invited_user($1, $2, $3)`, [await createUser('x2@example.com', {}, { confirmed: false }), alice, mia]),
    /Only the landlord/)
  const [p] = await asAdmin(`select user_id from public.profiles where id = $1`, [mia])
  assert.equal(p.user_id, null)
})

console.log('\nAudit log')
await test('the audit log is landlord-readable and append-only for everyone', async () => {
  assert.ok((await as(landlord, `select 1 from public.account_audit_log`)).length > 0)
  assert.equal((await as(alice, `select 1 from public.account_audit_log`)).length, 0)
  await rejects(as(landlord, `insert into public.account_audit_log (event) values ('account_linked')`), /permission denied/)
  await rejects(as(landlord, `update public.account_audit_log set details = '{}'`), /permission denied/)
  await rejects(as(landlord, `delete from public.account_audit_log`), /permission denied/)
  await rejects(as(landlord, `update public.registration_requests set status = 'approved'`), /permission denied/)
})

// --- Notifications -------------------------------------------------------------------
/** The notifications a login can read (RLS applies), oldest first. */
const inbox = (user, type = null) =>
  as(user, `select * from public.notifications where $1::text is null or type::text = $1 order by created_at, id`, [type])
const inboxCount = async (user, type) => (await inbox(user, type)).length
/** As the database itself (pg_cron, auth triggers): superuser with no signed-in user. */
async function asSystem(sql, params = []) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  return (await db.query(sql, params)).rows
}
/** Runs a scheduled job as of a given property date. */
const runJob = (fn, today) => asSystem(`select public.${fn}(s, $1::date) as n from public.app_settings s`, [today])

console.log('\nNotifications: accounts')
const nina = await invite('nina@example.com', 'Nina Reyes')
const omar = await invite('omar@example.com', 'Omar Diaz')
const r201 = await roomId('201')
const r202 = await roomId('202')
const r203 = await roomId('203')
await test('a verified self-registration notifies the landlord once', async () => {
  const zed = await createUser('zed@example.com', { full_name: 'Zed Cruz', requested_room: '201' }, { confirmed: false })
  const req = await requestOf(zed)
  assert.equal((await inbox(landlord, 'registration_submitted')).filter((n) => n.related_entity_id === req.id).length, 0)
  await asSystem(`update auth.users set email_confirmed_at = now() where id = $1`, [zed])
  const mine = (await inbox(landlord, 'registration_submitted')).filter((n) => n.related_entity_id === req.id)
  assert.equal(mine.length, 1)
  assert.equal(mine[0].category, 'account')
  assert.match(mine[0].message, /Zed Cruz \(requested Room 201\)/)
  await as(landlord, `select public.approve_registration($1, null, 'in_person', 'Saw a government ID')`, [req.id])
  const [approved] = await inbox(zed, 'registration_approved')
  assert.equal(approved.title, 'Account approved')
  assert.equal(await inboxCount(landlord, 'registration_approved'), 0)
})
await test('a rejected applicant is told why', async () => {
  const yan = await createUser('yan@example.com', { full_name: 'Yan' })
  await as(landlord, `select public.reject_registration($1, 'Not a tenant here')`, [(await requestOf(yan)).id])
  const [n] = await inbox(yan, 'registration_rejected')
  assert.match(n.message, /Not a tenant here/)
})
await test('activating an invited account notifies the landlord, not the tenant', async () => {
  await as(nina, `select public.mark_account_activated()`)
  const n = (await inbox(landlord, 'tenant_activated')).filter((x) => x.related_entity_id === nina)
  assert.equal(n.length, 1)
  assert.equal(await inboxCount(nina, 'tenant_activated'), 0)
})

console.log('\nNotifications: billing')
let ninaLease, ninaBill, omarBill
await test('moving in and a new bill each notify the tenant, with the bill total', async () => {
  ;[{ assign_tenant: ninaLease }] = await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01', 6000)`, [nina, r201])
  await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01', 3000)`, [omar, r202])
  const [moveIn] = await inbox(nina, 'lease_started')
  assert.equal(moveIn.title, 'Welcome to Room 201')
  await as(landlord, `select public.generate_bills($1)`, [PERIOD])
  ;[{ id: ninaBill }] = await asAdmin(`select id from public.bills where tenant_id = $1`, [nina])
  ;[{ id: omarBill }] = await asAdmin(`select id from public.bills where tenant_id = $1`, [omar])
  // The draft is not announced; finalizing it is.
  assert.equal(await inboxCount(nina, 'bill_issued'), 0)
  for (const id of [ninaBill, omarBill]) await as(landlord, `select public.finalize_bill($1, true)`, [id])
  const issued = await inbox(nina, 'bill_issued')
  assert.equal(issued.length, 1)
  assert.equal(issued[0].related_entity_id, ninaBill)
  assert.match(issued[0].message, /₱6,150\.00 is due on Oct 1, 2026\. Rent ₱6,000\.00 · Water ₱150\.00\./)
  // Bills are backdated for the reminder tests: "due soon" skips bills issued in the last day.
  await asAdmin(`update public.bills set created_at = '2026-10-01', finalized_at = '2026-10-01' where id in ($1, $2)`,
    [ninaBill, omarBill])
})
await test('opting out of payment updates silences them; essential notices still arrive', async () => {
  await as(omar, `insert into public.notification_preferences (user_id, payment_updates) values ($1, false)`, [omar])
  await rejects(as(omar, `insert into public.notification_preferences (user_id) values ($1)`, [nina]), /row-level security/)
  await on('2026-10-02', () => as(landlord, `select public.record_payment($1, 3150, 'cash', '2026-10-02')`, [omarBill]))
  assert.equal(await inboxCount(omar, 'payment_recorded'), 0)
  assert.equal(await inboxCount(omar, 'bill_issued'), 1)
})
await test('rent reminders: 3 days before, on the due date, and 3 days after, once each', async () => {
  assert.equal((await runJob('_send_rent_reminders', '2026-09-27'))[0].n, 0)
  await runJob('_send_rent_reminders', '2026-09-28')
  await runJob('_send_rent_reminders', '2026-09-29')
  const soon = await inbox(nina, 'rent_due_soon')
  assert.equal(soon.length, 1)
  assert.equal(soon[0].title, 'Rent due in 3 days')
  await runJob('_send_rent_reminders', '2026-10-01')
  await runJob('_send_rent_reminders', '2026-10-01')
  assert.equal(await inboxCount(nina, 'rent_due_today'), 1)
  assert.equal(await inboxCount(nina, 'rent_overdue'), 0)
})
await test('a cash payment notifies the tenant with the new balance; overdue uses it', async () => {
  await on('2026-10-09', () => as(landlord, `select public.record_payment($1, 1000, 'cash', '2026-10-09')`, [ninaBill]))
  const [rec] = await inbox(nina, 'payment_recorded')
  assert.equal(rec.title, 'Payment recorded')
  assert.match(rec.message, /cash payment of ₱1,000\.00.*Remaining balance: ₱5,150\.00/)
  assert.equal(rec.related_entity_type, 'bill')
  assert.equal(await inboxCount(landlord, 'payment_recorded'), 0) // the landlord did it
  await runJob('_send_rent_reminders', '2026-10-03')
  assert.equal(await inboxCount(nina, 'rent_overdue'), 0)
  await runJob('_send_rent_reminders', '2026-10-04')
  await runJob('_send_rent_reminders', '2026-10-05')
  const overdue = await inbox(nina, 'rent_overdue')
  assert.equal(overdue.length, 1)
  assert.match(overdue[0].message, /₱5,150\.00 is still unpaid/)
})
await test('paid bills get no reminders, and stale stages are not sent late', async () => {
  for (const day of ['2026-09-28', '2026-10-01', '2026-10-04']) await runJob('_send_rent_reminders', day)
  assert.equal(await inboxCount(omar, 'rent_due_soon') + await inboxCount(omar, 'rent_overdue'), 0)
  const before = await inboxCount(nina)
  await runJob('_send_rent_reminders', '2026-11-30')
  assert.equal(await inboxCount(nina), before)
})
await test('the landlord gets one daily summary of bills that became overdue', async () => {
  await runJob('_send_landlord_digests', '2026-10-02')
  await runJob('_send_landlord_digests', '2026-10-02')
  const n = await inbox(landlord, 'bills_overdue')
  assert.equal(n.length, 1)
  assert.match(n[0].message, /Room.*201/)
  assert.doesNotMatch(n[0].message, /202/) // Omar's bill is paid
  assert.equal(n[0].related_entity_type, 'billing')
})
await test('the landlord is told about move-ins happening today', async () => {
  await runJob('_send_landlord_digests', '2026-10-01')
  const n = (await inbox(landlord, 'move_in_today')).filter((x) => x.related_entity_id === nina)
  assert.equal(n.length, 1)
  assert.match(n[0].message, /Nina Reyes moves into Room 201/)
})

console.log('\nNotifications: online payments')
await test('a submitted payment notifies the landlord without the reference number', async () => {
  const [{ submit_payment: pid }] = await as(nina,
    `select public.submit_payment($1, 1000, 'gcash', public.property_today(), $2, 'GC-SECRET-77')`, [ninaBill, await proof(nina, 'n1.jpg')])
  const n = (await inbox(landlord, 'payment_submitted')).filter((x) => x.related_entity_id === pid)
  assert.equal(n.length, 1)
  assert.match(n[0].message, /Nina Reyes \(Room 201\) sent ₱1,000\.00 by GCash/)
  assert.doesNotMatch(n[0].message, /GC-SECRET-77/)
  assert.equal(await inboxCount(nina, 'payment_submitted'), 0)
  await as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [pid])
  const [ok] = await inbox(nina, 'payment_verified')
  assert.equal(ok.title, 'Payment confirmed')
  assert.match(ok.message, /Remaining balance: ₱4,150.00. It now shows in your bill/)
  assert.equal(await inboxCount(landlord, 'payment_verified'), 0)
})
await test('a rejected payment proof tells the tenant why', async () => {
  const [{ submit_payment: pid }] = await as(nina,
    `select public.submit_payment($1, 500, 'maya', public.property_today(), $2)`, [ninaBill, await proof(nina, 'n2.jpg')])
  await as(landlord, `select public.review_payment_confirmed($1, false, null, 'Screenshot is unreadable', false)`, [pid])
  const [n] = await inbox(nina, 'payment_rejected')
  assert.match(n.message, /not accepted: Screenshot is unreadable/)
})
await test('a failed payment changes nothing and sends nothing', async () => {
  const before = await inboxCount(landlord)
  await rejects(as(nina, `select public.submit_payment($1, 999999, 'gcash', public.property_today(), $2)`, [ninaBill, await proof(nina, 'n3.jpg')]), /exceeds/)
  assert.equal(await inboxCount(landlord), before)
})

console.log('\nNotifications: rental changes')
await test('a rent change notifies the tenant; a room move is one notice, not two', async () => {
  await as(landlord, `select public.update_lease_rent($1, 6500)`, [ninaLease])
  const [upd] = await inbox(nina, 'lease_updated')
  assert.match(upd.message, /now ₱6,500\.00/)
  await as(landlord, `select public.move_tenant($1, $2, '2026-11-01', 6500)`, [ninaLease, r203])
  const started = await inbox(nina, 'lease_started')
  assert.equal(started.length, 2)
  assert.equal(started[1].title, 'Moving to Room 203')
  assert.equal(await inboxCount(nina, 'lease_ended'), 0)
})
await test('voiding a bill tells the tenant once, without a separate rejection', async () => {
  await on('2026-11-01', () => as(landlord, `select public.generate_bills('2026-11-01')`))
  const [{ id: nov }] = await asAdmin(`select id from public.bills where tenant_id = $1 and period = '2026-11-01'`, [nina])
  await as(landlord, `select public.finalize_bill($1, true)`, [nov])
  await as(nina, `select public.submit_payment($1, 100, 'gcash', public.property_today(), $2)`, [nov, await proof(nina, 'n4.jpg')])
  const rejectedBefore = await inboxCount(nina, 'payment_rejected')
  await as(landlord, `select public.void_bill($1, 'Wrong rent amount')`, [nov])
  const voided = await inbox(nina, 'bill_voided')
  assert.equal(voided.length, 1)
  assert.match(voided[0].message, /cancelled: Wrong rent amount/)
  assert.equal(await inboxCount(nina, 'payment_rejected'), rejectedBefore)
})
await test('ending a tenancy notifies the tenant', async () => {
  const [{ id: lease }] = await asAdmin(`select id from public.leases where tenant_id = $1 and status = 'active'`, [nina])
  await as(landlord, `select public.end_lease($1, '2026-11-30')`, [lease])
  const [n] = await inbox(nina, 'lease_ended')
  assert.match(n.message, /Room 203 ends on Nov 30, 2026/)
})
await test('announcements reach portal tenants; tenants cannot send them', async () => {
  await rejects(as(nina, `select public.send_announcement('Water outage', 'No water on Saturday 9-12.')`), /Only the landlord/)
  await rejects(as(landlord, `select public.send_announcement('', 'x')`), /title/)
  const [{ send_announcement: sent }] = await as(landlord,
    `select public.send_announcement('Water outage', 'No water on Saturday from 9 AM to 12 NN.')`)
  assert.ok(sent >= 2)
  assert.equal(await inboxCount(nina, 'announcement'), 1)
  assert.equal(await inboxCount(landlord, 'announcement'), 0)
})

console.log('\nNotifications: security and reliability')
await test('users read only their own notifications; anonymous users nothing', async () => {
  const ids = (await asAdmin(`select recipient_user_id as r from public.notifications`)).map((x) => x.r)
  assert.ok(ids.includes(nina) && ids.includes(landlord))
  for (const user of [nina, omar, landlord]) {
    assert.ok((await inbox(user)).every((n) => n.recipient_user_id === user))
  }
  await rejects(as(null, `select 1 from public.notifications`), /permission denied/)
})
await test('clients cannot create, edit or delete notifications', async () => {
  await rejects(as(nina, `insert into public.notifications (recipient_user_id, type, category, title, message, deduplication_key)
    values ($1, 'announcement', 'rental', 'Fake', 'Fake', 'x')`, [landlord]), /permission denied/)
  await rejects(as(nina, `update public.notifications set is_read = true`), /permission denied/)
  await rejects(as(nina, `delete from public.notifications`), /permission denied/)
  await rejects(as(nina, `select public._notify($1, 'announcement', 'Fake', 'Fake', null, null, 'k')`, [landlord]), /permission denied/)
  await rejects(as(landlord, `select public.run_notification_jobs()`), /permission denied/)
})
await test('mark as read and mark all as read touch only the caller\'s rows', async () => {
  const [first, second] = await inbox(nina)
  const [{ mark_notifications_read: none }] = await as(landlord, `select public.mark_notifications_read($1)`, [[first.id]])
  assert.equal(none, 0)
  const [{ mark_notifications_read: one }] = await as(nina, `select public.mark_notifications_read($1)`, [[first.id]])
  assert.equal(one, 1)
  const [r] = await as(nina, `select is_read, read_at from public.notifications where id = $1`, [first.id])
  assert.equal(r.is_read, true)
  assert.ok(r.read_at)
  assert.equal((await as(nina, `select is_read from public.notifications where id = $1`, [second.id]))[0].is_read, false)
  const landlordUnread = (await as(landlord, `select 1 from public.notifications where not is_read`)).length
  await as(nina, `select public.mark_all_notifications_read()`)
  assert.equal((await as(nina, `select 1 from public.notifications where not is_read`)).length, 0)
  assert.equal((await as(landlord, `select 1 from public.notifications where not is_read`)).length, landlordUnread)
})
await test('duplicates are impossible and notices never reach the wrong audience', async () => {
  const send = (user, type, key) =>
    asSystem(`select public._notify($1, $2, 'T', 'M', null, null, $3) as id`, [user, type, key])
  assert.ok((await send(nina, 'announcement', 'dup-test'))[0].id)
  assert.equal((await send(nina, 'announcement', 'dup-test'))[0].id, null)
  assert.equal((await send(nina, 'payment_submitted', 'aud-1'))[0].id, null)
  assert.equal((await send(landlord, 'rent_overdue', 'aud-2'))[0].id, null)
  await rejects(asAdmin(`insert into public.notifications (recipient_user_id, type, category, title, message, deduplication_key)
    values ($1, 'announcement', 'rental', 'T', 'M', 'dup-test')`, [nina]), /duplicate key/)
})
await test('a failed scheduled billing run tells the landlord once and creates nothing', async () => {
  const [{ create_manual_tenant: tenant }] = await as(landlord, `select public.create_manual_tenant('Scheduled billing test')`)
  await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01', 2000)`,
    [tenant, await roomId('114')])
  await db.exec(`create function public._test_fail() returns trigger language plpgsql as $$
    begin raise exception 'disk full'; end $$;
    create trigger test_fail before insert on public.bills for each row execute function public._test_fail();`)
  try {
    assert.equal((await asSystem(`select public.run_scheduled_billing() as n`))[0].n, 0)
    await asSystem(`select public.run_scheduled_billing()`)
  } finally {
    await db.exec(`drop trigger test_fail on public.bills; drop function public._test_fail();`)
  }
  const n = await inbox(landlord, 'billing_failed')
  assert.equal(n.length, 1)
  assert.equal(n[0].category, 'system')
  assert.match(n[0].message, /disk full/)
})
await test('the hourly job runs end to end and is idempotent', async () => {
  await asSystem(`select public.run_notification_jobs()`)
  const before = (await asAdmin(`select count(*)::int as n from public.notifications`))[0].n
  await asSystem(`select public.run_notification_jobs()`)
  const after = (await asAdmin(`select count(*)::int as n from public.notifications`))[0].n
  assert.equal(after, before)
})
await test('retention removes old read notices and keeps unread ones', async () => {
  const [a, b] = await inbox(omar)
  await asAdmin(`update public.notifications set created_at = now() - interval '120 days' where id in ($1, $2)`, [a.id, b.id])
  await as(omar, `select public.mark_notifications_read($1)`, [[a.id]])
  await asSystem(`select public.run_notification_jobs()`)
  const left = (await inbox(omar)).map((n) => n.id)
  assert.ok(!left.includes(a.id))
  assert.ok(left.includes(b.id))
})
await test('the landlord sets the reminder schedule; tenants cannot', async () => {
  await as(landlord, `update public.app_settings set reminder_days_before = 5, reminder_days_after = 2`)
  await rejects(as(landlord, `update public.app_settings set reminder_days_before = 40`), /check constraint/)
  await as(nina, `update public.app_settings set reminder_days_before = 1`)
  const [s] = await asAdmin(`select reminder_days_before from public.app_settings`)
  assert.equal(s.reminder_days_before, 5)
})

// --- Unified monthly billing and collections ------------------------------------------------
// Runs last so the provider-payment notices do not disturb the notification counts above.
const FEB = '2027-02-01'
// This part of the story happens in February 2027.
baseToday = '2027-02-15'
await setToday(baseToday)
const paz = await invite('paz@example.com', 'Paz Lim')
const quinn = await invite('quinn@example.com', 'Quinn Tan')
const r211 = await roomId('211')
const r212 = await roomId('212')
let pazBill, quinnBill, pazLease
/** What a bill's lines have collected so far, by kind. */
const paidByKind = async (billId) => {
  const [b] = await as(landlord, `select rent_paid, electricity_paid, water_paid, other_paid, amount_paid, balance, status
                                  from public.bill_overview where id = $1`, [billId])
  return {
    rent: num(b.rent_paid), electricity: num(b.electricity_paid), water: num(b.water_paid), other: num(b.other_paid),
    paid: num(b.amount_paid), balance: num(b.balance), status: b.status,
  }
}

console.log('\nUnified billing: complete and partial payments')
await test('one consolidated bill per tenant: rent, electricity, water and extra charges', async () => {
  ;[{ assign_tenant: pazLease }] = await as(landlord, `select public.assign_tenant($1, $2, '2027-01-15', 5000, 3000)`, [paz, r211])
  await as(landlord, `select public.assign_tenant($1, $2, '2027-01-15', 4000)`, [quinn, r212])
  await as(landlord, `select public.record_meter_readings($1, $2)`, [FEB, JSON.stringify([
    { room_id: r211, electricity_previous: 0, electricity_current: 100, water_previous: 0, water_current: 10 },
    { room_id: r212, electricity_previous: 0, electricity_current: 50, water_previous: 0, water_current: 4 },
  ])])
  await as(landlord, `select public.generate_bills($1)`, [FEB])
  ;[{ id: pazBill }] = await asAdmin(`select id from public.bills where tenant_id = $1 and period = $2`, [paz, FEB])
  ;[{ id: quinnBill }] = await asAdmin(`select id from public.bills where tenant_id = $1 and period = $2`, [quinn, FEB])
  await as(landlord, `select public.add_bill_charge($1, 'Parking', 200)`, [pazBill])
  await as(landlord, `select public.finalize_bill($1)`, [pazBill])
  await as(landlord, `select public.finalize_bill($1)`, [quinnBill])
  assert.equal(num((await bill(pazBill)).total_amount), 5000 + 1200 + 150 + 200)
  assert.equal(num((await bill(quinnBill)).total_amount), 4000 + 600 + 150)
  const mine = await as(paz, `select id from public.bill_overview where period = $1`, [FEB])
  assert.deepEqual(mine.map((b) => b.id), [pazBill])
  // Still one bill per tenancy per month.
  assert.equal((await as(landlord, `select public.generate_bills($1) as n`, [FEB]))[0].n, 0)
})
await test('partial payments are allocated electricity, then water, then extra charges, then rent', async () => {
  await on('2027-02-02', () => as(landlord, `select public.record_payment($1, 1000, 'cash', '2027-02-02')`, [pazBill]))
  assert.deepEqual(await paidByKind(pazBill),
    { rent: 0, electricity: 1000, water: 0, other: 0, paid: 1000, balance: 5550, status: 'partial' })
  const [{ submit_payment: pid }] = await as(paz,
    `select public.submit_payment($1, 800, 'gcash', public.property_today(), $2, 'GC-PAZ-1')`, [pazBill, await proof(paz, 'paz1.jpg')])
  // Pending payments are not allocated and do not reduce anything.
  assert.equal((await asAdmin(`select 1 from public.payment_allocations where payment_id = $1`, [pid])).length, 0)
  await as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [pid])
  assert.deepEqual(await paidByKind(pazBill),
    { rent: 250, electricity: 1200, water: 150, other: 200, paid: 1800, balance: 4750, status: 'partial' })
  const split = await asAdmin(`select kind, amount from public.payment_allocations where payment_id = $1 order by amount`, [pid])
  assert.deepEqual(split.map((a) => [a.kind, num(a.amount)]),
    [['water', 150], ['electricity', 200], ['other', 200], ['rent', 250]])
})
await test('a payment completing the bill clears every line and marks it paid', async () => {
  await on('2027-02-05', () => as(landlord, `select public.record_payment($1, 4750, 'cash', '2027-02-05')`, [pazBill]))
  assert.deepEqual(await paidByKind(pazBill),
    { rent: 5000, electricity: 1200, water: 150, other: 200, paid: 6550, balance: 0, status: 'paid' })
  await rejects(as(landlord, `select public.record_payment($1, 1, 'cash', '2027-02-05')`, [pazBill]), /exceeds/)
})
await test('collections by category always add up to what was paid', async () => {
  const bad = await asAdmin(`
    select b.id from public.bill_overview b
    where b.status <> 'void' and b.rent_paid + b.electricity_paid + b.water_paid + b.other_paid <> b.amount_paid
    union all
    select p.id from public.payments p
    where p.status = 'verified'
      and p.amount <> (select coalesce(sum(a.amount), 0) from public.payment_allocations a where a.payment_id = p.id)
    union all
    select i.id from public.bill_items i
    where i.amount < (select coalesce(sum(a.amount), 0) from public.payment_allocations a where a.bill_item_id = i.id)`)
  assert.deepEqual(bad, [])
})
await test('verified payments and allocations are permanent', async () => {
  const [{ id }] = await asAdmin(`select id from public.payments where bill_id = $1 and status = 'verified' limit 1`, [pazBill])
  await rejects(asAdmin(`update public.payments set amount = 1 where id = $1`, [id]), /cannot be changed/)
  await rejects(asAdmin(`update public.payments set status = 'rejected', rejection_reason = 'x' where id = $1`, [id]), /cannot be changed/)
  await rejects(asAdmin(`delete from public.payment_allocations where payment_id = $1`, [id]), /permanent/)
  await rejects(asAdmin(`update public.payment_allocations set amount = 1 where payment_id = $1`, [id]), /permanent/)
  await rejects(as(landlord, `delete from public.payment_allocations`), /permission denied/)
  await rejects(as(landlord, `select public.void_bill($1, 'oops')`, [pazBill]), /cannot be voided/)
})

console.log('\nUnified billing: receipts')
await test('each verified payment gets one receipt with the charge breakdown', async () => {
  const pays = await asAdmin(`select id, receipt_number from public.payments where bill_id = $1 and status = 'verified'
                              order by receipt_number`, [pazBill])
  assert.equal(pays.length, 3)
  assert.ok(pays.every((p, i) => i === 0 || Number(p.receipt_number) > Number(pays[i - 1].receipt_number)))
  const [{ r }] = await as(paz, `select public.payment_receipt($1) as r`, [pays[1].id])
  assert.equal(r.receipt_number, Number(pays[1].receipt_number))
  assert.equal(r.payment.amount, 800)
  assert.equal(r.tenant_name, 'Paz Lim')
  assert.equal(r.room_number, '211')
  assert.equal(r.balance_before, 5550)
  assert.equal(r.balance_after, 4750)
  const lines = Object.fromEntries(r.lines.map((l) => [l.kind, [l.amount, l.paid_before, l.applied, l.remaining]]))
  assert.deepEqual(lines, {
    rent: [5000, 0, 250, 4750],
    electricity: [1200, 1000, 200, 0],
    water: [150, 0, 150, 0],
    other: [200, 0, 200, 0],
  })
  const [{ r: last }] = await as(landlord, `select public.payment_receipt($1) as r`, [pays[2].id])
  assert.equal(last.balance_after, 0)
})
await test('receipts are private and only exist for verified payments', async () => {
  const [{ id }] = await asAdmin(`select id from public.payments where bill_id = $1 and status = 'verified' limit 1`, [pazBill])
  assert.equal((await as(quinn, `select public.payment_receipt($1) as r`, [id]))[0].r, null)
  await rejects(as(null, `select public.payment_receipt($1)`, [id]), /permission denied/)
  const [{ id: rejected }] = await asAdmin(`select id from public.payments where status = 'rejected' limit 1`)
  assert.equal((await as(landlord, `select public.payment_receipt($1) as r`, [rejected]))[0].r, null)
})

console.log('\nUnified billing: duplicates and overdue balances')
await test('a resubmitted payment request is recorded once', async () => {
  const req = '11111111-1111-4111-8111-111111111111'
  const file = await proof(quinn, 'q1.jpg')
  const submit = () => as(quinn, `select public.submit_payment($1, 500, 'gcash', public.property_today(), $2, null, null, $3) as id`,
    [quinnBill, file, req])
  const [{ id: first }] = await submit()
  const [{ id: again }] = await submit()
  assert.equal(again, first)
  assert.equal((await asAdmin(`select count(*)::int as n from public.payments where client_request_id = $1`, [req]))[0].n, 1)
  // Another tenant reusing the request id gets nothing of Quinn's.
  await rejects(as(paz, `select public.submit_payment($1, 500, 'gcash', public.property_today(), $2, null, null, $3)`,
    [quinnBill, file, req]), /Bill not found/)
  await as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [first])
  const cash = '22222222-2222-4222-8222-222222222222'
  const record = () => on('2027-02-04', () => as(landlord, `select public.record_payment($1, 220, 'cash', '2027-02-04', null, null, null, $2) as id`,
    [quinnBill, cash]))
  const [{ id: c1 }] = await record()
  const [{ id: c2 }] = await record()
  assert.equal(c1, c2)
  assert.deepEqual(await paidByKind(quinnBill),
    { rent: 0, electricity: 600, water: 120, other: 0, paid: 720, balance: 4030, status: 'partial' })
})
await test('tenants cannot submit more than is owed once pending payments are counted', async () => {
  const [{ submit_payment: pid }] = await as(quinn,
    `select public.submit_payment($1, 3000, 'maya', public.property_today(), $2)`, [quinnBill, await proof(quinn, 'q2.jpg')])
  await rejects(as(quinn, `select public.submit_payment($1, 1500, 'maya', public.property_today(), $2)`,
    [quinnBill, await proof(quinn, 'q3.jpg')]), /awaiting verification/)
  await as(landlord, `select public.review_payment_confirmed($1, false, null, 'Amount not received', false)`, [pid])
})
await test('an unpaid balance becomes overdue after the due date and keeps its remaining amount', async () => {
  await setToday('2027-02-20')
  try {
    const rows = await as(landlord, `select tenant_id, status, is_overdue, balance from public.bill_overview
                                     where period = $1 and tenant_id in ($2, $3)`, [FEB, paz, quinn])
    const q = rows.find((b) => b.tenant_id === quinn)
    const p = rows.find((b) => b.tenant_id === paz)
    assert.deepEqual({ status: q.status, overdue: q.is_overdue, balance: num(q.balance) }, { status: 'partial', overdue: true, balance: 4030 })
    assert.equal(p.is_overdue, false)
    // Tenants see their own overdue flag; drafts are never overdue.
    assert.equal((await as(quinn, `select is_overdue from public.bill_overview where period = $1`, [FEB]))[0].is_overdue, true)
    const drafts = await as(landlord, `select 1 from public.bill_overview where not is_finalized and is_overdue`)
    assert.equal(drafts.length, 0)
  } finally {
    await setToday(baseToday)
  }
  await runJob('_send_rent_reminders', '2027-02-18')
  const [n] = await inbox(quinn, 'rent_overdue')
  assert.match(n.message, /February 2027 bill .* ₱4,030\.00 is still unpaid/)
  assert.equal(await inboxCount(paz, 'rent_overdue'), 0)
})
await test('draft bills do not count toward outstanding balances', async () => {
  const before = await as(landlord, `select outstanding_balance from public.tenant_overview where id = $1`, [quinn])
  await on('2027-03-01', () => as(landlord, `select public.generate_bills('2027-03-01')`))
  const after = await as(landlord, `select outstanding_balance from public.tenant_overview where id = $1`, [quinn])
  assert.equal(num(after[0].outstanding_balance), num(before[0].outstanding_balance))
  assert.equal(num(before[0].outstanding_balance), 4030)
  const [room] = await as(landlord, `select outstanding_balance from public.room_overview where id = $1`, [r212])
  assert.equal(num(room.outstanding_balance), 4030)
})

console.log('\nUnified billing: online payments')
let checkoutId
await test('online payments are off until the landlord enables them', async () => {
  await rejects(as(quinn, `select public.start_online_payment($1, 1000)`, [quinnBill]), /not available/)
  await as(quinn, `update public.app_settings set online_payments_enabled = true`)
  await as(landlord, `update public.app_settings set online_payments_enabled = true`)
  const [s] = await asAdmin(`select online_payments_enabled from public.app_settings`)
  assert.equal(s.online_payments_enabled, true)
})
await test('one checkout per bill: a double tap returns the same checkout', async () => {
  ;[{ id: checkoutId }] = await as(quinn, `select (public.start_online_payment($1, 1000)).id`, [quinnBill])
  const [{ id: again }] = await as(quinn, `select (public.start_online_payment($1, 1000)).id`, [quinnBill])
  assert.equal(again, checkoutId)
  await rejects(as(quinn, `select public.start_online_payment($1, 1500)`, [quinnBill]), /already started/)
  await rejects(as(paz, `select public.start_online_payment($1, 1000)`, [quinnBill]), /Bill not found/)
  await rejects(as(quinn, `select public.start_online_payment($1, 999999)`, [pazBill]), /Bill not found/)
  const [opened] = await asSystem(`select * from public._attach_checkout_session($1, 'cs_test_1', 'https://checkout.paymongo.com/cs_test_1')`,
    [checkoutId])
  assert.equal(opened.status, 'open')
  const [{ checkout_url: url }] = await as(quinn, `select checkout_url from public.payment_checkouts where id = $1`, [checkoutId])
  assert.equal(url, 'https://checkout.paymongo.com/cs_test_1')
})
await test('only the payment provider (service role) can confirm a payment', async () => {
  for (const user of [quinn, landlord]) {
    await rejects(as(user, `select public._confirm_provider_payment('paymongo', 'cs_test_1', 'pay_x', 1000, 'gcash', public.property_today())`),
      /permission denied/)
    await rejects(as(user, `select public._attach_checkout_session($1, 'cs_evil', 'https://evil.example')`, [checkoutId]),
      /permission denied/)
  }
  await rejects(as(quinn, `insert into public.payment_checkouts (bill_id, tenant_id, amount, currency_code, created_by, status)
    values ($1, $2, 1, 'PHP', $2, 'paid')`, [quinnBill, quinn]), /permission denied/)
  await rejects(as(quinn, `update public.payment_checkouts set status = 'paid'`), /permission denied/)
})
await test('a provider-confirmed payment is verified, allocated and receipted exactly once', async () => {
  const confirm = () => asSystem(
    `select public._confirm_provider_payment('paymongo', 'cs_test_1', 'pay_1', 1000, 'gcash', '2027-02-21') as id`)
  const [{ id }] = await confirm()
  const [{ id: replay }] = await confirm()
  assert.equal(replay, id)
  const [p] = await asAdmin(`select status, provider, receipt_number, reviewed_by from public.payments where id = $1`, [id])
  assert.equal(p.status, 'verified')
  assert.equal(p.provider, 'paymongo')
  assert.ok(p.receipt_number)
  assert.equal(p.reviewed_by, null)
  assert.equal((await asAdmin(`select count(*)::int as n from public.payments where provider_payment_id = 'pay_1'`))[0].n, 1)
  assert.deepEqual(await paidByKind(quinnBill),
    { rent: 970, electricity: 600, water: 150, other: 0, paid: 1720, balance: 3030, status: 'partial' })
  const [c] = await asAdmin(`select status, payment_id from public.payment_checkouts where id = $1`, [checkoutId])
  assert.deepEqual(c, { status: 'paid', payment_id: id })
  const mine = (await inbox(quinn, 'payment_verified')).at(-1)
  assert.equal(mine.title, 'Payment received')
  assert.match(mine.message, /online payment of ₱1,000\.00 by GCash .* Remaining balance: ₱3,030\.00/)
  const forLandlord = (await inbox(landlord, 'payment_verified')).filter((n) => n.related_entity_id === id)
  assert.equal(forLandlord.length, 1)
  assert.equal(forLandlord[0].title, 'Online payment received')
  const [{ r }] = await as(quinn, `select public.payment_receipt($1) as r`, [id])
  assert.equal(r.payment.provider, 'paymongo')
  assert.equal(r.balance_after, 3030)
})
await test('cancelled or expired checkouts free the bill for a new one', async () => {
  const [{ id: a }] = await as(quinn, `select (public.start_online_payment($1, 3000)).id`, [quinnBill])
  await rejects(as(paz, `select public.cancel_online_payment($1)`, [a]), /not found/)
  const [cancelled] = await as(quinn, `select * from public.cancel_online_payment($1)`, [a])
  assert.equal(cancelled.status, 'cancelled')
  const [{ id: b }] = await as(quinn, `select (public.start_online_payment($1, 2000)).id`, [quinnBill])
  await asSystem(`select public._attach_checkout_session($1, 'cs_test_2', 'https://checkout.paymongo.com/cs_test_2')`, [b])
  await asAdmin(`update public.payment_checkouts set expires_at = now() - interval '1 minute' where id = $1`, [b])
  const [{ id: c }] = await as(quinn, `select (public.start_online_payment($1, 3000)).id`, [quinnBill])
  assert.notEqual(c, b)
  assert.equal((await asAdmin(`select status from public.payment_checkouts where id = $1`, [b]))[0].status, 'expired')
  await asSystem(`select public._attach_checkout_session($1, 'cs_test_3', 'https://checkout.paymongo.com/cs_test_3')`, [c])
  await rejects(as(landlord, `select public.reopen_bill($1)`, [quinnBill]), /has payments/)
})
await test('money that cannot be applied as-is waits for the landlord instead', async () => {
  // Quinn pays the rest in cash, then the abandoned online checkout completes after all.
  await on('2027-02-22', () => as(landlord, `select public.record_payment($1, 3030, 'cash', '2027-02-22')`, [quinnBill]))
  assert.equal((await bill(quinnBill)).status, 'paid')
  const [{ id }] = await asSystem(
    `select public._confirm_provider_payment('paymongo', 'cs_test_2', 'pay_2', 2000, 'maya', '2027-02-22') as id`)
  const [p] = await asAdmin(`select status, notes from public.payments where id = $1`, [id])
  assert.equal(p.status, 'pending')
  assert.match(p.notes, /more than the remaining balance of ₱0\.00/)
  assert.equal(num((await bill(quinnBill)).amount_paid), 4750)
  const [n] = (await inbox(landlord, 'payment_submitted')).filter((x) => x.related_entity_id === id)
  assert.match(n.message, /Quinn Tan \(Room 212\) paid ₱2,000\.00 by Maya .* refund the rest/)
  await rejects(as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [id]), /exceeds/)
  await as(landlord, `select public.review_payment_confirmed($1, false, null, 'Refunded to your Maya account', false)`, [id])
  await asSystem(`select public._confirm_provider_payment('paymongo', 'cs_test_2', 'pay_2', 2000, 'maya', '2027-02-22')`)
  assert.equal((await asAdmin(`select count(*)::int as n from public.payments where provider_payment_id = 'pay_2'`))[0].n, 1)
})

console.log('\nUnified billing: access control and deposits')
await test('tenants see only their own allocations and checkouts', async () => {
  const own = await as(quinn, `select distinct bill_id from public.payment_allocations`)
  assert.deepEqual(own.map((a) => a.bill_id), [quinnBill])
  assert.ok((await as(quinn, `select tenant_id from public.payment_checkouts`)).every((c) => c.tenant_id === quinn))
  assert.equal((await as(paz, `select 1 from public.payment_checkouts`)).length, 0)
  await rejects(as(quinn, `insert into public.payment_allocations (payment_id, bill_id, bill_item_id, kind, amount)
    select payment_id, bill_id, bill_item_id, kind, 1 from public.payment_allocations limit 1`), /permission denied/)
  await rejects(as(null, `select 1 from public.payment_allocations`), /permission denied/)
  await rejects(as(null, `select public.start_online_payment(gen_random_uuid(), 1)`), /permission denied/)
})
await test('tenants cannot finalize, reopen or bulk-finalize bills', async () => {
  await on('2027-03-15', () => as(landlord, `select public.generate_bills('2027-03-01')`))
  const [{ id: draft }] = await asAdmin(`select id from public.bills where tenant_id = $1 and period = '2027-03-01'`, [quinn])
  await rejects(as(quinn, `select public.finalize_bill($1, true)`, [draft]), /Only the landlord/)
  await rejects(as(quinn, `select public.finalize_bills('2027-03-01')`), /Only the landlord/)
  await rejects(as(quinn, `select public.reopen_bill($1)`, [quinnBill]), /Only the landlord/)
  await rejects(as(quinn, `update public.bills set finalized_at = now() where id = $1`, [draft]), /permission denied/)
  assert.equal((await bill(draft)).finalized_at, null)
})
await test('a suspended tenant cannot start an online payment', async () => {
  await as(landlord, `select public.set_portal_suspended($1, true, 'Account review')`, [paz])
  try {
    await rejects(as(paz, `select public.start_online_payment($1, 100)`, [pazBill]), /not active/)
  } finally {
    await as(landlord, `select public.set_portal_suspended($1, false)`, [paz])
  }
})
await test('deposits stay out of bill collections', async () => {
  const [d] = await as(paz, `select balance from public.deposit_balances`)
  assert.equal(num(d.balance), 3000)
  const [{ collected }] = await as(landlord, `select sum(rent_paid + electricity_paid + water_paid + other_paid) as collected
                                              from public.bill_overview where tenant_id = $1`, [paz])
  const [{ paid }] = await asAdmin(`select sum(amount) as paid from public.payments where tenant_id = $1 and status = 'verified'`, [paz])
  assert.equal(num(collected), 6550)
  assert.equal(num(paid), 6550)
  await rejects(as(landlord, `select public.record_payment($1, 1, 'cash', public.property_today())`, [pazLease]), /Bill not found/)
})

// --- Validation hardening (still February 2027) ----------------------------------------
const iso = (d) => d.toISOString().slice(0, 10)
const r208 = await roomId('208')
const r209 = await roomId('209')
const r213 = await roomId('213')
const r214 = await roomId('214')
const vera = await invite('vera@example.com', "María José dela Cruz-O'Neil")
const [{ id: wes }] = await as(landlord, `select public.create_manual_tenant('Wes Tan') as id`)
const [{ id: vLease }] = await as(landlord, `select public.assign_tenant($1, $2, '2027-01-10', 3000) as id`, [vera, r208])
const JAN = '2027-01-01'
const veraBill = async (period) =>
  (await asAdmin(`select id from public.bills where lease_id = $1 and period = $2 and status <> 'void'`, [vLease, period]))[0]?.id

console.log('\nValidation: names and phone numbers')
await test('names keep accents, spaces, hyphens and apostrophes; blank names are refused', async () => {
  const [p] = await asAdmin(`select full_name from public.profiles where id = $1`, [vera])
  assert.equal(p.full_name, "María José dela Cruz-O'Neil")
  await rejects(as(vera, `update public.profiles set full_name = '   ' where id = $1`, [vera]), /Enter a full name/)
  await rejects(as(landlord, `update public.profiles set full_name = '' where id = $1`, [vera]), /Enter a full name/)
  await rejects(as(landlord, `select public.create_manual_tenant('   ')`), /Enter the tenant name/)
  // Two people may share a name.
  const [{ id: a }] = await as(landlord, `select public.create_manual_tenant('Juan Santos') as id`)
  const [{ id: b }] = await as(landlord, `select public.create_manual_tenant('Juan Santos') as id`)
  assert.notEqual(a, b)
  await as(vera, `update public.profiles set full_name = '  Vera Cruz  ' where id = $1`, [vera])
  assert.equal((await asAdmin(`select full_name from public.profiles where id = $1`, [vera]))[0].full_name, 'Vera Cruz')
})
await test('phone numbers must be a Philippine or international number', async () => {
  for (const ok of ['0917 123 4567', '+63 917 123 4567', '639171234567', '(02) 8123 4567', '(032) 123-4567', '+1 415 555 0100']) {
    await as(vera, `update public.profiles set phone = $2 where id = $1`, [vera, ok])
  }
  for (const bad of ['call me maybe', '1-----', '0917', '12345678901234567', '+0 123']) {
    await rejects(as(vera, `update public.profiles set phone = $2 where id = $1`, [vera, bad]), /valid phone/)
  }
  await rejects(as(landlord, `update public.profiles set emergency_contact_phone = 'n/a' where id = $1`, [vera]), /valid emergency/)
  await rejects(as(landlord, `select public.create_manual_tenant('Pia Lim', 'abc')`), /valid phone/)
  // A value saved before this rule never blocks an unrelated edit.
  await asAdmin(`set session_replication_role = replica`)
  await asAdmin(`update public.profiles set phone = 'legacy' where id = $1`, [vera])
  await asAdmin(`set session_replication_role = origin`)
  await as(vera, `update public.profiles set emergency_contact_name = 'Mother' where id = $1`, [vera])
  await as(vera, `update public.profiles set phone = null where id = $1`, [vera])
})
await test('approving a nameless registration needs an existing record; bad phone claims are dropped', async () => {
  const nameless = await createUser('nameless@example.com', {})
  const [{ id: r1 }] = await asAdmin(`select id from public.registration_requests where user_id = $1`, [nameless])
  await rejects(as(landlord, `select public.approve_registration($1, null, 'in_person', 'Checked ID')`, [r1]), /did not give a name/)
  const yna = await createUser('yna@example.com', { full_name: 'Yna Reyes', phone: 'not a phone' })
  const [{ id: r2 }] = await asAdmin(`select id from public.registration_requests where user_id = $1`, [yna])
  await as(landlord, `select public.approve_registration($1, null, 'in_person', 'Checked ID')`, [r2])
  const [p] = await asAdmin(`select full_name, phone from public.profiles where user_id = $1`, [yna])
  assert.deepEqual(p, { full_name: 'Yna Reyes', phone: null })
})

console.log('\nValidation: amounts')
await test('NaN is refused for every amount, rate and reading', async () => {
  await rejects(as(landlord, `update public.rooms set monthly_rent = 'NaN' where id = $1`, [r213]), /not_nan/)
  await rejects(as(landlord, `update public.app_settings set electricity_rate = 'NaN'`), /not_nan/)
  await rejects(as(landlord, `select public.update_lease_rent($1, 'NaN')`, [vLease]), /not_nan/)
  await rejects(as(landlord, `select public.add_bill_charge($1, 'Fee', 'NaN')`, [quinnBill]), /greater than zero/)
  await rejects(as(landlord, `select public.record_payment($1, 'NaN', 'cash', public.property_today())`, [quinnBill]), /greater than zero/)
  await rejects(as(landlord, `select public.record_meter_readings($1, $2)`,
    [JAN, JSON.stringify([{ room_id: r213, electricity_current: 'NaN' }])]), /must be a number/)
  const [{ n }] = await asAdmin(`select count(*)::int as n from public.bills where total_amount = 'NaN' or amount_paid = 'NaN'`)
  assert.equal(n, 0)
})
await test('negative and zero amounts are refused', async () => {
  await rejects(as(landlord, `select public.assign_tenant($1, $2, '2027-02-01', 3000, -500)`, [wes, r209]), /deposit cannot be negative/)
  await rejects(as(landlord, `select public.assign_tenant($1, $2, '2027-02-01', -1)`, [wes, r209]), /Rent cannot be negative/)
  await rejects(as(landlord, `update public.rooms set monthly_rent = -1 where id = $1`, [r213]), /check constraint/)
  await rejects(as(landlord, `update public.app_settings set water_rate = -0.01`), /check constraint/)
  await rejects(as(landlord, `select public.record_payment($1, 0, 'cash', public.property_today())`, [quinnBill]), /greater than zero/)
  await rejects(as(landlord, `select public.record_payment($1, -5, 'cash', public.property_today())`, [quinnBill]), /greater than zero/)
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'received', -1, public.property_today())`, [vLease]), /greater than zero/)
  await rejects(as(landlord, `select public.add_bill_charge($1, '   ', 50)`, [quinnBill]), /Describe the charge/)
})

console.log('\nValidation: meter readings')
await test('readings must be non-negative numbers', async () => {
  const save = (row) => as(landlord, `select public.record_meter_readings($1, $2)`, [JAN, JSON.stringify([{ room_id: r208, ...row }])])
  await rejects(save({ electricity_current: -1 }), /cannot be negative/)
  await rejects(save({ electricity_current: 'abc' }), /must be a number/)
  await rejects(save({ water_current: true }), /must be a number/)
  await rejects(as(landlord, `select public.record_meter_readings($1, '[{"room_id": "not-a-room"}]')`, [JAN]), /Unknown room/)
})
await test('clearing a reading removes its charge from the draft bill', async () => {
  await as(landlord, `select public.generate_bills($1)`, [JAN])
  const id = await veraBill(JAN)
  const elec = async () => asAdmin(`select amount from public.bill_items where bill_id = $1 and kind = 'electricity'`, [id])
  await as(landlord, `select public.record_meter_readings($1, $2)`,
    [JAN, JSON.stringify([{ room_id: r208, electricity_previous: 100, electricity_current: 150 }])])
  assert.equal((await elec()).length, 1)
  await as(landlord, `select public.record_meter_readings($1, $2)`,
    [JAN, JSON.stringify([{ room_id: r208, electricity_previous: 100, electricity_current: null }])])
  assert.equal((await elec()).length, 0)
  const [b] = await as(landlord, `select missing_charges from public.bill_overview where id = $1`, [id])
  assert.ok(b.missing_charges.includes('electricity'))
})
await test("a reading cannot pass the next month's starting reading", async () => {
  await as(landlord, `select public.record_meter_readings($1, $2)`,
    [FEB, JSON.stringify([{ room_id: r208, electricity_previous: 150, electricity_current: 200, water_previous: 0, water_current: 5 }])])
  await rejects(as(landlord, `select public.record_meter_readings($1, $2)`,
    [JAN, JSON.stringify([{ room_id: r208, electricity_previous: 100, electricity_current: 180 }])]),
  /higher than the February 2027 reading starts from \(150\.00\)/)
  await as(landlord, `select public.record_meter_readings($1, $2)`,
    [JAN, JSON.stringify([{ room_id: r208, electricity_previous: 100, electricity_current: 140, water_previous: 0, water_current: 0 }])])
  // Lower than its own previous reading is still refused.
  await rejects(as(landlord, `select public.record_meter_readings($1, $2)`,
    [FEB, JSON.stringify([{ room_id: r208, electricity_previous: 150, electricity_current: 149 }])]), /lower than previous/)
})

console.log('\nValidation: billing periods and tenancies')
await test('bills cannot be generated for a month that has not started', async () => {
  await rejects(as(landlord, `select public.generate_bills('2027-03-01')`), /March 2027 has not started yet/)
  await rejects(as(landlord, `select public.generate_bills('2031-01-01')`), /has not started yet/)
  // Any date in a month means that month.
  await on('2027-02-17', () => as(landlord, `select public.generate_bills('2027-02-17')`))
  assert.ok(await veraBill(FEB))
  assert.equal((await as(landlord, `select public.generate_bills($1) as n`, [FEB]))[0].n, 0)
})
await test('a room and a tenant hold one tenancy at a time, even with a future move-out date', async () => {
  const [{ id: wl }] = await as(landlord, `select public.assign_tenant($1, $2, '2027-01-01', 3000) as id`, [wes, r209])
  await as(landlord, `select public.end_lease($1, '2027-03-15')`, [wl])
  const [{ id: xen }] = await as(landlord, `select public.create_manual_tenant('Xen Ramos') as id`)
  await rejects(as(landlord, `select public.assign_tenant($1, $2, '2027-03-01', 3000)`, [xen, r209]), /occupied until March 15, 2027/)
  await rejects(as(landlord, `select public.assign_tenant($1, $2, '2027-02-01', 3000)`, [wes, r214]), /tenant already has a tenancy that overlaps/)
  // A same-day handover is fine.
  await as(landlord, `select public.assign_tenant($1, $2, '2027-03-15', 3000)`, [xen, r209])
  const [{ n }] = await asAdmin(`select count(*)::int as n from public.leases where room_id = $1`, [r209])
  assert.equal(n, 2)
})
await test('a tenancy cannot end before a month the tenant was already sent a bill for', async () => {
  await as(landlord, `select public.finalize_bill($1, true)`, [await veraBill(JAN)])
  const febBill = await veraBill(FEB)
  await on('2027-02-17', () => as(landlord, `select public.finalize_bill($1, true)`, [febBill]))
  await rejects(as(landlord, `select public.end_lease($1, '2027-01-20')`, [vLease]), /already has a February 2027 bill/)
  const [l] = await asAdmin(`select status from public.leases where id = $1`, [vLease])
  assert.equal(l.status, 'active')
})

console.log('\nValidation: payment and deposit dates')
await test('payment dates cannot be in the future or long before the bill', async () => {
  const jan = await veraBill(JAN)
  await rejects(as(landlord, `select public.record_payment($1, 100, 'cash', '2027-02-16')`, [jan]), /cannot be in the future/)
  await rejects(as(landlord, `select public.record_payment($1, 100, 'cash', '2025-12-31')`, [jan]), /more than a year before/)
  await rejects(as(vera, `select public.submit_payment($1, 100, 'gcash', '2027-02-16', $2)`,
    [jan, await proof(vera, 'future.jpg')]), /cannot be in the future/)
  await rejects(as(landlord, `select public.record_payment($1, 100, 'card', public.property_today())`, [jan]), /Choose how/)
  const before = num((await bill(jan)).balance)
  await as(landlord, `select public.record_payment($1, 100.55, 'cash', '2027-01-31')`, [jan])
  assert.equal(num((await bill(jan)).balance), Math.round((before - 100.55) * 100) / 100)
})
await test('deposits cannot be dated in the future; no date means today', async () => {
  await rejects(as(landlord, `select public.record_deposit_transaction($1, 'received', 1000, '2027-02-16')`, [vLease]), /future/)
  const [{ id }] = await as(landlord, `select public.record_deposit_transaction($1, 'received', 1000, null) as id`, [vLease])
  const [d] = await asAdmin(`select transaction_date from public.deposit_transactions where id = $1`, [id])
  assert.equal(iso(d.transaction_date), baseToday)
})

console.log('\nValidation: month boundaries')
await test('February bills fall due correctly in leap and common years', async () => {
  await on('2028-02-28', () => as(landlord, `select public.generate_bills('2028-02-01')`))
  await on('2029-02-28', () => as(landlord, `select public.generate_bills('2029-02-01')`))
  const rows = await asAdmin(`select period, issue_date, due_date from public.bills
                              where lease_id = $1 and period in ('2028-02-01', '2029-02-01') order by period`, [vLease])
  assert.deepEqual(rows.map((r) => [iso(r.period), iso(r.issue_date), iso(r.due_date)]), [
    ['2028-02-01', '2028-02-10', '2028-02-10'],
    ['2029-02-01', '2029-02-10', '2029-02-10'],
  ])
})

await test('effective water rates, occupant audits, preserved bills and due-date overrides', async () => {
  const [{ create_manual_tenant: tenant }] = await as(landlord, `select public.create_manual_tenant('Rate schedule test')`)
  await as(landlord, `update public.rooms set capacity = 2 where id = $1`, [r213])
  const [{ assign_tenant: lease }] = await as(landlord,
    `select public.assign_tenant($1, $2, '2029-12-29', 3000)`, [tenant, r213])
  await rejects(as(nina, `select public.set_water_rate(250, '2030-01-01')`), /Only the landlord/)
  await rejects(as(landlord, `select public.set_water_rate(-1, '2030-01-01')`), /nonnegative amount/)
  await rejects(as(landlord, `select public.set_water_rate(1.001, '2030-01-01')`), /at most two decimal places/)
  await as(landlord, `select public.set_water_rate(200, '2030-01-01')`)
  const [rateNotice] = await inbox(alice, 'water_rate_changed')
  assert.match(rateNotice.message, /₱200\.00 per person per month, effective Jan 1, 2030/)

  await on('2029-12-29', () => as(landlord, `select public.generate_bills('2029-12-01')`))
  const [{ id: december }] = await asAdmin(
    `select id from public.bills where lease_id = $1 and period = '2029-12-01'`, [lease])
  const water = async (id) => asAdmin(
    `select quantity, unit_price, amount from public.bill_items where bill_id = $1 and kind = 'water'`, [id])
  assert.deepEqual((await water(december)).map((i) => [num(i.quantity), num(i.unit_price), num(i.amount)]), [[1, 150, 150]])
  await as(landlord, `select public.set_lease_occupants($1, 2::smallint)`, [lease])
  assert.deepEqual((await water(december)).map((i) => [num(i.quantity), num(i.unit_price), num(i.amount)]), [[2, 150, 300]])
  const audit = await as(landlord,
    `select previous_count, new_count from public.lease_occupant_audit where lease_id = $1 order by changed_at`, [lease])
  assert.deepEqual(audit, [{ previous_count: 1, new_count: 2 }])
  await rejects(as(nina, `select public.set_lease_occupants($1, 1::smallint)`, [lease]), /Only the landlord/)
  await rejects(as(landlord, `select public.set_lease_occupants($1, 3::smallint)`, [lease]), /capacity/)
  await on('2029-12-29', () => as(landlord, `select public.finalize_bill($1, true)`, [december]))

  await on('2030-01-29', () => as(landlord, `select public.generate_bills('2030-01-01')`))
  const [{ id: january }] = await asAdmin(
    `select id from public.bills where lease_id = $1 and period = '2030-01-01'`, [lease])
  let [billDates] = await asAdmin(`select issue_date, due_date from public.bills where id = $1`, [january])
  assert.deepEqual([iso(billDates.issue_date), iso(billDates.due_date)], ['2030-01-29', '2030-01-29'])
  assert.deepEqual((await water(january)).map((i) => [num(i.quantity), num(i.unit_price), num(i.amount)]), [[2, 200, 400]])
  await on('2030-01-29', () => as(landlord, `select public.finalize_bill($1, true)`, [january]))
  await as(landlord, `select public.set_lease_occupants($1, 1::smallint)`, [lease])
  assert.deepEqual((await water(january)).map((i) => [num(i.quantity), num(i.unit_price), num(i.amount)]), [[2, 200, 400]])
  assert.deepEqual((await water(december)).map((i) => [num(i.quantity), num(i.unit_price), num(i.amount)]), [[2, 150, 300]])

  await rejects(as(nina, `select public.override_bill_due_date($1, '2030-02-05', 'approved')`, [january]), /Only the landlord/)
  await rejects(as(landlord, `select public.override_bill_due_date($1, '2030-02-05', '')`, [january]), /reason/)
  await as(landlord, `select public.override_bill_due_date($1, '2030-02-05', 'Agreed extension')`, [january])
  ;[billDates] = await asAdmin(`select issue_date, due_date from public.bills where id = $1`, [january])
  assert.deepEqual([iso(billDates.issue_date), iso(billDates.due_date)], ['2030-01-29', '2030-02-05'])
  const dueAudit = await as(landlord,
    `select previous_date, new_date, reason from public.bill_due_date_audit where bill_id = $1`, [january])
  assert.deepEqual(dueAudit.map((row) => [iso(row.previous_date), iso(row.new_date), row.reason]),
    [['2030-01-29', '2030-02-05', 'Agreed extension']])
})

console.log('\nPayment accounts and QR submissions')
const qrTenant = await invite('qr-flow@example.com', 'QR Flow Tenant')
const [{ id: qrTenantProfile }] = await asAdmin(`select id from public.profiles where user_id = $1`, [qrTenant])
const qrRoom = await roomId('108')
await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01', 1000)`, [qrTenantProfile, qrRoom])
await as(landlord, `select public.generate_bills('2026-10-01')`)
const [{ id: qrBill }] = await asAdmin(
  `select id from public.bills where tenant_id = $1 and period = '2026-10-01'`, [qrTenantProfile])
await as(landlord, `select public.finalize_bill($1, true)`, [qrBill])
const [{ id: landlordProfile }] = await asAdmin(`select id from public.profiles where user_id = $1`, [landlord])
const gcashQr = `${landlordProfile}/gcash.png`
const replacementQr = `${landlordProfile}/gcash-new.png`
const mayaQr = `${landlordProfile}/maya.png`
const bankQr = `${landlordProfile}/bank.png`
const badTypeQr = `${landlordProfile}/bad-type.png`
const oversizedQr = `${landlordProfile}/oversized.png`
await as(landlord, `
  insert into storage.objects (bucket_id, name, metadata)
  values ('payment-qr-codes', $1, '{"mimetype":"image/png","size":1024}'::jsonb),
         ('payment-qr-codes', $2, '{"mimetype":"image/png","size":1024}'::jsonb),
         ('payment-qr-codes', $3, '{"mimetype":"image/png","size":1024}'::jsonb),
         ('payment-qr-codes', $4, '{"mimetype":"image/png","size":1024}'::jsonb),
         ('payment-qr-codes', $5, '{"mimetype":"image/gif","size":1024}'::jsonb),
         ('payment-qr-codes', $6, '{"mimetype":"image/png","size":4194305}'::jsonb)
`, [gcashQr, replacementQr, mayaQr, bankQr, badTypeQr, oversizedQr])

let gcashAccount
await test('landlord account validation, QR replacement, audit and tenant read permissions', async () => {
  await rejects(as(landlord, `
    select public.save_payment_account(null, 'gcash', 'Landlord', '12345', null, $1, true, true)
  `, [gcashQr]), /valid Philippine mobile wallet number/)
  await rejects(as(landlord, `
    select public.save_payment_account(null, 'gcash', 'Landlord', '09171234567', null, $1, true, true)
  `, [badTypeQr]), /valid QR code image/)
  await rejects(as(landlord, `
    select public.save_payment_account(null, 'gcash', 'Landlord', '09171234567', null, $1, true, true)
  `, [oversizedQr]), /valid QR code image/)
  ;[{ save_payment_account: gcashAccount }] = await as(landlord, `
    select public.save_payment_account(null, 'gcash', 'Landlord', '0917 123 4567', null, $1, true, true)
  `, [gcashQr])
  assert.ok(gcashAccount)
  await as(landlord, `
    select public.save_payment_account($1, 'gcash', 'Landlord', '09171234567', null, $2, true, true)
  `, [gcashAccount, replacementQr])
  await rejects(as(landlord, `
    select public.save_payment_account(null, 'bank_transfer', 'Landlord', '123456789012', null, $1, true, false)
  `, [bankQr]), /bank name/)
  await as(landlord, `
    select public.save_payment_account(null, 'maya', 'Landlord', '09181234567', null, $1, true, true)
  `, [mayaQr])
  await as(landlord, `
    select public.save_payment_account(null, 'bank_transfer', 'Landlord', '123456789012', 'Metrobank', $1, true, false)
  `, [bankQr])
  const [saved] = await asAdmin(`select account_number, qr_path, is_active, is_default from public.landlord_payment_accounts where id = $1`, [gcashAccount])
  assert.deepEqual(saved, { account_number: '09171234567', qr_path: replacementQr, is_active: true, is_default: false })
  const tenantAccounts = await as(qrTenant, `select id, method from public.landlord_payment_accounts where is_active`)
  assert.deepEqual(tenantAccounts.map((account) => account.method).sort(), ['bank_transfer', 'gcash', 'maya'])
  const [{ method: defaultMethod }] = await asAdmin(`select method from public.landlord_payment_accounts where is_default`)
  assert.equal(defaultMethod, 'maya')
  assert.equal((await as(qrTenant, `select name from storage.objects where bucket_id = 'payment-qr-codes' and name = $1`, [gcashQr])).length, 0)
  assert.equal((await as(qrTenant, `select name from storage.objects where bucket_id = 'payment-qr-codes' and name = $1`, [replacementQr])).length, 1)
  await rejects(as(qrTenant, `update public.landlord_payment_accounts set account_number = '09170000000'`), /permission denied/)
  await rejects(as(qrTenant, `select public.save_payment_account(null, 'gcash', 'Tenant', '09170000000', null, $1, true, true)`, [replacementQr]),
    /Only the landlord/)
  await rejects(as(qrTenant, `
    insert into storage.objects (bucket_id, name) values ('payment-qr-codes', $1)
  `, [`${qrTenantProfile}/unauthorized.png`]), /row-level security/)
  const [{ n: auditCount }] = await as(landlord,
    `select count(*)::int as n from public.payment_account_audit where account_id = $1`, [gcashAccount])
  assert.equal(auditCount, 3)
  assert.ok((await inbox(qrTenant, 'payment_account_updated')).length >= 4)
})

let qrPayment
const optionalReferenceProof = `${qrTenantProfile}/qr-no-reference.jpg`
await test('QR proof submission validates optional references, active accounts, images, amounts and idempotency', async () => {
  const firstProof = `${qrTenantProfile}/qr-proof.jpg`
  const duplicateProof = `${qrTenantProfile}/qr-duplicate.jpg`
  await as(qrTenant, `
    insert into storage.objects (bucket_id, name, metadata)
    values ('payment-proofs', $1, '{"mimetype":"image/jpeg","size":2048}'::jsonb),
           ('payment-proofs', $2, '{"mimetype":"image/jpeg","size":2048}'::jsonb),
           ('payment-proofs', $3, '{"mimetype":"image/jpeg","size":2048}'::jsonb)
  `, [firstProof, duplicateProof, optionalReferenceProof])
  await rejects(as(qrTenant, `
    select public.submit_qr_payment($1, $2, 100, public.property_today(), $3, 'AB', null, 'f51064d3-51e5-4f0b-9a21-4af93a72a4c9')
  `, [qrBill, gcashAccount, firstProof]), /transaction reference/)
  await rejects(as(qrTenant, `
    select public.submit_qr_payment($1, $2, 2000, public.property_today(), $3, 'QR-OVER', null, 'f51064d3-51e5-4f0b-9a21-4af93a72a4c9')
  `, [qrBill, gcashAccount, firstProof]), /exceeds/)
  await rejects(as(qrTenant, `
    select public.submit_qr_payment($1, $2, 100, public.property_today(), $3, 'QR-PDF', null, 'f51064d3-51e5-4f0b-9a21-4af93a72a4c9')
  `, [qrBill, gcashAccount, `${qrTenantProfile}/missing.jpg`]), /screenshot/)
  ;[{ submit_qr_payment: qrPayment }] = await as(qrTenant, `
    select public.submit_qr_payment($1, $2, 400, public.property_today(), $3, 'QR-REF-001', 'partial transfer',
      'f51064d3-51e5-4f0b-9a21-4af93a72a4c9')
  `, [qrBill, gcashAccount, firstProof])
  const [{ submit_qr_payment: retry }] = await as(qrTenant, `
    select public.submit_qr_payment($1, $2, 400, public.property_today(), $3, 'QR-REF-001', 'partial transfer',
      'f51064d3-51e5-4f0b-9a21-4af93a72a4c9')
  `, [qrBill, gcashAccount, firstProof])
  assert.equal(retry, qrPayment)
  await rejects(as(qrTenant, `
    select public.submit_qr_payment($1, $2, 100, public.property_today(), $3, 'qr-ref-001', null,
      '79f3a853-6bad-48a4-88db-51bd4aef2a8f')
  `, [qrBill, gcashAccount, duplicateProof]), /already been used/)
  const [{ status, payment_account_id: paymentAccountId }] = await asAdmin(
    `select status, payment_account_id from public.payments where id = $1`, [qrPayment])
  assert.equal(status, 'pending')
  assert.equal(paymentAccountId, gcashAccount)
  const [{ payment_account_snapshot: accountSnapshot }] = await asAdmin(
    `select payment_account_snapshot from public.payments where id = $1`, [qrPayment])
  assert.deepEqual(accountSnapshot, {
    method: 'gcash',
    account_holder: 'Landlord',
    account_number: '09171234567',
    bank_name: null,
  })
  await rejects(asAdmin(`update public.payments set payment_account_snapshot = '{}' where id = $1`, [qrPayment]), /immutable/)
  assert.equal(num((await bill(qrBill)).balance), 1150)
  assert.equal((await as(alice, `select name from storage.objects where bucket_id = 'payment-proofs' and name = $1`, [firstProof])).length, 0)
})

await test('payment confirmation is required, approval allocates the partial payment, and inactive accounts are rejected', async () => {
  await rejects(as(landlord, `select public.review_payment_confirmed($1, true, null, null, false)`, [qrPayment]), /Confirm that the money was received/)
  await rejects(as(qrTenant, `select public.review_payment_confirmed($1, true, null, null, true)`, [qrPayment]), /Only the landlord/)
  await rejects(as(landlord, `select public.review_payment($1, true)`, [qrPayment]), /permission denied/)
  await as(landlord, `select public.review_payment_confirmed($1, true, null, null, true)`, [qrPayment])
  const [{ status }] = await asAdmin(`select status from public.payments where id = $1`, [qrPayment])
  assert.equal(status, 'verified')
  assert.equal(num((await bill(qrBill)).balance), 750)
  const [{ amount }] = await asAdmin(`select sum(amount) as amount from public.payment_allocations where payment_id = $1`, [qrPayment])
  assert.equal(num(amount), 400)
  const [{ payment: receiptPayment }] = await as(qrTenant, `select public.payment_receipt($1) as payment`, [qrPayment])
  assert.equal(num(receiptPayment.payment.amount), 400)
  const [{ submit_qr_payment: optionalReferencePayment }] = await as(qrTenant, `
    select public.submit_qr_payment($1, $2, 100, public.property_today(), $3, '   ', null,
      'b155ba14-30da-49bb-84bd-c927e330aaf0')
  `, [qrBill, gcashAccount, optionalReferenceProof])
  const [{ reference_number: optionalReference }] = await asAdmin(
    `select reference_number from public.payments where id = $1`, [optionalReferencePayment])
  assert.equal(optionalReference, null)
  await as(landlord, `
    select public.save_payment_account($1, 'gcash', 'Landlord', '09171234567', null, $2, false, false)
  `, [gcashAccount, replacementQr])
  await rejects(as(qrTenant, `
    select public.submit_qr_payment($1, $2, 100, public.property_today(), $3, 'QR-INACTIVE', null,
      '37f9b0fc-8f54-42bc-a2bf-74d4e14a1c09')
  `, [qrBill, gcashAccount, `${qrTenantProfile}/inactive.jpg`]), /no longer active/)
  assert.equal((await as(qrTenant, `select id from public.landlord_payment_accounts where id = $1`, [gcashAccount])).length, 0)
  assert.equal((await as(qrTenant, `select name from storage.objects where bucket_id = 'payment-qr-codes' and name = $1`, [replacementQr])).length, 0)
})

console.log('\nFinancial management')
let manualIncome, manualExpense
await test('only landlords can create custom finance categories and manual transactions', async () => {
  await rejects(as(alice, `select public.add_financial_category('expense', 'Landscaping')`), /Only the landlord/)
  await rejects(as(alice, `select public.save_financial_transaction('income', 50, 'Rental Income', '2026-01-15', 'Not allowed', 'cash')`), /Only the landlord/)
  const [{ add_financial_category: categoryId }] = await as(landlord,
    `select public.add_financial_category('expense', 'Landscaping')`)
  assert.ok(categoryId)
  await rejects(as(landlord, `select public.add_financial_category('expense', 'landscaping')`), /already exists/)
  ;[{ id: manualIncome }] = await as(landlord, `
    select public.save_financial_transaction('income', 1234.56, 'Rental Income', '2026-01-15',
      'Manual rent correction', 'cash', $1, $2, null, null) as id
  `, [r101, alice])
  ;[{ id: manualExpense }] = await as(landlord, `
    select public.save_financial_transaction('expense', 25.35, 'Landscaping', '2026-01-16',
      'Garden service', 'bank_transfer', $1, null, null, null) as id
  `, [r101])
  const rows = await as(landlord, `
    select transaction_type, amount, category, room_number, tenant_name, source
    from public.financial_transaction_overview where id in ($1, $2) order by transaction_type
  `, [manualIncome, manualExpense])
  assert.deepEqual(rows, [
    { transaction_type: 'expense', amount: '25.35', category: 'Landscaping', room_number: '101', tenant_name: null, source: 'manual' },
    { transaction_type: 'income', amount: '1234.56', category: 'Rental Income', room_number: '101', tenant_name: 'Alice', source: 'manual' },
  ])
  assert.equal((await as(alice, `select id from public.financial_transaction_overview`)).length, 0)
  assert.equal((await as(alice, `select id from public.financial_categories`)).length, 0)
  await rejects(as(landlord, `update public.financial_transactions set amount = 1 where id = $1`, [manualIncome]), /permission denied/)
})
await test('cash adjustments are landlord-only, dated and append-only', async () => {
  await rejects(as(alice, `select public.record_daily_cash_adjustment('2026-10-18', 500, 'Starting float')`), /Only the landlord/)
  assert.equal((await as(alice, `select id from public.daily_cash_adjustments`)).length, 0)
  await rejects(as(alice, `
    insert into public.daily_cash_adjustments (adjustment_date, amount_delta, reason, created_by)
    values ('2026-10-18', 500, 'Starting float', $1)
  `, [alice]), /permission denied/)
  const [{ id }] = await on('2026-10-18', () =>
    as(landlord, `select public.record_daily_cash_adjustment('2026-10-18', 500, 'Starting float') as id`))
  const [adjustment] = await as(landlord, `
    select adjustment_date, amount_delta, reason, created_by
    from public.daily_cash_adjustments where id = $1
  `, [id])
  assert.deepEqual({
    ...adjustment,
    adjustment_date: adjustment.adjustment_date.toISOString().slice(0, 10),
  }, {
    adjustment_date: '2026-10-18',
    amount_delta: '500.00',
    reason: 'Starting float',
    created_by: landlord,
  })
  await rejects(as(landlord, `update public.daily_cash_adjustments set amount_delta = 1 where id = $1`, [id]), /permission denied/)
  await rejects(as(landlord, `delete from public.daily_cash_adjustments where id = $1`, [id]), /permission denied/)
  await rejects(on('2026-10-18', () =>
    as(landlord, `select public.record_daily_cash_adjustment('2026-10-19', 1, 'Future date')`)), /future/)
  await rejects(as(landlord, `select public.record_daily_cash_adjustment('2026-10-18', 0, 'Zero')`), /non-zero/)
})
await test('daily opening cash is landlord-only, unique per date and audited on each save', async () => {
  await rejects(as(alice, `select public.save_daily_cash_opening('2026-10-18', 500)`), /Only the landlord/)
  assert.equal((await as(alice, `select opening_date from public.daily_cash_openings`)).length, 0)
  await rejects(as(alice, `
    insert into public.daily_cash_openings (opening_date, opening_cash, created_by, updated_by)
    values ('2026-10-18', 500, $1, $1)
  `, [alice]), /permission denied/)
  const date = '2026-10-18'
  await on(date, () => as(landlord, `select public.save_daily_cash_opening($1, 750)`, [date]))
  await on(date, () => as(landlord, `select public.save_daily_cash_opening($1, 825.50)`, [date]))

  const [saved] = await as(landlord, `
    select opening_cash, created_by, updated_by, created_at, updated_at
    from public.daily_cash_openings where opening_date = $1
  `, [date])
  assert.equal(saved.opening_cash, '825.50')
  assert.equal(saved.created_by, landlord)
  assert.equal(saved.updated_by, landlord)
  assert.equal((await asAdmin(`select count(*)::int as n from public.daily_cash_openings where opening_date = $1`, [date]))[0].n, 1)
  const audit = await as(landlord, `
    select opening_cash, actor_id, event
    from public.daily_cash_opening_audit where opening_date = $1 order by id
  `, [date])
  assert.deepEqual(audit, [
    { opening_cash: '750.00', actor_id: landlord, event: 'created' },
    { opening_cash: '825.50', actor_id: landlord, event: 'updated' },
  ])
  await rejects(as(landlord, `update public.daily_cash_openings set opening_cash = 1 where opening_date = $1`, [date]), /permission denied/)
  await rejects(as(landlord, `delete from public.daily_cash_openings where opening_date = $1`, [date]), /permission denied/)
  await rejects(as(landlord, `select public.save_daily_cash_opening($1, -1)`, [date]), /zero or greater/)
  await rejects(as(landlord, `select public.save_daily_cash_opening($1, 1.001)`, [date]), /two decimal/)
  await rejects(on(date, () => as(landlord, `select public.save_daily_cash_opening('2026-10-19', 1)`)), /future/)
  await rejects(as(landlord, `update public.daily_cash_opening_audit set opening_cash = 1 where opening_date = $1`, [date]), /permission denied/)
})
await test('manual records are editable and deletions preserve an append-only audit trail', async () => {
  await as(landlord, `
    select public.save_financial_transaction('income', 1300.01, 'Rental Income', '2026-01-15',
      'Corrected rent', 'cash', $1, $2, null, $3)
  `, [r101, alice, manualIncome])
  await as(landlord, `select public.delete_financial_transaction($1)`, [manualExpense])
  assert.equal((await as(landlord, `select id from public.financial_transaction_overview where id = $1`, [manualExpense])).length, 0)
  assert.equal((await asAdmin(`select amount from public.financial_transactions where id = $1`, [manualIncome]))[0].amount, '1300.01')
  const log = await as(landlord, `
    select event from public.financial_transaction_audit where transaction_id in ($1, $2) order by id
  `, [manualIncome, manualExpense])
  assert.deepEqual(log.map((entry) => entry.event), ['created', 'created', 'updated', 'deleted'])
  await rejects(as(landlord, `delete from public.financial_transaction_audit`), /permission denied/)
})
await test('receipts are private to the landlord and cannot be linked from another folder', async () => {
  const path = `${landlord}/garden-receipt.jpg`
  await asAdmin(`insert into storage.objects (bucket_id, name) values ('financial-receipts', $1)`, [path])
  await as(landlord, `
    select public.save_financial_transaction('expense', 45.50, 'Repairs', '2026-01-17',
      'Sink repair', 'cash', $1, null, $2, null)
  `, [r101, path])
  await rejects(as(landlord, `
    select public.save_financial_transaction('expense', 5, 'Repairs', '2026-01-17',
      'Bad receipt path', 'cash', null, null, $1, null)
  `, [`${alice}/private.jpg`]), /uploaded file in your private receipts folder/)
  assert.equal((await as(landlord, `select name from storage.objects where bucket_id = 'financial-receipts' and name = $1`, [path])).length, 1)
  assert.equal((await as(alice, `select name from storage.objects where bucket_id = 'financial-receipts' and name = $1`, [path])).length, 0)
  await rejects(as(alice, `insert into storage.objects (bucket_id, name) values ('financial-receipts', $1)`, [`${alice}/fake.jpg`]), /row-level security/)
})
await test('approved income is projected once from payment allocations, never from unpaid bills', async () => {
  const [expected] = await asAdmin(`
    select count(distinct kind)::int as kinds, sum(amount) as amount
    from public.payment_allocations where payment_id = $1
  `, [qrPayment])
  const actual = await as(landlord, `
    select id, amount, category from public.financial_transaction_overview where payment_id = $1
  `, [qrPayment])
  assert.equal(actual.length, expected.kinds)
  assert.equal(num(actual.reduce((sum, row) => sum + Number(row.amount), 0)), num(expected.amount))
  assert.ok(actual.every((row) => ['Rental Income', 'Utility Payments', 'Other Income'].includes(row.category)))
  assert.equal((await as(landlord, `
    select id from public.financial_transaction_overview where payment_id in (
      select id from public.payments where status <> 'verified'
    )
  `)).length, 0)
  await rejects(as(alice, `
    select public.save_financial_transaction('income', 1, 'Rental Income', '2026-01-15',
      'Cannot edit verified payments', 'cash', null, null, null, $1)
  `, [qrPayment]), /Only the landlord/)
})

console.log('\nThree electricity meters')
const meterTenant = await invite('meter-tenant@example.com', 'Meter Tenant')
const meterRoom = (await as(landlord, `
  insert into public.rooms (room_number, monthly_rent, electricity_meters)
  values ('METER-TEST', 100, array['aircon', 'outlet', 'light'])
  returning id
`))[0].id
let meterBill
await test('three meter consumptions aggregate at the configured rate on the consolidated bill', async () => {
  await as(landlord, `update public.app_settings set electricity_rate = 12.3456 where id`)
  await as(landlord, `select public.assign_tenant($1, $2, '2026-10-01', 100)`, [meterTenant, meterRoom])
  await on('2026-10-20', () => as(landlord, `select public.generate_bills('2026-10-01')`))
  ;[{ id: meterBill }] = await asAdmin(`select id from public.bills where room_id = $1 and period = '2026-10-01'`, [meterRoom])
  await as(landlord, `select public.record_room_readings($1, $2)`, [
    '2026-10-01',
    JSON.stringify([{ room_id: meterRoom, aircon_previous: 5, aircon_current: 7 }]),
  ])
  assert.equal((await asAdmin(`
    select id from public.bill_items where bill_id = $1 and kind = 'electricity'
  `, [meterBill])).length, 0)
  const [{ record_room_readings: count }] = await as(landlord, `select public.record_room_readings($1, $2)`, [
    '2026-10-01',
    JSON.stringify([{
      room_id: meterRoom,
      aircon_previous: 5, aircon_current: 7,
      outlet_previous: 10, outlet_current: 14,
      light_previous: 1, light_current: 2.5,
    }]),
  ])
  assert.equal(count, 1)
  const [line] = await asAdmin(`
    select quantity, unit_price, amount, description
    from public.bill_items where bill_id = $1 and kind = 'electricity'
  `, [meterBill])
  assert.equal(num(line.quantity), 7.5)
  assert.equal(num(line.unit_price), 12.3456)
  assert.equal(num(line.amount), 92.59)
  assert.match(line.description, /Aircon 2\.00 kWh/)
  assert.match(line.description, /Outlet 4\.00 kWh/)
  assert.match(line.description, /Light 1\.50 kWh/)
  assert.match(line.description, /Total 7\.50 kWh/)
  assert.equal(num((await bill(meterBill)).total_amount), 342.59)
  await as(landlord, `select public.finalize_bill($1)`, [meterBill])
  assert.equal((await as(meterTenant, `
    select meter from public.electricity_meter_readings
    where room_id = $1 and period = '2026-10-01' order by meter
  `, [meterRoom])).length, 3)
})
await test('reset/replacement starts a new non-negative counter while historical periods and billed rates stay fixed', async () => {
  const [carried] = await as(landlord, `
    select aircon_previous, outlet_previous, light_previous
    from public.meter_reading_sheet('2026-11-01')
    where room_id = $1
  `, [meterRoom])
  assert.equal(num(carried.aircon_previous), 7)
  assert.equal(num(carried.outlet_previous), 14)
  assert.equal(num(carried.light_previous), 2.5)
  await as(landlord, `select public.record_room_readings($1, $2)`, [
    '2026-11-01',
    JSON.stringify([{
      room_id: meterRoom,
      aircon_previous: 0, aircon_current: 1, aircon_reset: true,
      outlet_previous: 14, outlet_current: 15,
      light_previous: 2.5, light_current: 3,
    }]),
  ])
  const [reset] = await asAdmin(`
    select previous, current, meter_reset from public.electricity_meter_readings
    where room_id = $1 and period = '2026-11-01' and meter = 'aircon'
  `, [meterRoom])
  assert.deepEqual(reset, { previous: '0.00', current: '1.00', meter_reset: true })
  const [nextMonth] = await as(landlord, `
    select aircon_previous from public.meter_reading_sheet('2026-12-01') where room_id = $1
  `, [meterRoom])
  assert.equal(num(nextMonth.aircon_previous), 7, 'unfinalized November current readings are not carried forward')

  await on('2026-12-20', () => as(landlord, `select public.generate_bills('2026-12-01')`))
  const [decemberBill] = await asAdmin(`
    select id from public.bills where room_id = $1 and period = '2026-12-01'
  `, [meterRoom])
  await as(landlord, `select public.record_room_readings($1, $2)`, [
    '2026-12-01',
    JSON.stringify([{
      room_id: meterRoom,
      aircon_previous: 7, aircon_current: 1, aircon_event: 'review',
      outlet_previous: 15, outlet_current: 16,
      light_previous: 3, light_current: 4,
    }]),
  ])
  const [review] = await asAdmin(`
    select reading_event, previous, current from public.electricity_meter_readings
    where room_id = $1 and period = '2026-12-01' and meter = 'aircon'
  `, [meterRoom])
  assert.deepEqual(review, { reading_event: 'review', previous: '7.00', current: '1.00' })
  assert.equal((await asAdmin(`
    select id from public.bill_items where bill_id = $1 and kind = 'electricity'
  `, [decemberBill.id])).length, 0, 'review readings must not produce an electricity charge')

  await as(landlord, `select public.record_room_readings($1, $2)`, [
    '2026-12-01',
    JSON.stringify([{
      room_id: meterRoom,
      aircon_previous: 0, aircon_current: 1, aircon_event: 'review',
      outlet_previous: 15, outlet_current: 16,
      light_previous: 3, light_current: 4,
    }]),
  ])
  const [corrected] = await asAdmin(`
    select reading_event, previous, current from public.electricity_meter_readings
    where room_id = $1 and period = '2026-12-01' and meter = 'aircon'
  `, [meterRoom])
  assert.deepEqual(corrected, { reading_event: 'normal', previous: '0.00', current: '1.00' })
  const [correctedLine] = await asAdmin(`
    select quantity from public.bill_items where bill_id = $1 and kind = 'electricity'
  `, [decemberBill.id])
  assert.equal(num(correctedLine.quantity), 3)

  await as(landlord, `select public.record_room_readings($1, $2)`, [
    '2027-01-01',
    JSON.stringify([{
      room_id: meterRoom,
      aircon_previous: 7, aircon_current: 1, aircon_event: 'rollover', aircon_rollover_at: 10,
      outlet_previous: 16, outlet_current: 17,
      light_previous: 4, light_current: 5,
    }]),
  ])
  const [rollover] = await asAdmin(`
    select reading_event, rollover_at, current - previous as naive_delta
    from public.electricity_meter_readings
    where room_id = $1 and period = '2027-01-01' and meter = 'aircon'
  `, [meterRoom])
  assert.deepEqual(rollover, { reading_event: 'rollover', rollover_at: '10.00', naive_delta: '-6.00' })
  const [rolloverAudit] = await as(landlord, `
    select action from public.electricity_meter_reading_audit
    where room_id = $1 and period = '2027-01-01' and meter = 'aircon'
  `, [meterRoom])
  assert.equal(rolloverAudit.action, 'rollover')
  await rejects(as(landlord, `delete from public.electricity_meter_reading_audit`), /permission denied/)

  await as(landlord, `select public.record_room_readings($1, $2)`, [
    '2027-02-01',
    JSON.stringify([{
      room_id: meterRoom,
      aircon_previous: 5, aircon_current: 7, aircon_event: 'replacement',
      outlet_previous: 17, outlet_current: 18,
      light_previous: 5, light_current: 6,
    }]),
  ])
  const [replacement] = await asAdmin(`
    select previous, current, meter_reset, reading_event from public.electricity_meter_readings
    where room_id = $1 and period = '2027-02-01' and meter = 'aircon'
  `, [meterRoom])
  assert.deepEqual(replacement, {
    previous: '5.00', current: '7.00', meter_reset: true, reading_event: 'replacement',
  })

  await rejects(as(meterTenant, `select public.record_room_readings($1, $2)`, [
    '2027-03-01',
    JSON.stringify([{ room_id: meterRoom, aircon_previous: 7, aircon_current: 8 }]),
  ]), /Only the landlord/)
  await as(landlord, `update public.app_settings set electricity_rate = 13.1234 where id`)
  const [preserved] = await asAdmin(`
    select unit_price, amount from public.bill_items where bill_id = $1 and kind = 'electricity'
  `, [meterBill])
  assert.equal(num(preserved.unit_price), 12.3456)
  assert.equal(num(preserved.amount), 92.59)
  assert.equal((await asAdmin(`
    select period from public.electricity_meter_readings
    where room_id = $1 and meter = 'aircon' and period in ('2026-10-01', '2026-11-01')
  `, [meterRoom])).length, 2)
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`)
