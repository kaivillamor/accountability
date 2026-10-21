/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { after, arrange, dissolve, move, nextOrder, remove, tidy, withChange, type Card, type Destination } from './arrange.ts'
import type { Change, Group, Tracker } from './model.ts'

const EARLIER = 1_000
const NOW = 2_000

type Place = { groupId?: string; parent?: { id: string; since: number } }

const habit = (id: string, order: number, place: Place = {}): Tracker => ({ id, name: id, createdAt: 0, updatedAt: 0, order, kind: 'habit', ...place })
const water = (order: number, place: Place = {}): Tracker => ({ id: 'water', name: 'water', createdAt: 0, updatedAt: 0, order, kind: 'usage', unit: 'ounces', ...place })
const staged = (id: string, order: number, place: Place = {}): Tracker => ({ id, name: id, createdAt: 0, updatedAt: 0, order, kind: 'staged', ...place })
const group = (id: string, order: number): Group => ({ id, name: id, createdAt: 0, updatedAt: 0, order, collapsed: false })
const stageOf = (parent: string): Place => ({ parent: { id: parent, since: EARLIER } })

type State = { trackers: Tracker[]; groups: Group[] }

function applied(state: State, change: Change): State {
  return {
    trackers: withChange(state.trackers, change.putTrackers, change.deleteTrackerIds),
    groups: withChange(state.groups, change.putGroups, change.deleteGroupIds),
  }
}

// The page as one line: groups as name[...], staged habits as name(stages).
function shape({ trackers, groups }: State): string {
  const card = ({ tracker, stages }: Card) =>
    stages.length > 0 ? `${tracker.name}(${stages.map((s) => s.name).join(' ')})` : tracker.name
  return arrange(trackers, groups)
    .map((item) => (item.type === 'group' ? `${item.group.name}[${item.cards.map(card).join(' ')}]` : card(item.card)))
    .join(' ')
}

function moved(state: State, id: string, to: Destination): State & { change: Change; created?: string } {
  const { change, created } = move(state.trackers, state.groups, id, to, NOW)
  return { ...applied(state, change), change, created }
}

// Every list numbered 0, 1, 2… in page order.
function assertNumbered({ trackers, groups }: State): void {
  const lists = new Map<string, number[]>()
  for (const record of [...groups, ...trackers]) {
    const key = 'kind' in record ? (record.parent?.id ?? record.groupId ?? 'top') : 'top'
    lists.set(key, [...(lists.get(key) ?? []), record.order])
  }
  for (const orders of lists.values()) assert.deepEqual(orders.toSorted((a, b) => a - b), orders.map((_, i) => i))
}

test('arrange lists groups and lone cards by order, with each group’s cards and each staged habit’s stages', () => {
  const state = {
    trackers: [
      habit('read', 2),
      habit('run', 1, { groupId: 'morning' }),
      habit('stretch', 0, { groupId: 'morning' }),
      staged('workout', 1),
      habit('pushups', 1, stageOf('workout')),
      habit('squats', 0, stageOf('workout')),
    ],
    groups: [group('morning', 0)],
  }
  assert.equal(shape(state), 'morning[stretch run] workout(squats pushups) read')
})

test('a card dropped beside a lone card makes a new group in its place', () => {
  const start = { trackers: [habit('run', 0), habit('read', 1), water(2)], groups: [] }
  const below = moved(start, 'water', { type: 'beside', id: 'run', after: true })
  assert.equal(shape(below), 'New group[run water] read')
  assert.ok(below.groups.some((g) => g.id === below.created), 'reports the new group, to be named')
  assert.equal(shape(moved(start, 'water', { type: 'beside', id: 'read', after: false })), 'run New group[water read]')
  assertNumbered(below)
})

test('a card dropped beside a grouped card joins that group next to it', () => {
  const start = { trackers: [habit('run', 0, { groupId: 'morning' }), habit('read', 1, { groupId: 'morning' }), water(1)], groups: [group('morning', 0)] }
  const result = moved(start, 'water', { type: 'beside', id: 'run', after: true })
  assert.equal(shape(result), 'morning[run water read]')
  assert.equal(result.created, undefined)
  assertNumbered(result)
})

test('moving a card within its group only reorders the group', () => {
  const start = { trackers: [habit('run', 0, { groupId: 'morning' }), habit('read', 1, { groupId: 'morning' })], groups: [group('morning', 0)] }
  const result = moved(start, 'run', { type: 'beside', id: 'read', after: true })
  assert.equal(shape(result), 'morning[read run]')
  assert.deepEqual(result.change.putGroups, [])
})

test('a habit dropped into a lone habit makes a staged habit in its place, with both as stages from now', () => {
  const start = { trackers: [habit('read', 0), habit('run', 1), habit('pushups', 2)], groups: [] }
  const result = moved(start, 'pushups', { type: 'into', id: 'run' })
  assert.equal(shape(result), 'read run + pushups(run pushups)')
  const created = result.trackers.find((t) => t.id === result.created)!
  assert.equal(created.kind, 'staged')
  assert.deepEqual(
    result.trackers.filter((t) => t.parent).map((t) => [t.id, t.parent]),
    [
      ['run', { id: created.id, since: NOW }],
      ['pushups', { id: created.id, since: NOW }],
    ],
  )
})

test('a staged habit made inside a group stays in that group', () => {
  const start = { trackers: [habit('run', 0, { groupId: 'morning' }), habit('pushups', 1, { groupId: 'morning' })], groups: [group('morning', 0)] }
  assert.equal(shape(moved(start, 'pushups', { type: 'into', id: 'run' })), 'morning[run + pushups(run pushups)]')
})

test('a habit dropped into a staged habit becomes its last stage, and the other stages keep their start', () => {
  const start = { trackers: [staged('workout', 0), habit('run', 0, stageOf('workout')), habit('pushups', 1)], groups: [] }
  const result = moved(start, 'pushups', { type: 'into', id: 'workout' })
  assert.equal(shape(result), 'workout(run pushups)')
  assert.deepEqual(result.trackers.find((t) => t.id === 'pushups')!.parent, { id: 'workout', since: NOW })
  assert.ok(!result.change.putTrackers.some((t) => t.id === 'run'), 'run is unchanged')
})

test('a habit dropped beside a stage joins the stages at that spot', () => {
  const start = { trackers: [staged('workout', 0), habit('run', 0, stageOf('workout')), habit('squats', 1, stageOf('workout')), habit('pushups', 1)], groups: [] }
  assert.equal(shape(moved(start, 'pushups', { type: 'beside', id: 'squats', after: false })), 'workout(run pushups squats)')
})

test('reordering stages keeps when each stage joined', () => {
  const start = { trackers: [staged('workout', 0), habit('run', 0, stageOf('workout')), habit('squats', 1, stageOf('workout'))], groups: [] }
  const result = moved(start, 'run', { type: 'beside', id: 'squats', after: true })
  assert.equal(shape(result), 'workout(squats run)')
  assert.ok(result.trackers.every((t) => t.parent === undefined || t.parent.since === EARLIER))
})

test('taking the last card out of a group deletes the group', () => {
  const start = { trackers: [habit('run', 0, { groupId: 'morning' }), habit('read', 1)], groups: [group('morning', 0)] }
  const result = moved(start, 'run', { type: 'list', index: 2 })
  assert.equal(shape(result), 'read run')
  assert.deepEqual(result.change.deleteGroupIds, ['morning'])
  assert.equal(result.trackers.find((t) => t.id === 'run')!.groupId, undefined)
})

test('taking the last stage out deletes the staged habit, and a group it leaves empty', () => {
  const start = {
    trackers: [staged('workout', 0, { groupId: 'morning' }), habit('run', 0, stageOf('workout')), habit('read', 1)],
    groups: [group('morning', 0)],
  }
  const result = moved(start, 'run', { type: 'list' })
  assert.equal(shape(result), 'read run')
  assert.deepEqual([result.change.deleteTrackerIds, result.change.deleteGroupIds], [['workout'], ['morning']])
  assert.equal(result.trackers.find((t) => t.id === 'run')!.parent, undefined)
  assertNumbered(result)
})

test('a stage moved into a group leaves its staged habit and joins the group', () => {
  const start = {
    trackers: [staged('workout', 1), habit('run', 0, stageOf('workout')), habit('squats', 1, stageOf('workout')), water(0, { groupId: 'morning' })],
    groups: [group('morning', 0)],
  }
  const result = moved(start, 'squats', { type: 'list', groupId: 'morning', index: 0 })
  assert.equal(shape(result), 'morning[squats water] workout(run)')
  const squats = result.trackers.find((t) => t.id === 'squats')!
  assert.deepEqual([squats.groupId, squats.parent], ['morning', undefined])
})

test('a staged habit moves into a group with its stages', () => {
  const start = { trackers: [staged('workout', 0), habit('run', 0, stageOf('workout')), water(0, { groupId: 'morning' })], groups: [group('morning', 1)] }
  const result = moved(start, 'workout', { type: 'beside', id: 'water', after: true })
  assert.equal(shape(result), 'morning[water workout(run)]')
  assert.deepEqual(
    result.change.putTrackers.map((t) => t.id),
    ['workout'],
    'only the staged habit itself is written',
  )
})

test('a group moves within the top level', () => {
  const start = { trackers: [habit('read', 0), habit('run', 0, { groupId: 'morning' })], groups: [group('morning', 1)] }
  const result = moved(start, 'morning', { type: 'list', index: 0 })
  assert.equal(shape(result), 'morning[run] read')
  assertNumbered(result)
})

test('removing a staged habit removes its stages, and a group it leaves empty', () => {
  const start = {
    trackers: [staged('workout', 0, { groupId: 'morning' }), habit('run', 0, stageOf('workout')), habit('squats', 1, stageOf('workout')), habit('read', 1)],
    groups: [group('morning', 0)],
  }
  const change = remove(start.trackers, start.groups, 'workout', NOW)
  assert.deepEqual(change.deleteTrackerIds.toSorted(), ['run', 'squats', 'workout'])
  assert.deepEqual(change.deleteGroupIds, ['morning'])
  assert.equal(shape(applied(start, change)), 'read')
  assertNumbered(applied(start, change))
})

test('removing a stage keeps the others in order', () => {
  const start = { trackers: [staged('workout', 0), habit('run', 0, stageOf('workout')), habit('squats', 1, stageOf('workout')), habit('lunges', 2, stageOf('workout'))], groups: [] }
  const result = applied(start, remove(start.trackers, start.groups, 'squats', NOW))
  assert.equal(shape(result), 'workout(run lunges)')
  assertNumbered(result)
})

test('ungrouping puts the group’s cards in its place', () => {
  const start = {
    trackers: [habit('read', 0), habit('run', 0, { groupId: 'morning' }), water(1, { groupId: 'morning' }), habit('stretch', 2)],
    groups: [group('morning', 1)],
  }
  const result = applied(start, dissolve(start.trackers, start.groups, 'morning', NOW))
  assert.equal(shape(result), 'read run water stretch')
  assert.deepEqual(result.groups, [])
  assertNumbered(result)
})

test('separating a staged habit makes its stages habits of their own, in its place and group', () => {
  const start = { trackers: [staged('workout', 0, { groupId: 'morning' }), habit('run', 0, stageOf('workout')), habit('squats', 1, stageOf('workout'))], groups: [group('morning', 0)] }
  const result = applied(start, dissolve(start.trackers, start.groups, 'workout', NOW))
  assert.equal(shape(result), 'morning[run squats]')
  assert.ok(result.trackers.every((t) => t.kind === 'habit' && t.parent === undefined && t.groupId === 'morning'))
})

test('after points just past a group or a grouped card', () => {
  const state = { trackers: [habit('read', 0), habit('run', 0, { groupId: 'morning' }), habit('stretch', 1, { groupId: 'morning' })], groups: [group('morning', 1)] }
  assert.deepEqual(after(state.trackers, state.groups, 'morning'), { type: 'list', index: 2 })
  assert.deepEqual(after(state.trackers, state.groups, 'run'), { type: 'list', groupId: 'morning', index: 1 })
})

test('a new tracker goes last at the top level', () => {
  const trackers = [habit('read', 0), habit('run', 0, { groupId: 'morning' }), staged('workout', 2), habit('squats', 0, stageOf('workout'))]
  assert.equal(nextOrder(trackers, [group('morning', 1)]), 3)
  assert.equal(nextOrder([], []), 0)
})

test('tidying moves a card whose group is gone to the top level, and a stage whose habit is gone out on its own', () => {
  const trackers = [habit('run', 0, { groupId: 'gone' }), habit('squats', 0, stageOf('gone too')), habit('read', 1)]
  const result = tidy(trackers, [], NOW)
  assert.equal(shape(result), 'run squats read')
  const squats = result.trackers.find((t) => t.id === 'squats')!
  assert.deepEqual([squats.parent, squats.updatedAt], [undefined, NOW])
  assertNumbered(result)
})

test('tidying deletes groups and multi-stage habits left empty', () => {
  const result = tidy([staged('workout', 1), habit('read', 2)], [group('morning', 0)], NOW)
  assert.equal(shape(result), 'read')
  assert.deepEqual([result.trackers.map((t) => t.id), result.groups], [['read'], []])
})

test('tidying puts the older of two cards with the same position first', () => {
  const older = { ...habit('run', 0), createdAt: 1 }
  const newer = { ...habit('read', 0), createdAt: 2 }
  const result = tidy([newer, older], [], NOW)
  assert.equal(shape(result), 'run read')
  assertNumbered(result)
})

test('tidying leaves a consistent arrangement as it is', () => {
  const trackers = [habit('run', 0, { groupId: 'morning' }), staged('workout', 1), habit('squats', 0, stageOf('workout'))]
  const result = tidy(trackers, [group('morning', 0)], NOW)
  assert.deepEqual(result, { trackers, groups: [group('morning', 0)] })
})
