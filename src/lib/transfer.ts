import { remove, tidy, withChange } from './arrange.ts'
import type { Snapshot } from './model.ts'

// Data moves between devices as one file: a readable envelope saying what it is, around the data
// encrypted with a key made from the user's passphrase. AES-GCM also tells a wrong passphrase or
// a damaged file apart from a good one.
type Envelope = { app: 'accountability'; format: number; salt: string; iv: string; data: string }

const FORMAT = 1
// PBKDF2-SHA256 rounds, OWASP's current recommendation. More rounds make guessing slower.
const ROUNDS = 600_000

const NOT_OURS = "This isn't an Accountability file."

// Encrypts everything into the text of a file.
export async function lock(snapshot: Snapshot, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(snapshot))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(passphrase, salt), plain)
  const envelope: Envelope = { app: 'accountability', format: FORMAT, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
  return JSON.stringify(envelope)
}

// Opens a file made by `lock`. When it can't, the error's message is written for the user.
export async function unlock(text: string, passphrase: string): Promise<Snapshot> {
  const envelope = envelopeOf(text)
  const key = await keyFor(passphrase, fromBase64(envelope.salt))
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.data))
  } catch {
    throw new Error("That passphrase doesn't open this file.")
  }
  return JSON.parse(new TextDecoder().decode(plain))
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

async function keyFor(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ROUNDS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

// Combines this device's data with an imported file's. Everything logged on either is kept, and
// a tracker or group on both keeps whichever version changed last.
export function merge(here: Snapshot, file: Snapshot, now: number): Snapshot {
  const entries = [...new Map([...here.entries, ...file.entries].map((e) => [e.id, e])).values()]
  return { ...tidy(newest(here.trackers, file.trackers), newest(here.groups, file.groups), now), entries }
}

function newest<T extends { id: string; updatedAt: number }>(here: T[], file: T[]): T[] {
  const byId = new Map(here.map((record) => [record.id, record]))
  for (const record of file) {
    const mine = byId.get(record.id)
    if (!mine || record.updatedAt > mine.updatedAt) byId.set(record.id, record)
  }
  return [...byId.values()]
}

// Where a tracker in a merge came from.
export type Origin = 'both' | 'file' | 'here'

export function originOf(id: string, here: Snapshot, file: Snapshot): Origin {
  const inFile = file.trackers.some((t) => t.id === id)
  if (!here.trackers.some((t) => t.id === id)) return 'file'
  return inFile ? 'both' : 'here'
}

// Leaves out the trackers the user chose to delete while reviewing an import, with a multi-stage
// habit's stages and everything logged for them.
export function without(snapshot: Snapshot, ids: string[], now: number): Snapshot {
  let { trackers, groups } = snapshot
  for (const id of ids) {
    const change = remove(trackers, groups, id, now)
    trackers = withChange(trackers, change.putTrackers, change.deleteTrackerIds)
    groups = withChange(groups, change.putGroups, change.deleteGroupIds)
  }
  const kept = new Set(trackers.map((t) => t.id))
  return { trackers, groups, entries: snapshot.entries.filter((e) => kept.has(e.trackerId)) }
}
