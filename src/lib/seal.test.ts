/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fromBase64, keyFor, newSalt, seal, toBase64, unseal } from './seal.ts'

test('sealed data opens with the same key and comes out the same', async () => {
  const key = await keyFor('a passcode', newSalt())
  const value = { trackers: [{ id: 'diary', name: 'Diary' }] }
  const sealed = await seal(key, value)
  assert.deepEqual(await unseal(key, sealed), value)
  assert.ok(!new TextDecoder().decode(sealed.data).includes('Diary'), 'nothing readable')
})

test('every seal uses a fresh IV', async () => {
  const key = await keyFor('a passcode', newSalt())
  const [a, b] = [await seal(key, 'same'), await seal(key, 'same')]
  assert.notDeepEqual(a.iv, b.iv)
  assert.notDeepEqual(a.data, b.data)
})

test('a different passcode or salt can’t open it', async () => {
  const salt = newSalt()
  const sealed = await seal(await keyFor('a passcode', salt), 'secret')
  await assert.rejects(unseal(await keyFor('another passcode', salt), sealed))
  await assert.rejects(unseal(await keyFor('a passcode', newSalt()), sealed))
})

test('bytes survive the trip through base64', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes)
})
