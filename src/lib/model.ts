// Something being tracked. Its kind decides which entries it takes and what progress it shows.
export type Tracker = {
  id: string
  name: string
  createdAt: number
} & ({ kind: 'habit' } | { kind: 'usage'; unit: string } | { kind: 'quit' })

export type TrackerKind = Tracker['kind']

// One logged moment. Habits take `done`, usage takes `used`, quit takes `slipped` or `resisted`.
export type Entry = {
  id: string
  trackerId: string
  at: number
} & ({ kind: 'done' } | { kind: 'used'; amount: number } | { kind: 'slipped' } | { kind: 'resisted' })
