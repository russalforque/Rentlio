import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchAllRows } from '../../src/lib/pagination.ts'

test('financial totals include rows beyond 1000 and respect a lower server cap', async () => {
  const ledger = Array.from({ length: 2105 }, (_, id) => ({ id, amount: 0.01 }))
  for (const cap of [1000, 100]) {
    const data = await fetchAllRows(async (from, to) => ({
      data: ledger.slice(from, Math.min(to + 1, from + cap)), error: null, count: ledger.length,
    }))
    assert.deepEqual(data, ledger)
    assert.equal(data.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100, 21.05)
  }
})

test('a failed later page rejects the report instead of returning incomplete totals', async () => {
  await assert.rejects(fetchAllRows(async from => from === 0
    ? { data: [1, 2], error: null, count: 3 }
    : { data: null, error: new Error('offline'), count: null }), /offline/)
})

test('a missing page with an outstanding count fails closed', async () => {
  await assert.rejects(fetchAllRows(async () => ({ data: [], error: null, count: 1 })), /report changed/)
  assert.deepEqual(await fetchAllRows(async () => ({ data: [], error: null, count: 0 })), [])
})

test('a concurrent insert changing the report count cannot return misleading totals', async () => {
  await assert.rejects(fetchAllRows(async from => from === 0
    ? { data: [{ id: 'a' }], error: null, count: 2 }
    : { data: [{ id: 'b' }], error: null, count: 3 }), /report changed/)
})

test('an offset shifted by concurrent edits cannot double-count a financial row', async () => {
  await assert.rejects(fetchAllRows(async () => ({ data: [{ id: 'a' }], error: null, count: 2 })), /report changed/)
})
