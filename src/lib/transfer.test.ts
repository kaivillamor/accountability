/// <reference types="node" />
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { arrange } from './arrange.ts'
import { EMPTY, type DeviceData, type Entry, type Group, type Snapshot, type Tracker } from './model.ts'
import { keyFor, seal, toBase64 } from './seal.ts'
import { lock, merge, originOf, unlock, without } from './transfer.ts'

const NOW = 5_000

type Rest = { updatedAt?: number; order?: number; groupId?: string; parent?: { id: string; since: number }; name?: string }
const habit = (id: string, rest: Rest = {}): Tracker => ({ id, name: id, createdAt: 0, updatedAt: 0, order: 0, kind: 'habit', ...rest })
const group = (id: string, rest: Rest = {}): Group => ({ id, name: id, createdAt: 0, updatedAt: 0, order: 0, collapsed: false, ...rest })
const done = (id: string, trackerId: string): Entry => ({ id, trackerId, at: 1_000, kind: 'done' })
const shown = (snapshot: Partial<Snapshot>): DeviceData => ({ shown: { ...EMPTY, ...snapshot }, hidden: EMPTY })

// A side as one line: groups as name[...], multi-stage habits as name(stages).
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

const data: DeviceData = {
  shown: {
    trackers: [
      habit('run', { groupId: 'morning' }),
      { id: 'water', name: 'Water', createdAt: 0, updatedAt: 0, order: 1, kind: 'usage', unit: 'ounces', dailyGoal: 64, quickAmounts: [8, 16] },
    ],
    groups: [group('morning')],
    entries: [done('e1', 'run'), { id: 'e2', trackerId: 'water', at: 1_000, kind: 'used', amount: 12.5 }],
  },
  hidden: { trackers: [habit('diary', { name: 'Diary' })], groups: [], entries: [done('e3', 'diary')] },
}

let file: string
before(async () => {
  file = await lock(data, 'correct horse battery')
})

test('a locked file opens with its passphrase and holds everything, hidden trackers too', async () => {
  assert.deepEqual(await unlock(file, 'correct horse battery'), data)
  assert.ok(!['Water', 'ounces', 'Diary'].some((word) => file.includes(word)), 'nothing readable without the passphrase')
})

test('the same data locks to a different file each time', async () => {
  assert.notEqual(await lock(data, 'correct horse battery'), file)
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
  await assert.rejects(unlock(JSON.stringify({ ...JSON.parse(file), format: 3 }), 'x'), {
    message: 'This file was made by a newer version of the app. Reload this page to update it, then try again.',
  })
})

test('a file from before hidden trackers opens with none hidden', async () => {
  const salt = new Uint8Array(16)
  const sealed = await seal(await keyFor('older file', salt), data.shown)
  const older = JSON.stringify({ app: 'accountability', format: 1, salt: toBase64(salt), iv: toBase64(sealed.iv), data: toBase64(sealed.data) })
  assert.deepEqual(await unlock(older, 'older file'), { shown: data.shown, hidden: EMPTY })
})

test('merging keeps everything logged on either device, once', () => {
  const here = shown({ trackers: [habit('run')], entries: [done('e1', 'run'), done('e2', 'run')] })
  const there = shown({ trackers: [habit('run'), habit('read', { order: 1 })], entries: [done('e2', 'run'), done('e3', 'read')] })
  const merged = merge(here, there, NOW)
  assert.deepEqual(merged.shown.entries.map((e) => e.id).toSorted(), ['e1', 'e2', 'e3'])
  assert.equal(shape(merged.shown), 'run read')
})

test('a tracker or group on both devices keeps its newer version', () => {
  const here = shown({ trackers: [habit('run', { name: 'Run', updatedAt: 10 }), habit('read', { order: 1, name: 'Read', updatedAt: 30 })] })
  const there = shown({ trackers: [habit('run', { name: 'Morning run', updatedAt: 20 }), habit('read', { order: 1, name: 'Reading', updatedAt: 25 })] })
  assert.equal(shape(merge(here, there, NOW).shown), 'Morning run Read')
})

test('quick amounts come with the newer version of their tracker', () => {
  const water = (updatedAt: number, quickAmounts: number[]): Tracker => ({ id: 'water', name: 'Water', createdAt: 0, updatedAt, order: 0, kind: 'usage', unit: 'ounces', quickAmounts })
  const amounts = (data: DeviceData) => data.shown.trackers.map((t) => t.kind === 'usage' && t.quickAmounts)
  assert.deepEqual(amounts(merge(shown({ trackers: [water(10, [8])] }), shown({ trackers: [water(20, [8, 16])] }), NOW)), [[8, 16]])
  assert.deepEqual(amounts(merge(shown({ trackers: [water(30, [12])] }), shown({ trackers: [water(20, [8, 16])] }), NOW)), [[12]])
})

test('a card taken out of its group on the other device, later, comes out here too', () => {
  const here = shown({ trackers: [habit('run', { groupId: 'morning', updatedAt: 10 })], groups: [group('morning', { updatedAt: 10 })] })
  const there = shown({ trackers: [habit('run', { updatedAt: 20 })] })
  const merged = merge(here, there, NOW)
  assert.equal(shape(merged.shown), 'run')
  assert.deepEqual(merged.shown.groups, [], 'the group, left empty, is gone')
})

test('a tracker hidden later on one device ends up hidden, with its stages and entries', () => {
  const workout: Tracker = { id: 'workout', name: 'workout', createdAt: 0, updatedAt: 10, order: 0, groupId: 'morning', kind: 'staged' }
  const squats = habit('squats', { parent: { id: 'workout', since: 0 } })
  const here = shown({ trackers: [workout, squats, habit('read', { order: 1 })], groups: [group('morning')], entries: [done('e1', 'squats'), done('e2', 'read')] })
  const there: DeviceData = {
    shown: { trackers: [habit('read', { order: 1 })], groups: [], entries: [] },
    hidden: { trackers: [{ ...workout, updatedAt: 20, groupId: undefined }, squats], groups: [], entries: [done('e3', 'squats')] },
  }
  const merged = merge(here, there, NOW)
  assert.equal(shape(merged.shown), 'read')
  assert.equal(shape(merged.hidden), 'workout(squats)')
  assert.deepEqual(merged.hidden.entries.map((e) => e.id).toSorted(), ['e1', 'e3'])
  assert.deepEqual(merged.shown.groups, [], 'the group it left, now empty, is gone')
})

test('a tracker brought back later on one device ends up shown', () => {
  const here: DeviceData = { shown: EMPTY, hidden: { trackers: [habit('diary', { updatedAt: 10 })], groups: [], entries: [done('e1', 'diary')] } }
  const there = shown({ trackers: [habit('diary', { updatedAt: 20 })] })
  const merged = merge(here, there, NOW)
  assert.deepEqual([shape(merged.shown), shape(merged.hidden), merged.shown.entries.length], ['diary', '', 1])
})

test('each tracker in a merge knows where it came from, hidden or not', () => {
  const here: DeviceData = { shown: { ...EMPTY, trackers: [habit('run')] }, hidden: { ...EMPTY, trackers: [habit('read')] } }
  const there: DeviceData = { shown: { ...EMPTY, trackers: [habit('swim')] }, hidden: { ...EMPTY, trackers: [habit('run')] } }
  assert.deepEqual(['run', 'read', 'swim'].map((id) => originOf(id, here, there)), ['both', 'here', 'file'])
})

test('trackers deleted in the review go with their stages and everything logged for them, on either side', () => {
  const merged: DeviceData = {
    shown: {
      trackers: [
        { id: 'workout', name: 'workout', createdAt: 0, updatedAt: 0, order: 0, kind: 'staged' },
        habit('squats', { parent: { id: 'workout', since: 0 } }),
        habit('read', { order: 1 }),
      ],
      groups: [],
      entries: [done('e1', 'squats'), done('e2', 'read')],
    },
    hidden: { trackers: [habit('diary'), habit('swim', { order: 1 })], groups: [], entries: [done('e3', 'diary'), done('e4', 'swim')] },
  }
  const kept = without(merged, ['workout', 'swim'], NOW)
  assert.deepEqual([shape(kept.shown), shape(kept.hidden)], ['read', 'diary'])
  assert.deepEqual([...kept.shown.entries, ...kept.hidden.entries].map((e) => e.id), ['e2', 'e3'])
})
