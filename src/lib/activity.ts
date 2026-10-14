import { dayOf, weekday } from './days.ts'
import type { Entry, Tracker } from './model.ts'

export type ActivityDay = {
  day: number
  // Habit: times done. Usage: amount used. Quit: times resisted.
  value: number
  slipped: boolean
  // 0 for nothing, then 1 to 4 relative to the busiest day shown.
  level: 0 | 1 | 2 | 3 | 4
  // False for days before the tracker was created.
  tracked: boolean
}

// The last `weeks` weeks as columns of Sunday-to-Saturday days, ending today.
export function activity(tracker: Tracker, entries: Entry[], now: number, weeks: number): ActivityDay[][] {
  const today = dayOf(now)
  const start = today - weekday(today) - 7 * (weeks - 1)
  const tallies = new Map<number, { value: number; slipped: boolean }>()
  for (let day = start; day <= today; day++) tallies.set(day, { value: 0, slipped: false })

  for (const entry of entries) {
    const tally = tallies.get(dayOf(entry.at))
    if (!tally) continue // outside the weeks shown
    if (entry.kind === 'slipped') tally.slipped = true
    else tally.value += entry.kind === 'used' ? entry.amount : 1
  }

  const busiest = Math.max(...Array.from(tallies.values(), (tally) => tally.value))
  const firstTracked = dayOf(tracker.createdAt)
  const columns: ActivityDay[][] = []
  for (const [day, { value, slipped }] of tallies) {
    if (weekday(day) === 0) columns.push([])
    columns[columns.length - 1].push({ day, value, slipped, level: level(value, busiest), tracked: day >= firstTracked })
  }
  return columns
}

function level(value: number, busiest: number): ActivityDay['level'] {
  if (value === 0) return 0
  return Math.ceil((value / busiest) * 4) as 1 | 2 | 3 | 4
}
