import { nextOrder, remove, withChange } from './arrange.ts'
import type { Change, Entry, Snapshot, Tracker } from './model.ts'
import { count } from './text.ts'

// The hidden trackers' PIN: 4 digits, Kai's call, so it's easy to remember. 10,000 PINs fall
// quickly to anyone who copies the browser's data, so the app's own protection is the waits below.
export const PIN = /^\d{4}$/

// Wrong PINs allowed before waits start, and the first wait. Each wrong PIN after that doubles the
// wait, up to an hour, so guessing 4 digits in the app takes months.
const FREE_TRIES = 5
const FIRST_WAIT = 30_000
const LONGEST_WAIT = 3_600_000

export function waitAfter(failures: number): number {
  if (failures < FREE_TRIES) return 0
  return Math.min(FIRST_WAIT * 2 ** (failures - FREE_TRIES), LONGEST_WAIT)
}

// A wait in words, rounded up: "30 seconds", "2 minutes", "1 hour".
export function waitText(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return count(seconds, 'second')
  const minutes = Math.ceil(seconds / 60)
  return minutes < 60 ? count(minutes, 'minute') : count(Math.ceil(minutes / 60), 'hour')
}

// A card moving between what's shown and the hidden trackers. `change` is what the shown data
// needs saved; `entries` are any that come back to it.
export type Moved = { shown: Snapshot; hidden: Snapshot; change: Change; entries: Entry[] }

// Moves a card, with a multi-stage habit's stages and everything logged for them, into the
// hidden trackers, last among them. It leaves its group, and a group left empty goes.
export function hide(shown: Snapshot, hidden: Snapshot, id: string, now: number): Moved {
  const ids = idsWithStages(shown.trackers, id)
  const change = remove(shown.trackers, shown.groups, id, now)
  const order = nextOrder(hidden.trackers, [])
  const moving = shown.trackers.filter((t) => ids.includes(t.id)).map((t) => placed(t, t.id === id ? order : t.order, now))
  return {
    shown: {
      trackers: withChange(shown.trackers, change.putTrackers, change.deleteTrackerIds),
      groups: withChange(shown.groups, change.putGroups, change.deleteGroupIds),
      entries: shown.entries.filter((e) => !ids.includes(e.trackerId)),
    },
    hidden: {
      trackers: [...hidden.trackers, ...moving],
      groups: [],
      entries: [...hidden.entries, ...shown.entries.filter((e) => ids.includes(e.trackerId))],
    },
    change,
    entries: [],
  }
}

// Moves a hidden card back, last at the top level of what's shown.
export function unhide(shown: Snapshot, hidden: Snapshot, id: string, now: number): Moved {
  const ids = idsWithStages(hidden.trackers, id)
  const removal = remove(hidden.trackers, [], id, now)
  const order = nextOrder(shown.trackers, shown.groups)
  const moving = hidden.trackers.filter((t) => ids.includes(t.id)).map((t) => placed(t, t.id === id ? order : t.order, now))
  const entries = hidden.entries.filter((e) => ids.includes(e.trackerId))
  return {
    shown: { trackers: [...shown.trackers, ...moving], groups: shown.groups, entries: [...shown.entries, ...entries] },
    hidden: {
      trackers: withChange(hidden.trackers, removal.putTrackers, removal.deleteTrackerIds),
      groups: [],
      entries: hidden.entries.filter((e) => !ids.includes(e.trackerId)),
    },
    change: { putTrackers: moving, deleteTrackerIds: [], putGroups: [], deleteGroupIds: [] },
    entries,
  }
}

function idsWithStages(trackers: Tracker[], id: string): string[] {
  return [id, ...trackers.filter((t) => t.parent?.id === id).map((t) => t.id)]
}

// A tracker at its new position. A card moving sides is out of any group; its stages stay its
// stages. Moving counts as a change, so a merge with another device keeps the newer side.
function placed(tracker: Tracker, order: number, now: number): Tracker {
  const next: Tracker = { ...tracker, order, updatedAt: now }
  delete next.groupId
  return next
}
