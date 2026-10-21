import type { Card } from './arrange.ts'
import { dayOf, weekday } from './days.ts'
import type { Entry, Tracker } from './model.ts'
import { usedTotal } from './stats.ts'
import { count, formatAmount, formatQuantity } from './text.ts'

export type ActivityDay = {
  day: number
  // Everything logged that day.
  entries: Entry[]
  // Each done, resisted or usage log counts once. A slip adds no activity.
  count: number
  // 0 for nothing, then shades 1 to 3, darker with more activity (see `activity`).
  level: 0 | 1 | 2 | 3
}

// The last `weeks` weeks as columns of Sunday-to-Saturday days, ending today.
export function activity(entries: Entry[], now: number, weeks: number): ActivityDay[][] {
  const today = dayOf(now)
  const start = today - weekday(today) - 7 * (weeks - 1)
  const byDay = new Map<number, Entry[]>()
  for (let day = start; day <= today; day++) byDay.set(day, [])
  for (const entry of entries) {
    const dayEntries = byDay.get(dayOf(entry.at))
    if (!dayEntries) continue // outside the weeks shown
    dayEntries.push(entry)
  }

  const days = Array.from(byDay, ([day, dayEntries]) => ({
    day,
    entries: dayEntries,
    count: dayEntries.filter((e) => e.kind !== 'slipped').length,
  }))
  // Shades are relative to the busiest day, but the scale never shrinks below one entry per
  // shade. Otherwise a new user's only entry would already be the darkest shade, and logging
  // more could never make a day darker.
  const scale = Math.max(SHADES, ...days.map((d) => d.count))
  const columns: ActivityDay[][] = []
  for (const d of days) {
    if (weekday(d.day) === 0) columns.push([])
    columns[columns.length - 1].push({ ...d, level: level(d.count, scale) })
  }
  return columns
}

const SHADES = 3

function level(count: number, scale: number): ActivityDay['level'] {
  if (count === 0) return 0
  return Math.ceil((count / scale) * SHADES) as 1 | 2 | 3
}

// One card's part of a day, like "Done" for Run or "144 / 64 ounces" for Water. A quit tracker
// that slipped that day is `slipped`, even if it was also resisted.
export type DayLine = { id: string; name: string; summary: string; goalMet: boolean; slipped: boolean }

// What each card logged on a day, in card order. A staged habit sums up its stages ("2 of 3
// stages", or "Done" once all are), except what a stage logged before the day it joined, which
// shows under the stage's own name, as it did then.
export function dayLines(cards: Card[], dayEntries: Entry[], day: number): DayLine[] {
  return cards.flatMap(({ tracker, stages }) => {
    if (tracker.kind !== 'staged') return lineFor(tracker, dayEntries)
    const joined = stages.filter((stage) => dayOf(stage.parent!.since) <= day)
    const done = joined.filter((stage) => dayEntries.some((e) => e.trackerId === stage.id)).length
    const summary = done === joined.length ? 'Done' : `${done} of ${joined.length} stages`
    const own = done > 0 ? [{ id: tracker.id, name: tracker.name, summary, goalMet: false, slipped: false }] : []
    return [...own, ...stages.filter((stage) => !joined.includes(stage)).flatMap((stage) => lineFor(stage, dayEntries))]
  })
}

function lineFor(tracker: Tracker, dayEntries: Entry[]): DayLine[] {
  const logged = dayEntries.filter((e) => e.trackerId === tracker.id)
  if (logged.length === 0) return []
  const goalMet = tracker.kind === 'usage' && tracker.dailyGoal !== undefined && usedTotal(logged) >= tracker.dailyGoal
  const slipped = logged.some((e) => e.kind === 'slipped')
  return [{ id: tracker.id, name: tracker.name, summary: summarize(tracker, logged), goalMet, slipped }]
}

// A habit, usage or quit tracker's day in words. Staged habits have no entries of their own.
function summarize(tracker: Tracker, logged: Entry[]): string {
  if (tracker.kind === 'habit') return logged.length === 1 ? 'Done' : `Done ${count(logged.length, 'time')}`
  if (tracker.kind === 'usage') {
    // With a goal, show progress the way the card does: "144 / 64 ounces".
    const total = usedTotal(logged)
    if (tracker.dailyGoal === undefined) return formatQuantity(total, tracker.unit)
    return `${formatAmount(total)} / ${formatQuantity(tracker.dailyGoal, tracker.unit)}`
  }
  const resisted = logged.filter((e) => e.kind === 'resisted').length
  if (!logged.some((e) => e.kind === 'slipped')) return `Resisted ${count(resisted, 'time')}`
  return resisted === 0 ? 'Slipped' : `Slipped, resisted ${count(resisted, 'time')}`
}
