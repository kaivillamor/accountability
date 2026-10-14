export const DAY_MS = 86_400_000

// The local calendar day as a whole number, so day math follows the user's clock
// instead of 24-hour periods, which drift across time zones and daylight-saving changes.
export function dayOf(at: number): number {
  const date = new Date(at)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
}

// Milliseconds since local midnight, by the clock on the wall.
export function timeOfDay(at: number): number {
  const date = new Date(at)
  return ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds()
}

// 0 is Sunday, 6 is Saturday.
export function weekday(day: number): number {
  return new Date(day * DAY_MS).getUTCDay()
}

export function isMonthStart(day: number): boolean {
  return new Date(day * DAY_MS).getUTCDate() === 1
}

export function formatDay(day: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(day * DAY_MS).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
}
