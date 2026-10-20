/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayOf } from './days.ts'
import type { Entry, Tracker } from './model.ts'
import {
  bestStreak,
  completeDays,
  dailyAverage,
  daysWithout,
  doneCount,
  doneToday,
  goalStreak,
  habitStreak,
  longestStretch,
  resistedCount,
  slipCount,
  stagedBest,
  stagedStreak,
  usedToday,
  usedTotal,
} from './stats.ts'
import { inEachTimeZone } from './time-zones.testing.ts'

// October 2026, local time in the zone under test.
function time(date: number, hour: number): number {
  return new Date(2026, 9, date, hour).getTime()
}

function entry(at: number, trackerId = 't'): { id: string; trackerId: string; at: number } {
  return { id: crypto.randomUUID(), trackerId, at }
}
const done = (at: number, trackerId?: string): Entry => ({ ...entry(at, trackerId), kind: 'done' })
const used = (at: number, amount: number): Entry => ({ ...entry(at), kind: 'used', amount })
const slipped = (at: number): Entry => ({ ...entry(at), kind: 'slipped' })
const resisted = (at: number): Entry => ({ ...entry(at), kind: 'resisted' })

function quitTracker(): Tracker {
  return { id: 't', name: 'Smoking', createdAt: time(1, 12), order: 0, kind: 'quit' }
}

// A stage of the staged habit "workout" that joined at `since`.
function stage(id: string, since: number): Tracker {
  return { id, name: id, createdAt: time(1, 12), order: 0, kind: 'habit', parent: { id: 'workout', since } }
}

function workout(): Tracker {
  return { id: 'workout', name: 'Workout', createdAt: time(10, 8), order: 0, kind: 'staged' }
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

  test('done count counts every done entry', () => {
    assert.equal(doneCount([done(time(12, 8)), done(time(12, 18)), done(time(13, 8)), slipped(time(13, 9))]), 3)
  })

  test('best streak finds the longest run, even one that has ended', () => {
    const entries = [1, 2, 3, 5, 6].map((date) => done(time(date, 9)))
    assert.equal(bestStreak(entries), 3)
  })

  test('best streak counts a day once and is 0 with nothing done', () => {
    assert.equal(bestStreak([done(time(4, 8)), done(time(4, 20)), done(time(5, 8))]), 2)
    assert.equal(bestStreak([]), 0)
  })

  test('best streak holds across daylight-saving changes', () => {
    const entries = Array.from({ length: 42 }, (_, i) => done(new Date(2026, 8, 25 + i, 0, 30).getTime()))
    assert.equal(bestStreak(entries), 42)
  })

  test('used total sums every amount', () => {
    assert.equal(usedTotal([used(time(1, 8), 2), used(time(5, 8), 1.5), used(time(13, 9), 0.5)]), 4)
  })

  test('daily average spreads the total over every day since tracking started, today included', () => {
    const coffee: Tracker = { id: 't', name: 'Coffee', createdAt: time(1, 8), order: 0, kind: 'usage', unit: 'cups' }
    assert.equal(dailyAverage(coffee, [used(time(3, 8), 6), used(time(12, 8), 6)], time(12, 20)), 1)
  })

  test('slip count counts only slips', () => {
    assert.equal(slipCount([slipped(time(5, 12)), resisted(time(6, 12)), slipped(time(9, 12))]), 2)
  })

  test('longest stretch is the longest gap between start, slips and now', () => {
    const entries = [slipped(time(5, 12)), slipped(time(15, 12))]
    assert.equal(longestStretch(quitTracker(), entries, time(20, 12)), 10)
  })

  test('goal streak counts days in a row that reached the goal, adding up each day', () => {
    const entries = [used(time(11, 9), 64), used(time(12, 9), 40), used(time(12, 15), 30), used(time(13, 9), 64)]
    assert.equal(goalStreak(64, entries, time(13, 20)), 3)
  })

  test('goal streak breaks on a day under the goal', () => {
    const entries = [used(time(11, 9), 64), used(time(12, 9), 50), used(time(13, 9), 64)]
    assert.equal(goalStreak(64, entries, time(13, 20)), 1)
  })

  test('goal streak carries over from yesterday until today reaches the goal', () => {
    assert.equal(goalStreak(64, [used(time(12, 9), 64), used(time(13, 9), 10)], time(13, 20)), 1)
  })

  test('longest stretch without slips runs from tracking start to now', () => {
    assert.equal(longestStretch(quitTracker(), [], time(13, 12)), 12)
  })

  test('a staged habit is complete on the days every stage was done', () => {
    const stages = [stage('run', time(10, 8)), stage('squats', time(10, 8))]
    const entries = [done(time(10, 7), 'run'), done(time(10, 19), 'squats'), done(time(11, 7), 'run'), done(time(12, 7), 'run'), done(time(12, 21), 'squats')]
    assert.deepEqual(completeDays(stages, entries), [10, 12].map((date) => dayOf(time(date, 12))))
    assert.equal(stagedStreak(stages, entries, time(12, 22)), 1)
    assert.equal(stagedBest(stages, entries), 1)
  })

  test('a stage counts from the day it joined, so adding one keeps the streak so far', () => {
    const stages = [stage('run', time(10, 8)), stage('squats', time(12, 18))]
    const entries = [done(time(10, 7), 'run'), done(time(11, 7), 'run'), done(time(12, 7), 'run'), done(time(12, 19), 'squats')]
    assert.equal(stagedStreak(stages, entries, time(12, 22)), 3)
    // Until squats is done on the day it joined, that day isn't complete and the streak carries over.
    assert.equal(stagedStreak(stages, entries.slice(0, 3), time(12, 22)), 2)
  })

  test('days before any stage joined don’t count toward a staged habit', () => {
    const entries = [done(time(10, 7), 'run'), done(time(11, 7), 'run'), done(time(12, 7), 'run')]
    assert.deepEqual(completeDays([stage('run', time(12, 6))], entries), [dayOf(time(12, 12))])
  })

  test('a staged habit streak carries over from yesterday until every stage is done today', () => {
    const stages = [stage('run', time(10, 8)), stage('squats', time(10, 8))]
    const entries = [10, 11].flatMap((date) => [done(time(date, 9), 'run'), done(time(date, 18), 'squats')])
    assert.equal(stagedStreak(stages, [...entries, done(time(12, 7), 'run')], time(12, 9)), 2)
    assert.equal(stagedStreak(stages, [...entries, done(time(12, 7), 'run'), done(time(12, 8), 'squats')], time(12, 9)), 3)
  })

  test('done today means a habit done, every stage done, a goal reached or no slip', () => {
    const now = time(13, 20)
    const run: Tracker = { id: 't', name: 'Run', createdAt: time(1, 8), order: 0, kind: 'habit' }
    assert.equal(doneToday(run, [], [done(time(13, 8))], now), true)
    assert.equal(doneToday(run, [], [done(time(12, 8))], now), false)

    const stages = [stage('run', time(10, 8)), stage('squats', time(10, 8))]
    assert.equal(doneToday(workout(), stages, [done(time(13, 7), 'run')], now), false)
    assert.equal(doneToday(workout(), stages, [done(time(13, 7), 'run'), done(time(13, 9), 'squats')], now), true)

    const water: Tracker = { id: 't', name: 'Water', createdAt: time(1, 8), order: 0, kind: 'usage', unit: 'ounces', dailyGoal: 64 }
    assert.equal(doneToday(water, [], [used(time(13, 8), 40), used(time(12, 8), 40)], now), false)
    assert.equal(doneToday(water, [], [used(time(13, 8), 40), used(time(13, 12), 24)], now), true)
    const coffee: Tracker = { id: 't', name: 'Coffee', createdAt: time(1, 8), order: 0, kind: 'usage', unit: 'cups' }
    assert.equal(doneToday(coffee, [], [used(time(13, 8), 1)], now), true)
    assert.equal(doneToday(coffee, [], [], now), false)

    assert.equal(doneToday(quitTracker(), [], [slipped(time(12, 22))], now), true)
    assert.equal(doneToday(quitTracker(), [], [slipped(time(13, 1))], now), false)
  })
})
