import { remove, tidy, withChange } from './arrange.ts'
import { EMPTY, type DeviceData, type Group, type Snapshot, type Tracker } from './model.ts'
import { fromBase64, keyFor, newSalt, seal, toBase64, unseal } from './seal.ts'

// Data moves between devices as one file: a readable envelope saying what it is, around
// everything on the device, encrypted with a key made from the user's passphrase.
type Envelope = { app: 'accountability'; format: number; salt: string; iv: string; data: string }

// Format 1 held only what was shown; format 2 holds the hidden trackers too.
const FORMAT = 2

const NOT_OURS = "This isn't an Accountability file."

// Encrypts everything into the text of a file.
export async function lock(data: DeviceData, passphrase: string): Promise<string> {
  const salt = newSalt()
  const sealed = await seal(await keyFor(passphrase, salt), data)
  const envelope: Envelope = { app: 'accountability', format: FORMAT, salt: toBase64(salt), iv: toBase64(sealed.iv), data: toBase64(sealed.data) }
  return JSON.stringify(envelope)
}

// Opens a file made by `lock`. When it can't, the error's message is written for the user.
export async function unlock(text: string, passphrase: string): Promise<DeviceData> {
  const envelope = envelopeOf(text)
  const key = await keyFor(passphrase, fromBase64(envelope.salt))
  let contents: unknown
  try {
    contents = await unseal(key, { iv: fromBase64(envelope.iv), data: fromBase64(envelope.data) })
  } catch {
    throw new Error("That passphrase doesn't open this file.")
  }
  return envelope.format === 1 ? { shown: contents as Snapshot, hidden: EMPTY } : (contents as DeviceData)
}

function envelopeOf(text: string): Envelope {
  let value: Partial<Envelope> | null
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(NOT_OURS)
  }
  if (value?.app !== 'accountability') throw new Error(NOT_OURS)
  if (value.format! > FORMAT) throw new Error('This file was made by a newer version of the app. Reload this page to update it, then try again.')
  return value as Envelope
}

type Side = 'shown' | 'hidden'

// Combines this device's data with an imported file's. Everything logged on either is kept. A
// tracker or group on both keeps whichever version changed last, including whether it's hidden;
// a multi-stage habit's stages and every entry go wherever their tracker ends up.
export function merge(here: DeviceData, file: DeviceData, now: number): DeviceData {
  const newest = new Map<string, { tracker: Tracker; side: Side }>()
  for (const source of [here, file]) {
    for (const side of ['shown', 'hidden'] as const) {
      for (const tracker of source[side].trackers) {
        const kept = newest.get(tracker.id)
        if (!kept || tracker.updatedAt > kept.tracker.updatedAt) newest.set(tracker.id, { tracker, side })
      }
    }
  }
  // A stage goes wherever its multi-stage habit goes.
  const sideOf = (tracker: Tracker): Side => {
    const parent = tracker.parent && newest.get(tracker.parent.id)
    return (parent ?? newest.get(tracker.id)!).side
  }
  const trackers = [...newest.values()].map(({ tracker }) => tracker)
  const entries = [...new Map([...here.shown.entries, ...here.hidden.entries, ...file.shown.entries, ...file.hidden.entries].map((e) => [e.id, e])).values()]
  const groups = newestOf(here.shown.groups, file.shown.groups)
  const part = (side: Side): Snapshot => {
    const own = trackers.filter((t) => sideOf(t) === side)
    const ids = new Set(own.map((t) => t.id))
    // Hidden trackers never belong to a group.
    const placed = side === 'shown' ? own : own.map((t) => withoutGroup(t))
    const arranged = tidy(placed, side === 'shown' ? groups : [], now)
    return { ...arranged, entries: entries.filter((e) => ids.has(e.trackerId)) }
  }
  return { shown: part('shown'), hidden: part('hidden') }
}

function newestOf(here: Group[], file: Group[]): Group[] {
  const byId = new Map(here.map((group) => [group.id, group]))
  for (const group of file) {
    const mine = byId.get(group.id)
    if (!mine || group.updatedAt > mine.updatedAt) byId.set(group.id, group)
  }
  return [...byId.values()]
}

function withoutGroup(tracker: Tracker): Tracker {
  if (tracker.groupId === undefined) return tracker
  const next = { ...tracker }
  delete next.groupId
  return next
}

// Where a tracker in a merge came from.
export type Origin = 'both' | 'file' | 'here'

export function originOf(id: string, here: DeviceData, file: DeviceData): Origin {
  const has = (data: DeviceData) => [...data.shown.trackers, ...data.hidden.trackers].some((t) => t.id === id)
  if (!has(here)) return 'file'
  return has(file) ? 'both' : 'here'
}

// Leaves out the trackers the user chose to delete while reviewing an import, with a multi-stage
// habit's stages and everything logged for them, whether they're shown or hidden.
export function without(data: DeviceData, ids: string[], now: number): DeviceData {
  const trim = (snapshot: Snapshot): Snapshot => {
    let { trackers, groups } = snapshot
    for (const id of ids.filter((id) => trackers.some((t) => t.id === id))) {
      const change = remove(trackers, groups, id, now)
      trackers = withChange(trackers, change.putTrackers, change.deleteTrackerIds)
      groups = withChange(groups, change.putGroups, change.deleteGroupIds)
    }
    const kept = new Set(trackers.map((t) => t.id))
    return { trackers, groups, entries: snapshot.entries.filter((e) => kept.has(e.trackerId)) }
  }
  return { shown: trim(data.shown), hidden: trim(data.hidden) }
}
