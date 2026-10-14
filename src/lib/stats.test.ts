/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Entry, Tracker } from './model.ts'
import { daysWithout, habitStreak, resistedCount, usedToday } from './stats.ts'
import { inEachTimeZone } from './time-zones.testing.ts'

// October 2026, local time in the zone under test.
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

function quitTracker(): Tracker {
  return { id: 't', name: 'Smoking', createdAt: time(1, 12), kind: 'quit' }
}

inEachTimeZone(() => {
  test('habit streak counts days in a row up to today', () => {
    assert.equal(habitStreak([done(time(11, 9)), done(time(12, 9)), done(time(13, 9))], time(13, 20)), 3)
  })

  test('habit streak carries over from yesterday until today is done', () => {
    assert.equal(habitStreak([done(time(11, 9)), done(time(12, 9))], time(13, 20)), 2)
  })

  test('habit streak resets after a missed day', () => {
    assert.equal(habitStreak([done(time(10, 9)), done(time(11, 9))], time(13, 20)), 0)
  })

  test('habit streak counts a day once, however often it was done', () => {
    assert.equal(habitStreak([done(time(13, 8)), done(time(13, 18))], time(13, 20)), 1)
  })

  test('habit streak uses local days, not UTC days', () => {
    // Late on the 11th and early on the 12th are two local days, though in many zones they share a UTC day.
    assert.equal(habitStreak([done(time(11, 22)), done(time(12, 8))], time(12, 9)), 2)
  })

  test('habit streak holds across daylight-saving changes', () => {
    // Just after midnight every day from September 25 to November 5, 2026, which spans
    // Sydney's clock change (October 4), Europe's (October 25) and the US's (November 1).
    const entries = Array.from({ length: 42 }, (_, i) => done(new Date(2026, 8, 25 + i, 0, 30).getTime()))
    assert.equal(habitStreak(entries, new Date(2026, 10, 5, 23, 30).getTime()), 42)
  })

  test('days without counts from tracking start when there are no slips', () => {
    assert.equal(daysWithout(quitTracker(), [], time(13, 12)), 12)
  })

  test('days without counts whole days since the latest slip', () => {
    assert.equal(daysWithout(quitTracker(), [slipped(time(5, 12)), slipped(time(10, 12))], time(13, 12)), 3)
  })

  test('days without is 0 within a day of a slip', () => {
    assert.equal(daysWithout(quitTracker(), [slipped(time(12, 20))], time(13, 16)), 0)
  })

  test('days without holds across daylight-saving changes', () => {
    // From October 2 to November 5, 2026: through Sydney's, Europe's and the US's clock changes.
    assert.equal(daysWithout(quitTracker(), [slipped(time(2, 12))], new Date(2026, 10, 5, 12).getTime()), 34)
  })

  test('days without ignores resisted entries', () => {
    assert.equal(daysWithout(quitTracker(), [slipped(time(10, 12)), resisted(time(12, 12))], time(13, 12)), 3)
  })

  test('resisted count counts only resisted entries', () => {
    assert.equal(resistedCount([resisted(time(11, 12)), resisted(time(12, 12)), slipped(time(12, 13))]), 2)
  })

  test('used today sums only today’s amounts', () => {
    assert.equal(usedToday([used(time(13, 8), 2), used(time(13, 15), 1.5), used(time(12, 9), 5)], time(13, 20)), 3.5)
  })
})
