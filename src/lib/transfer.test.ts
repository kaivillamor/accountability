/// <reference types="node" />
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { arrange } from './arrange.ts'
import type { Entry, Group, Snapshot, Tracker } from './model.ts'
import { lock, merge, originOf, unlock, without } from './transfer.ts'

const NOW = 5_000

type Rest = { updatedAt?: number; order?: number; groupId?: string; parent?: { id: string; since: number }; name?: string }
const habit = (id: string, rest: Rest = {}): Tracker => ({ id, name: id, createdAt: 0, updatedAt: 0, order: 0, kind: 'habit', ...rest })
const group = (id: string, rest: Rest = {}): Group => ({ id, name: id, createdAt: 0, updatedAt: 0, order: 0, collapsed: false, ...rest })
const done = (id: string, trackerId: string): Entry => ({ id, trackerId, at: 1_000, kind: 'done' })

// The page as one line: groups as name[...], multi-stage habits as name(stages).
function shape({ trackers, groups }: Snapshot): string {
  return arrange(trackers, groups)
    .map((item) =>
      item.type === 'group'
        ? `${item.group.name}[${item.cards.map((c) => c.tracker.name).join(' ')}]`
        : item.card.stages.length > 0
          ? `${item.card.tracker.name}(${item.card.stages.map((s) => s.name).join(' ')})`
          : item.card.tracker.name,
    )
    .join(' ')
}

const snapshot: Snapshot = {
  trackers: [habit('run', { groupId: 'morning' }), { id: 'water', name: 'Water', createdAt: 0, updatedAt: 0, order: 1, kind: 'usage', unit: 'ounces', dailyGoal: 64 }],
  groups: [group('morning')],
  entries: [done('e1', 'run'), { id: 'e2', trackerId: 'water', at: 1_000, kind: 'used', amount: 12.5 }],
}

let file: string
before(async () => {
  file = await lock(snapshot, 'correct horse battery')
})

test('a locked file opens with its passphrase and holds everything', async () => {
  assert.deepEqual(await unlock(file, 'correct horse battery'), snapshot)
  assert.ok(!file.includes('Water') && !file.includes('ounces'), 'nothing readable without the passphrase')
})

test('the same data locks to a different file each time', async () => {
  assert.notEqual(await lock(snapshot, 'correct horse battery'), file)
})

test('a wrong passphrase or a damaged file doesn’t open', async () => {
  await assert.rejects(unlock(file, 'wrong horse battery'), { message: "That passphrase doesn't open this file." })
  const envelope = JSON.parse(file)
  const damaged = JSON.stringify({ ...envelope, data: (envelope.data[0] === 'A' ? 'B' : 'A') + envelope.data.slice(1) })
  await assert.rejects(unlock(damaged, 'correct horse battery'), { message: "That passphrase doesn't open this file." })
})

test('other files are turned away before any passphrase is tried', async () => {
  await assert.rejects(unlock('just some notes', 'x'), { message: "This isn't an Accountability file." })
  await assert.rejects(unlock('{"app":"something else"}', 'x'), { message: "This isn't an Accountability file." })
  await assert.rejects(unlock(JSON.stringify({ ...JSON.parse(file), format: 2 }), 'x'), {
    message: 'This file was made by a newer version of the app. Reload this page to update it, then try again.',
  })
})

test('merging keeps everything logged on either device, once', () => {
  const here: Snapshot = { trackers: [habit('run')], groups: [], entries: [done('e1', 'run'), done('e2', 'run')] }
  const there: Snapshot = { trackers: [habit('run'), habit('read', { order: 1 })], groups: [], entries: [done('e2', 'run'), done('e3', 'read')] }
  const merged = merge(here, there, NOW)
  assert.deepEqual(merged.entries.map((e) => e.id).toSorted(), ['e1', 'e2', 'e3'])
  assert.equal(shape(merged), 'run read')
})

test('a tracker or group on both devices keeps its newer version', () => {
  const here: Snapshot = { trackers: [habit('run', { name: 'Run', updatedAt: 10 }), habit('read', { order: 1, name: 'Read', updatedAt: 30 })], groups: [], entries: [] }
  const there: Snapshot = { trackers: [habit('run', { name: 'Morning run', updatedAt: 20 }), habit('read', { order: 1, name: 'Reading', updatedAt: 25 })], groups: [], entries: [] }
  assert.equal(shape(merge(here, there, NOW)), 'Morning run Read')
})

test('a card taken out of its group on the other device, later, comes out here too', () => {
  const here: Snapshot = { trackers: [habit('run', { groupId: 'morning', updatedAt: 10 })], groups: [group('morning', { updatedAt: 10 })], entries: [] }
  const there: Snapshot = { trackers: [habit('run', { updatedAt: 20 })], groups: [], entries: [] }
  const merged = merge(here, there, NOW)
  assert.equal(shape(merged), 'run')
  assert.deepEqual(merged.groups, [], 'the group, left empty, is gone')
})

test('each tracker in a merge knows where it came from', () => {
  const here: Snapshot = { trackers: [habit('run'), habit('read')], groups: [], entries: [] }
  const there: Snapshot = { trackers: [habit('run'), habit('swim')], groups: [], entries: [] }
  assert.deepEqual(['run', 'read', 'swim'].map((id) => originOf(id, here, there)), ['both', 'here', 'file'])
})

test('trackers deleted in the review go with their stages and everything logged for them', () => {
  const merged: Snapshot = {
    trackers: [
      { id: 'workout', name: 'workout', createdAt: 0, updatedAt: 0, order: 0, kind: 'staged' },
      habit('squats', { parent: { id: 'workout', since: 0 } }),
      habit('read', { order: 1 }),
      habit('swim', { order: 2 }),
    ],
    groups: [],
    entries: [done('e1', 'squats'), done('e2', 'read'), done('e3', 'swim')],
  }
  const kept = without(merged, ['workout', 'swim'], NOW)
  assert.equal(shape(kept), 'read')
  assert.deepEqual(kept.entries.map((e) => e.id), ['e2'])
})
