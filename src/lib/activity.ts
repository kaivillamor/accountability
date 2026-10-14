import { dayOf, weekday } from './days.ts'
import type { Entry } from './model.ts'

export type ActivityDay = {
  day: number
  // Everything logged that day.
  entries: Entry[]
  // Each done, resisted or usage log counts once. A slip adds no activity; it flags the day.
  count: number
  slipped: boolean
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
    slipped: dayEntries.some((e) => e.kind === 'slipped'),
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
