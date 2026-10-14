/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activity, type ActivityDay } from './activity.ts'
import { dayOf, weekday } from './days.ts'
import type { Entry } from './model.ts'

// October 2026, local time. `npm test` pins the time zone so results match on every machine.
function time(date: number, hour: number): number {
  return new Date(2026, 9, date, hour).getTime()
}

function entry(trackerId: string, at: number): { id: string; trackerId: string; at: number } {
  return { id: crypto.randomUUID(), trackerId, at }
}
const done = (trackerId: string, at: number): Entry => ({ ...entry(trackerId, at), kind: 'done' })
const used = (trackerId: string, at: number, amount: number): Entry => ({ ...entry(trackerId, at), kind: 'used', amount })
const slipped = (trackerId: string, at: number): Entry => ({ ...entry(trackerId, at), kind: 'slipped' })
const resisted = (trackerId: string, at: number): Entry => ({ ...entry(trackerId, at), kind: 'resisted' })

// Wednesday, October 14, 2026.
const now = time(14, 20)

function on(columns: ActivityDay[][], date: number): ActivityDay {
  const found = columns.flat().find((d) => d.day === dayOf(time(date, 12)))
  assert.ok(found, `October ${date} is shown`)
  return found
}

test('activity shows whole weeks from a Sunday through today', () => {
  const columns = activity([], now, 53)
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
    now,
    53,
  )
  assert.deepEqual([on(columns, 14).count, on(columns, 14).entries.length], [3, 3])
  assert.equal(on(columns, 13).count, 1)
})

test('levels are relative to the busiest day', () => {
  const columns = activity([done('run', time(14, 8)), done('run', time(14, 18)), done('run', time(13, 8))], now, 53)
  assert.deepEqual([on(columns, 14).level, on(columns, 13).level, on(columns, 12).level], [4, 2, 0])
})

test('a slip flags the day without adding activity', () => {
  const columns = activity([slipped('smoking', time(12, 22)), resisted('smoking', time(12, 9))], now, 53)
  assert.deepEqual([on(columns, 12).slipped, on(columns, 12).count, on(columns, 12).entries.length], [true, 1, 2])
})

test('entries older than the weeks shown are left out', () => {
  const columns = activity([done('run', new Date(2025, 0, 1, 12).getTime())], now, 53)
  assert.ok(columns.flat().every((d) => d.entries.length === 0))
})
