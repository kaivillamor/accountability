import { dayOf, timeOfDay } from './days.ts'
import type { Entry, Tracker } from './model.ts'

// Whole days from one moment to another, by the local clock: a day passes at the same clock
// time it started, so a daylight-saving change can't shift the count.
function wholeDays(from: number, to: number): number {
  const days = dayOf(to) - dayOf(from)
  return timeOfDay(to) < timeOfDay(from) ? days - 1 : days
}

// The distinct local days with something done, oldest first.
function doneDays(entries: Entry[]): number[] {
  return [...new Set(entries.filter((e) => e.kind === 'done').map((e) => dayOf(e.at)))].toSorted((a, b) => a - b)
}

// Days in a row from the given set, ending today. Today counts once it's in the set, and
// until then the streak carries over from yesterday.
function streakOf(days: Set<number>, now: number): number {
  const today = dayOf(now)
  let current = days.has(today) ? today : today - 1
  let streak = 0
  while (days.has(current)) {
    streak += 1
    current -= 1
  }
  return streak
}

// Days in a row with something done.
export function habitStreak(entries: Entry[], now: number): number {
  return streakOf(new Set(doneDays(entries)), now)
}

// Days in a row on which the amounts used reached the daily goal.
export function goalStreak(goal: number, entries: Entry[], now: number): number {
  const byDay = Map.groupBy(
    entries.filter((e) => e.kind === 'used'),
    (e) => dayOf(e.at),
  )
  const metDays = [...byDay].filter(([, dayEntries]) => usedTotal(dayEntries) >= goal).map(([day]) => day)
  return streakOf(new Set(metDays), now)
}

// The longest run of days in a row with something done, at any time.
export function bestStreak(entries: Entry[]): number {
  return longestRun(doneDays(entries))
}

// The longest run of consecutive days in a sorted list of days.
function longestRun(days: number[]): number {
  let best = 0
  let run = 0
  for (const [i, day] of days.entries()) {
    run = i > 0 && day === days[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

// The local days on which a staged habit was complete: every stage done, oldest first. A stage
// counts from the day it joined, so adding a stage never undoes days that were complete.
export function completeDays(stages: Tracker[], entries: Entry[]): number[] {
  const doneOn = new Map(stages.map((stage) => [stage.id, new Set(doneDays(entries.filter((e) => e.trackerId === stage.id)))]))
  return doneDays(entries).filter((day) => {
    const counted = stages.filter((stage) => dayOf(stage.parent!.since) <= day)
    return counted.length > 0 && counted.every((stage) => doneOn.get(stage.id)!.has(day))
  })
}

// Days in a row with every stage done.
export function stagedStreak(stages: Tracker[], entries: Entry[], now: number): number {
  return streakOf(new Set(completeDays(stages, entries)), now)
}

// The longest run of days in a row with every stage done, at any time.
export function stagedBest(stages: Tracker[], entries: Entry[]): number {
  return longestRun(completeDays(stages, entries))
}

// Whether a tracker has done its part today, which is what a group's progress counts: a habit
// done, every stage of a staged habit done, a usage goal reached (or, without a goal, anything
// logged), and no slip for quit. `entries` are the tracker's own, or its stages'.
export function doneToday(tracker: Tracker, stages: Tracker[], entries: Entry[], now: number): boolean {
  const today = dayOf(now)
  const todays = entries.filter((e) => dayOf(e.at) === today)
  switch (tracker.kind) {
    case 'habit':
      return todays.some((e) => e.kind === 'done')
    case 'staged':
      return completeDays(stages, todays).includes(today)
    case 'usage':
      return tracker.dailyGoal === undefined ? todays.some((e) => e.kind === 'used') : usedTotal(todays) >= tracker.dailyGoal
    case 'quit':
      return !todays.some((e) => e.kind === 'slipped')
  }
}

export function doneCount(entries: Entry[]): number {
  return entries.filter((e) => e.kind === 'done').length
}

// Whole days since the last slip, or since tracking started if there hasn't been one.
export function daysWithout(tracker: Tracker, entries: Entry[], now: number): number {
  const lastSlip = entries
    .filter((e) => e.kind === 'slipped')
    .reduce((latest, e) => Math.max(latest, e.at), tracker.createdAt)
  return wholeDays(lastSlip, now)
}

// The longest run of whole days without a slip, the current one included.
export function longestStretch(tracker: Tracker, entries: Entry[], now: number): number {
  const slips = entries
    .filter((e) => e.kind === 'slipped')
    .map((e) => e.at)
    .toSorted((a, b) => a - b)
  const marks = [tracker.createdAt, ...slips, now]
  return Math.max(...marks.slice(1).map((at, i) => wholeDays(marks[i], at)))
}

export function resistedCount(entries: Entry[]): number {
  return entries.filter((e) => e.kind === 'resisted').length
}

export function slipCount(entries: Entry[]): number {
  return entries.filter((e) => e.kind === 'slipped').length
}

export function usedToday(entries: Entry[], now: number): number {
  const today = dayOf(now)
  return usedTotal(entries.filter((e) => dayOf(e.at) === today))
}

export function usedTotal(entries: Entry[]): number {
  return entries.filter((e) => e.kind === 'used').reduce((total, e) => total + e.amount, 0)
}

// Average per day since tracking started, today included.
export function dailyAverage(tracker: Tracker, entries: Entry[], now: number): number {
  return usedTotal(entries) / (dayOf(now) - dayOf(tracker.createdAt) + 1)
}
