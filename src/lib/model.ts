// Something being tracked. Its kind decides which entries it takes and what progress it shows.
export type Tracker = {
  id: string
  name: string
  createdAt: number
  // Position among its siblings: the top level, its group, or its staged habit's stages.
  order: number
  // Set when the tracker is in a group.
  groupId?: string
  // Set when the tracker is a stage of a staged habit, which it joined at `since`.
  parent?: { id: string; since: number }
} & (
  | { kind: 'habit' }
  // `dailyGoal` is optional: reach at least this much each day, in `unit`.
  | { kind: 'usage'; unit: string; dailyGoal?: number }
  | { kind: 'quit' }
  // A habit made of stages: the habit trackers whose `parent` points here. It has no entries of its own.
  | { kind: 'staged' }
)

export type TrackerKind = Tracker['kind']

// Trackers shown together under one name.
export type Group = {
  id: string
  name: string
  createdAt: number
  order: number
  collapsed: boolean
}

// One logged moment. Habits take `done`, usage takes `used`, quit takes `slipped` or `resisted`.
export type Entry = {
  id: string
  trackerId: string
  at: number
} & ({ kind: 'done' } | { kind: 'used'; amount: number } | { kind: 'slipped' } | { kind: 'resisted' })

// Everything one rearrangement saves and deletes, applied in a single transaction.
export type Change = {
  putTrackers: Tracker[]
  // Deleting a tracker also deletes its entries.
  deleteTrackerIds: string[]
  putGroups: Group[]
  deleteGroupIds: string[]
}
