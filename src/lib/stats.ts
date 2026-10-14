import { DAY_MS, dayOf } from './days.ts'
import type { Entry, Tracker } from './model.ts'

// Days in a row with something done. Today counts once done, and until then
// the streak carries over from yesterday.
export function habitStreak(entries: Entry[], now: number): number {
  const doneDays = new Set(entries.filter((e) => e.kind === 'done').map((e) => dayOf(e.at)))
  const today = dayOf(now)
  let current = doneDays.has(today) ? today : today - 1
  let streak = 0
  while (doneDays.has(current)) {
    streak += 1
    current -= 1
  }
  return streak
}

// Whole days since the last slip, or since tracking started if there hasn't been one.
export function daysWithout(tracker: Tracker, entries: Entry[], now: number): number {
  const lastSlip = entries
    .filter((e) => e.kind === 'slipped')
    .reduce((latest, e) => Math.max(latest, e.at), tracker.createdAt)
  return Math.floor((now - lastSlip) / DAY_MS)
}

export function resistedCount(entries: Entry[]): number {
  return entries.filter((e) => e.kind === 'resisted').length
}

export function usedToday(entries: Entry[], now: number): number {
  const today = dayOf(now)
  return entries
    .filter((e) => e.kind === 'used')
    .filter((e) => dayOf(e.at) === today)
    .reduce((total, e) => total + e.amount, 0)
}
