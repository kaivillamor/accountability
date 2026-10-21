/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activity, dayLines, type ActivityDay } from './activity.ts'
import type { Card } from './arrange.ts'
import { dayOf, weekday } from './days.ts'
import type { Entry, Tracker } from './model.ts'
import { inEachTimeZone } from './time-zones.testing.ts'

// October 2026, local time in the zone under test.
function time(date: number, hour: number): number {
  return new Date(2026, 9, date, hour).getTime()
}

// Wednesday, October 14, 2026.
function now(): number {
  return time(14, 20)
}

function entry(trackerId: string, at: number): { id: string; trackerId: string; at: number } {
  return { id: crypto.randomUUID(), trackerId, at }
}
const done = (trackerId: string, at: number): Entry => ({ ...entry(trackerId, at), kind: 'done' })
const used = (trackerId: string, at: number, amount: number): Entry => ({ ...entry(trackerId, at), kind: 'used', amount })
const slipped = (trackerId: string, at: number): Entry => ({ ...entry(trackerId, at), kind: 'slipped' })
const resisted = (trackerId: string, at: number): Entry => ({ ...entry(trackerId, at), kind: 'resisted' })

function on(columns: ActivityDay[][], date: number): ActivityDay {
  const found = columns.flat().find((d) => d.day === dayOf(time(date, 12)))
  assert.ok(found, `October ${date} is shown`)
  return found
}

inEachTimeZone(() => {
  test('activity shows whole weeks from a Sunday through today', () => {
    const columns = activity([], now(), 53)
    assert.equal(columns.length, 53)
    assert.equal(weekday(columns[0][0].day), 0)
    assert.ok(columns.slice(0, -1).every((column) => column.length === 7))
    assert.deepEqual(
      columns[52].map((d) => d.day),
      [11, 12, 13, 14].map((date) => dayOf(time(date, 12))),
    )
  })

  test('every entry except a slip counts once, across trackers', () => {
    const columns = activity(
      [done('run', time(14, 8)), used('coffee', time(14, 9), 3), resisted('smoking', time(14, 10)), done('run', time(13, 8))],
      now(),
      53,
    )
    assert.deepEqual([on(columns, 14).count, on(columns, 14).entries.length], [3, 3])
    assert.equal(on(columns, 13).count, 1)
  })

  test('each extra entry makes a quiet day one shade darker', () => {
    // A new user: one, two and three entries on three days.
    const entries = [
      done('run', time(14, 8)),
      ...[8, 18].map((hour) => done('run', time(13, hour))),
      ...[8, 12, 18].map((hour) => done('run', time(12, hour))),
    ]
    const columns = activity(entries, now(), 53)
    assert.deepEqual([on(columns, 14).level, on(columns, 13).level, on(columns, 12).level, on(columns, 11).level], [1, 2, 3, 0])
  })

  test('a single entry starts at the lightest shade', () => {
    assert.equal(on(activity([done('run', time(14, 8))], now(), 53), 14).level, 1)
  })

  test('busier days stretch the shades', () => {
    const entries = [
      ...[6, 8, 10, 12, 14, 16].map((hour) => done('run', time(14, hour))),
      ...[8, 12, 16].map((hour) => done('run', time(13, hour))),
      done('run', time(12, 8)),
    ]
    const columns = activity(entries, now(), 53)
    assert.deepEqual([on(columns, 14).level, on(columns, 13).level, on(columns, 12).level], [3, 2, 1])
  })

  test('a slip adds no activity to its day', () => {
    const columns = activity([slipped('smoking', time(12, 22)), resisted('smoking', time(12, 9))], now(), 53)
    assert.deepEqual([on(columns, 12).count, on(columns, 12).entries.length], [1, 2])
  })

  test('entries older than the weeks shown are left out', () => {
    const columns = activity([done('run', new Date(2025, 0, 1, 12).getTime())], now(), 53)
    assert.ok(columns.flat().every((d) => d.entries.length === 0))
  })

  test('a day’s lines name what each card logged, in card order', () => {
    const tracker = (id: string, rest: Partial<Tracker>): Tracker => ({ id, name: id, createdAt: time(1, 8), updatedAt: 0, order: 0, kind: 'habit', ...rest }) as Tracker
    const cards: Card[] = [
      { tracker: tracker('Water', { kind: 'usage', unit: 'ounces', dailyGoal: 64 }), stages: [] },
      { tracker: tracker('Run', {}), stages: [] },
      { tracker: tracker('Smoking', { kind: 'quit' }), stages: [] },
    ]
    const entries = [done('Run', time(14, 7)), used('Water', time(14, 8), 100), used('Water', time(14, 12), 44), slipped('Smoking', time(14, 22)), resisted('Smoking', time(14, 9))]
    assert.deepEqual(
      dayLines(cards, entries, dayOf(time(14, 12))).map((line) => [line.name, line.summary, line.goalMet, line.slipped]),
      [
        ['Water', '144 / 64 ounces', true, false],
        ['Run', 'Done', false, false],
        ['Smoking', 'Slipped, resisted 1 time', false, true],
      ],
    )
  })

  test('a quit tracker’s line counts as slipped only on a day it slipped', () => {
    const smoking: Card = { tracker: { id: 'Smoking', name: 'Smoking', createdAt: time(1, 8), updatedAt: 0, order: 0, kind: 'quit' }, stages: [] }
    const lines = (entries: Entry[], date: number) => dayLines([smoking], entries, dayOf(time(date, 12))).map((line) => line.slipped)
    assert.deepEqual(lines([resisted('Smoking', time(13, 9)), resisted('Smoking', time(13, 15))], 13), [false])
    assert.deepEqual(lines([slipped('Smoking', time(14, 22))], 14), [true])
  })

  test('a staged habit’s line counts its stages done that day', () => {
    const stage = (id: string, since: number): Tracker => ({ id, name: id, createdAt: time(1, 8), updatedAt: 0, order: 0, kind: 'habit', parent: { id: 'workout', since } })
    const card: Card = {
      tracker: { id: 'workout', name: 'Workout', createdAt: time(10, 8), updatedAt: 0, order: 0, kind: 'staged' },
      stages: [stage('run', time(10, 8)), stage('squats', time(10, 8)), stage('lunges', time(13, 8))],
    }
    const lines = (date: number, entries: Entry[]) => dayLines([card], entries, dayOf(time(date, 12))).map((line) => `${line.name}: ${line.summary}`)
    assert.deepEqual(lines(12, [done('run', time(12, 7))]), ['Workout: 1 of 2 stages'])
    assert.deepEqual(lines(12, [done('run', time(12, 7)), done('squats', time(12, 9))]), ['Workout: Done'])
    assert.deepEqual(lines(14, [done('lunges', time(14, 7))]), ['Workout: 1 of 3 stages'])
    assert.deepEqual(lines(11, []), [])
  })

  test('what a stage logged before it joined shows under its own name', () => {
    const card: Card = {
      tracker: { id: 'workout', name: 'Workout', createdAt: time(12, 8), updatedAt: 0, order: 0, kind: 'staged' },
      stages: [{ id: 'run', name: 'Run', createdAt: time(1, 8), updatedAt: 0, order: 0, kind: 'habit', parent: { id: 'workout', since: time(12, 8) } }],
    }
    assert.deepEqual(
      dayLines([card], [done('run', time(9, 7)), done('run', time(9, 18))], dayOf(time(9, 12))).map((line) => `${line.name}: ${line.summary}`),
      ['Run: Done 2 times'],
    )
  })
})
