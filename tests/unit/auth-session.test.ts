import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { createSessionHandler } from '../../src/lib/auth-session.ts'

test('external logout and a different login cannot see cached tenant bills', () => {
  const client = new QueryClient()
  const receive = createSessionHandler<{ user: { id: string } }>(() => client.clear(), () => {})
  receive('INITIAL_SESSION', { user: { id: 'tenant-a' } })
  client.setQueryData(['billing', 'mine'], [{ tenant: 'tenant-a', balance: 5000 }])
  receive('TOKEN_REFRESHED', { user: { id: 'tenant-a' } })
  assert.ok(client.getQueryData(['billing', 'mine']))
  receive('SIGNED_OUT', null)
  assert.equal(client.getQueryData(['billing', 'mine']), undefined)
  client.setQueryData(['payments', 'mine'], [{ tenant: 'tenant-a', amount: 5000 }])
  receive('SIGNED_IN', { user: { id: 'tenant-b' } })
  assert.equal(client.getQueryData(['payments', 'mine']), undefined)
  client.clear()
})

test('a previous account request finishing after a switch cannot repopulate the query cache', async () => {
  const client = new QueryClient()
  const receive = createSessionHandler<{ user: { id: string } }>(() => client.clear(), () => {})
  receive('INITIAL_SESSION', { user: { id: 'tenant-a' } })
  let finish!: (data: string[]) => void
  const pending = client.fetchQuery({ queryKey: ['billing', 'mine'], queryFn: () => new Promise<string[]>(resolve => { finish = resolve }) })
  // QueryClient.clear cancels the query even when the underlying HTTP request cannot be cancelled.
  const cancelled = assert.rejects(pending)
  receive('SIGNED_IN', { user: { id: 'tenant-b' } })
  finish(['tenant-a private data'])
  await cancelled
  assert.equal(client.getQueryData(['billing', 'mine']), undefined)
  client.clear()
})
