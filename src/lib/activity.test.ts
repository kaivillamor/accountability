/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activity, type ActivityDay } from './activity.ts'
import { dayOf, weekday } from './days.ts'
import type { Entry, Tracker } from './model.ts'

// October 2026, local time. `npm test` pins the time zone so results match on every machine.
function time(date: number, hour: number): number {
  return new Date(2026, 9, date, hour).getTime()
}

function entry(at: number): { id: string; trackerId: string; at: number } {
  return { id: crypto.randomUUID(), trackerId: 't', at }
}
const done = (at: number): Entry => ({ ...entry(at), kind: 'done' })
const used = (at: number, amount: number): Entry => ({ ...entry(at), kind: 'used', amount })
const slipped = (at: number): Entry => ({ ...entry(at), kind: 'slipped' })
const resisted = (at: number): Entry => ({ ...entry(at), kind: 'resisted' })

const habit: Tracker = { id: 't', name: 'Run', createdAt: time(1, 9), kind: 'habit' }
const usage: Tracker = { id: 't', name: 'Coffee', createdAt: time(1, 9), kind: 'usage', unit: 'cups' }
const quit: Tracker = { id: 't', name: 'Smoking', createdAt: time(1, 9), kind: 'quit' }

// Wednesday, October 14, 2026.
const now = time(14, 20)

function on(columns: ActivityDay[][], date: number): ActivityDay {
  const found = columns.flat().find((d) => d.day === dayOf(time(date, 12)))
  assert.ok(found, `October ${date} is shown`)
  return found
}

test('activity shows whole weeks from a Sunday through today', () => {
  const columns = activity(habit, [], now, 53)
  assert.equal(columns.length, 53)
  assert.equal(weekday(columns[0][0].day), 0)
  assert.ok(columns.slice(0, -1).every((column) => column.length === 7))
  assert.deepEqual(
    columns[52].map((d) => d.day),
    [11, 12, 13, 14].map((date) => dayOf(time(date, 12))),
  )
})

test('habit days count each time done, with levels relative to the busiest day', () => {
  const columns = activity(habit, [done(time(14, 8)), done(time(14, 18)), done(time(13, 8))], now, 53)
  assert.deepEqual([on(columns, 14).value, on(columns, 14).level], [2, 4])
  assert.deepEqual([on(columns, 13).value, on(columns, 13).level], [1, 2])
  assert.deepEqual([on(columns, 12).value, on(columns, 12).level], [0, 0])
})

test('usage days add up amounts', () => {
  const columns = activity(usage, [used(time(14, 8), 1.5), used(time(14, 15), 2)], now, 53)
  assert.equal(on(columns, 14).value, 3.5)
})

test('quit days count resisted entries and flag slips', () => {
  const columns = activity(quit, [resisted(time(13, 9)), resisted(time(13, 21)), slipped(time(12, 22))], now, 53)
  assert.deepEqual([on(columns, 13).value, on(columns, 13).slipped], [2, false])
  assert.deepEqual([on(columns, 12).value, on(columns, 12).slipped], [0, true])
})

test('days before the tracker started are not tracked', () => {
  const columns = activity({ ...habit, createdAt: time(10, 9) }, [], now, 53)
  assert.equal(on(columns, 9).tracked, false)
  assert.equal(on(columns, 10).tracked, true)
})

test('entries older than the weeks shown are left out', () => {
  const columns = activity(habit, [done(new Date(2025, 0, 1, 12).getTime())], now, 53)
  assert.ok(columns.flat().every((d) => d.value === 0))
})
