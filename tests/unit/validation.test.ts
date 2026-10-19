// Unit tests for the form validation helpers shared by every form.
//   npm run test:unit
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { currentPeriod, isValidPeriod, leaseAnniversaryDate, nextLeaseDueDate, shiftPeriod, todayISO } from '../../src/lib/dates.ts'
import { dateInput, intInput, moneyInput, optionalMoneyInput } from '../../src/lib/form-fields.ts'
import { isValidPhone, optionalText, passwordSchema, phoneText } from '../../src/lib/validation.ts'

const ok = <T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: unknown): T => {
  const r = schema.safeParse(value)
  assert.ok(r.success, `expected ${JSON.stringify(value)} to be accepted`)
  return r.data as T
}
const bad = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  assert.equal(schema.safeParse(value).success, false, `expected ${JSON.stringify(value)} to be rejected`)

describe('phone numbers', () => {
  test('accepts Philippine mobile and landline numbers in common formats', () => {
    for (const v of ['09171234567', '0917 123 4567', '0917-123-4567', '+63 917 123 4567', '639171234567', '(02) 8123 4567', '(032) 123-4567']) {
      assert.ok(isValidPhone(v), v)
    }
  })
  test('accepts international numbers written with +', () => {
    assert.ok(isValidPhone('+1 415 555 0100'))
    assert.ok(isValidPhone('+65 6123 4567'))
  })
  test('rejects text, fragments and over-long numbers', () => {
    for (const v of ['call me', '1-----', '0917', '12345', '12345678901234567', '+0 123 4567', '++639171234567', '0917 123 4567 ext 2']) {
      assert.equal(isValidPhone(v), false, v)
    }
  })
  test('the phone field is optional and trims blanks to null', () => {
    assert.equal(ok(phoneText, ''), null)
    assert.equal(ok(phoneText, '   '), null)
    assert.equal(ok(phoneText, ' 0917 123 4567 '), '0917 123 4567')
    bad(phoneText, 'abc')
  })
})

describe('text fields', () => {
  test('optional text: whitespace-only becomes null, length is capped', () => {
    const notes = optionalText(5)
    assert.equal(ok(notes, '    '), null)
    assert.equal(ok(notes, ' hi '), 'hi')
    bad(notes, '123456')
  })
  test('passwords need 8+ characters with a letter and a number', () => {
    ok(passwordSchema, 'rentlio2026')
    bad(passwordSchema, 'short1')
    bad(passwordSchema, 'onlyletters')
    bad(passwordSchema, '1234567890')
  })
})

describe('money', () => {
  const amount = moneyInput('Amount')
  test('accepts whole and two-decimal amounts, with thousands separators', () => {
    assert.equal(ok(amount, '4500'), 4500)
    assert.equal(ok(amount, '4,500.50'), 4500.5)
    assert.equal(ok(amount, '0.01'), 0.01)
    assert.equal(ok(amount, ' 12.3 '), 12.3)
  })
  test('rejects empty, negative, non-numeric, exponent and over-precise amounts', () => {
    for (const v of ['', '   ', '-5', 'abc', '1e3', '12.345', 'NaN', 'Infinity', '1.2.3', '₱100']) bad(amount, v)
  })
  test('rejects amounts beyond the database column', () => {
    bad(amount, '10000000000')
    ok(amount, '9999999999')
  })
  test('optional money: blank is null, invalid is still rejected', () => {
    const deposit = optionalMoneyInput()
    assert.equal(ok(deposit, ''), null)
    assert.equal(ok(deposit, '3000'), 3000)
    bad(deposit, '-1')
  })
})

describe('whole numbers', () => {
  test('room capacity must be a whole number in range', () => {
    const capacity = intInput(1, 20)
    assert.equal(ok(capacity, '4'), 4)
    for (const v of ['0', '21', '2.5', '-1', '', 'two']) bad(capacity, v)
  })
})

describe('dates', () => {
  test('date fields reject nonexistent calendar dates', () => {
    bad(dateInput(), '2026-02-29')
    bad(dateInput(), '2026-04-31')
    ok(dateInput(), '2028-02-29')
  })
  test('date inputs need a full date', () => {
    ok(dateInput(), '2026-10-13')
    bad(dateInput(), '')
    bad(dateInput(), '13/10/2026')
  })
  test("today follows the property's clock (Asia/Manila, UTC+8), not the device's", () => {
    // 16:30 UTC on Oct 12 is 00:30 on Oct 13 in Manila.
    assert.equal(todayISO(new Date('2026-10-12T16:30:00Z')), '2026-10-13')
    assert.equal(todayISO(new Date('2026-10-12T15:59:00Z')), '2026-10-12')
    assert.equal(todayISO(new Date('2026-10-12T16:30:00Z'), 'UTC'), '2026-10-12')
    // The billing month turns at Manila midnight too.
    assert.equal(currentPeriod(new Date('2026-01-31T16:00:00Z')), '2026-02-01')
    assert.equal(currentPeriod(new Date('2026-12-31T16:00:00Z')), '2027-01-01')
  })
  test('billing periods move month by month across year ends', () => {
    assert.equal(shiftPeriod('2026-12-01', 1), '2027-01-01')
    assert.equal(shiftPeriod('2027-01-01', -1), '2026-12-01')
    assert.ok(isValidPeriod('2028-02-01'))
    assert.equal(isValidPeriod('2028-02-15'), false)
    assert.equal(isValidPeriod('nonsense'), false)
  })
  test('move-in anniversaries retain each tenant day and clamp only shorter months', () => {
    const anniversary = (start: string, month: string) =>
      leaseAnniversaryDate(start, new Date(`${month}-01T00:00:00`))
    for (const day of [1, 15, 28, 29, 30, 31]) {
      const start = `2026-10-${String(day).padStart(2, '0')}`
      assert.equal(anniversary(start, '2026-11'), `2026-11-${String(Math.min(day, 30)).padStart(2, '0')}`)
    }
    assert.equal(anniversary('2026-01-29', '2026-02'), '2026-02-28')
    assert.equal(anniversary('2028-01-29', '2028-02'), '2028-02-29')
    assert.equal(anniversary('2028-01-31', '2028-02'), '2028-02-29')
    assert.equal(anniversary('2027-01-31', '2027-02'), '2027-02-28')
    assert.equal(anniversary('2027-01-29', '2027-03'), '2027-03-29')
    assert.equal(anniversary('2027-01-30', '2027-03'), '2027-03-30')
    assert.equal(anniversary('2027-01-31', '2027-03'), '2027-03-31')
  })
  test('next lease due date uses move-in date before the first payment, then monthly anniversary', () => {
    assert.equal(nextLeaseDueDate('2026-10-17', '2026-10-10'), '2026-10-17')
    assert.equal(nextLeaseDueDate('2026-10-17', '2026-10-18'), '2026-11-17')
    assert.equal(nextLeaseDueDate('2026-10-31', '2027-03-01'), '2027-03-31')
    assert.equal(nextLeaseDueDate('2028-01-31', '2028-02-28'), '2028-02-29')
  })
})
