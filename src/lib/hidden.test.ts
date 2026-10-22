/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrange } from './arrange.ts'
import { PIN, hide, unhide, waitAfter, waitText } from './hidden.ts'
import { EMPTY, type Entry, type Group, type Snapshot, type Tracker } from './model.ts'

const NOW = 5_000
type Place = { groupId?: string; parent?: { id: string; since: number } }
const habit = (id: string, order: number, place: Place = {}): Tracker => ({ id, name: id, createdAt: 0, updatedAt: 0, order, kind: 'habit', ...place })
const staged = (id: string, order: number): Tracker => ({ id, name: id, createdAt: 0, updatedAt: 0, order, kind: 'staged' })
const group = (id: string, order: number): Group => ({ id, name: id, createdAt: 0, updatedAt: 0, order, collapsed: false })
const done = (id: string, trackerId: string): Entry => ({ id, trackerId, at: 1_000, kind: 'done' })

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

test('hiding moves a card and everything logged for it out of sight, last among the hidden', () => {
  const shown: Snapshot = { trackers: [habit('run', 0), habit('diary', 1), habit('read', 2)], groups: [], entries: [done('e1', 'run'), done('e2', 'diary')] }
  const hidden: Snapshot = { trackers: [habit('secret', 0)], groups: [], entries: [done('e3', 'secret')] }
  const moved = hide(shown, hidden, 'diary', NOW)
  assert.deepEqual([shape(moved.shown), shape(moved.hidden)], ['run read', 'secret diary'])
  assert.deepEqual([moved.shown.entries.map((e) => e.id), moved.hidden.entries.map((e) => e.id)], [['e1'], ['e3', 'e2']])
  assert.deepEqual(moved.change.deleteTrackerIds, ['diary'], 'deleting it from the shown data deletes its entries there too')
  assert.equal(moved.hidden.trackers.find((t) => t.id === 'diary')!.updatedAt, NOW)
})

test('a hidden card leaves its group, and a group left empty goes', () => {
  const shown: Snapshot = { trackers: [habit('diary', 0, { groupId: 'evening' }), habit('run', 1)], groups: [group('evening', 0)], entries: [] }
  const moved = hide(shown, EMPTY, 'diary', NOW)
  assert.equal(shape(moved.shown), 'run')
  assert.deepEqual(moved.change.deleteGroupIds, ['evening'])
  assert.equal(moved.hidden.trackers[0].groupId, undefined)
})

test('a multi-stage habit hides with its stages', () => {
  const shown: Snapshot = {
    trackers: [staged('workout', 0), habit('squats', 0, { parent: { id: 'workout', since: 0 } }), habit('read', 1)],
    groups: [],
    entries: [done('e1', 'squats')],
  }
  const moved = hide(shown, EMPTY, 'workout', NOW)
  assert.deepEqual([shape(moved.shown), shape(moved.hidden)], ['read', 'workout(squats)'])
  assert.deepEqual(moved.change.deleteTrackerIds.toSorted(), ['squats', 'workout'])
  assert.deepEqual(moved.hidden.entries.map((e) => e.id), ['e1'])
})

test('unhiding brings a card back last at the top level, with its stages and entries', () => {
  const shown: Snapshot = { trackers: [habit('run', 0, { groupId: 'morning' }), habit('read', 1)], groups: [group('morning', 0)], entries: [] }
  const hidden: Snapshot = {
    trackers: [habit('diary', 0), staged('workout', 1), habit('squats', 0, { parent: { id: 'workout', since: 0 } })],
    groups: [],
    entries: [done('e1', 'squats'), done('e2', 'diary')],
  }
  const moved = unhide(shown, hidden, 'workout', NOW)
  assert.deepEqual([shape(moved.shown), shape(moved.hidden)], ['morning[run] read workout(squats)', 'diary'])
  assert.deepEqual(moved.change.putTrackers.map((t) => t.id).toSorted(), ['squats', 'workout'])
  assert.deepEqual([moved.entries.map((e) => e.id), moved.hidden.entries.map((e) => e.id)], [['e1'], ['e2']])
})

test('wrong PINs are free at first, then each waits twice as long, up to an hour', () => {
  assert.deepEqual([0, 4, 5, 6, 7, 12, 30].map(waitAfter), [0, 0, 30_000, 60_000, 120_000, 3_600_000, 3_600_000])
})

test('a wait reads in the largest whole unit, rounded up', () => {
  assert.deepEqual([1_000, 29_400, 60_000, 90_000, 3_600_000].map(waitText), ['1 second', '30 seconds', '1 minute', '2 minutes', '1 hour'])
})

test('a PIN is exactly 4 digits', () => {
  assert.deepEqual(['1234', '0000', '123', '12345', '12a4', ' 123'].map((pin) => PIN.test(pin)), [true, true, false, false, false, false])
})
