import type { Change, Entry, Group, Snapshot, Tracker } from './model.ts'
import type { Bytes, Sealed } from './seal.ts'

// The hidden trackers, encrypted with a key made from the user's PIN and this salt.
export type Vault = Sealed & { salt: Bytes }

type Stores = { trackers: Tracker; entries: Entry; groups: Group }

// Wrong PINs so far, and when the next try is allowed (0 for now).
export type Attempts = { failures: number; waitUntil: number }

// The vault store's records: the hidden trackers, and the count of wrong PINs.
const VAULT = 'hidden'
const ATTEMPTS = 'attempts'

let opening: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('accountability', 4)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const from = event.oldVersion
      if (from < 1) {
        db.createObjectStore('trackers', { keyPath: 'id' })
        db.createObjectStore('entries', { keyPath: 'id' })
      }
      if (from < 2) db.createObjectStore('groups', { keyPath: 'id' })
      if (from < 4) db.createObjectStore('vault', { keyPath: 'id' })
      // Records saved by older versions get the fields added since, in one pass so the steps
      // can't overwrite each other: an order (version 2), oldest first as the page used to show
      // them, and when they last changed (version 3), for which their creation is the best known.
      if (from < 3) {
        const transaction = request.transaction!
        const trackers = transaction.objectStore('trackers')
        const savedTrackers = trackers.getAll()
        savedTrackers.onsuccess = () => {
          const oldestFirst = (savedTrackers.result as Tracker[]).toSorted((a, b) => a.createdAt - b.createdAt)
          for (const [order, tracker] of oldestFirst.entries()) {
            const upgraded = { ...tracker, updatedAt: tracker.createdAt }
            if (from < 2) upgraded.order = order
            trackers.put(upgraded)
          }
        }
        const groups = transaction.objectStore('groups')
        const savedGroups = groups.getAll()
        savedGroups.onsuccess = () => {
          for (const group of savedGroups.result as Group[]) groups.put({ ...group, updatedAt: group.createdAt })
        }
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // A newer version of the app wants to upgrade the database from another tab. This tab's
      // code is out of date, so it steps aside and reloads instead of blocking the upgrade.
      db.onversionchange = () => {
        db.close()
        location.reload()
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })
  return opening
}

async function getAll<S extends keyof Stores>(store: S): Promise<Stores[S][]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function put<S extends keyof Stores>(store: S, value: Stores[S]): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite')
    transaction.objectStore(store).put(value)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// Saves and deletes everything in a change together, or nothing at all. Deleting a tracker
// deletes every entry logged for it.
export async function apply(change: Change): Promise<void> {
  const db = await open()
  return done(write(db.transaction(['trackers', 'entries', 'groups'], 'readwrite'), change))
}

// Moves a tracker into or out of hiding: the change to what's shown, any entries coming back to
// it, and the hidden trackers' new vault, all together, so nothing is ever in both or neither.
export async function applyHiding(change: Change, entries: Entry[], vault: Vault): Promise<void> {
  const db = await open()
  const transaction = write(db.transaction(['trackers', 'entries', 'groups', 'vault'], 'readwrite'), change)
  for (const entry of entries) transaction.objectStore('entries').put(entry)
  transaction.objectStore('vault').put({ id: VAULT, ...vault })
  return done(transaction)
}

function write(transaction: IDBTransaction, change: Change): IDBTransaction {
  const trackers = transaction.objectStore('trackers')
  const groups = transaction.objectStore('groups')
  for (const tracker of change.putTrackers) trackers.put(tracker)
  for (const id of change.deleteTrackerIds) trackers.delete(id)
  for (const group of change.putGroups) groups.put(group)
  for (const id of change.deleteGroupIds) groups.delete(id)
  // Most changes only rearrange, so the entries are read only when something is deleted.
  if (change.deleteTrackerIds.length > 0) {
    const cursorRequest = transaction.objectStore('entries').openCursor()
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return // every entry checked
      if (change.deleteTrackerIds.includes((cursor.value as Entry).trackerId)) cursor.delete()
      cursor.continue()
    }
  }
  return transaction
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// Swaps everything shown on this device for `shown`, and the hidden trackers for `vault` when
// there is one, together or not at all.
export async function replaceAll(shown: Snapshot, vault: Vault | undefined): Promise<void> {
  const db = await open()
  const transaction = db.transaction(['trackers', 'entries', 'groups', 'vault'], 'readwrite')
  for (const store of ['trackers', 'entries', 'groups'] as const) {
    const records = transaction.objectStore(store)
    records.clear()
    for (const record of shown[store]) records.put(record)
  }
  if (vault) transaction.objectStore('vault').put({ id: VAULT, ...vault })
  return done(transaction)
}

export async function loadVault(): Promise<Vault | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = db.transaction('vault').objectStore('vault').get(VAULT)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveVault(vault: Vault): Promise<void> {
  const db = await open()
  const transaction = db.transaction('vault', 'readwrite')
  transaction.objectStore('vault').put({ id: VAULT, ...vault })
  return done(transaction)
}

// Deletes the hidden trackers for good, for when the PIN is lost, and starts the count of wrong
// PINs over.
export async function deleteVault(): Promise<void> {
  const db = await open()
  const transaction = db.transaction('vault', 'readwrite')
  transaction.objectStore('vault').delete(VAULT)
  transaction.objectStore('vault').delete(ATTEMPTS)
  return done(transaction)
}

// No record means no wrong PINs.
export async function loadAttempts(): Promise<Attempts> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = db.transaction('vault').objectStore('vault').get(ATTEMPTS)
    request.onsuccess = () => resolve(request.result ?? { failures: 0, waitUntil: 0 })
    request.onerror = () => reject(request.error)
  })
}

export async function saveAttempts(attempts: Attempts): Promise<void> {
  const db = await open()
  const transaction = db.transaction('vault', 'readwrite')
  transaction.objectStore('vault').put({ id: ATTEMPTS, ...attempts })
  return done(transaction)
}

export async function clearAttempts(): Promise<void> {
  const db = await open()
  const transaction = db.transaction('vault', 'readwrite')
  transaction.objectStore('vault').delete(ATTEMPTS)
  return done(transaction)
}

// Takes back one logged moment, for Undo right after logging it.
export async function deleteEntry(id: string): Promise<void> {
  const db = await open()
  const transaction = db.transaction('entries', 'readwrite')
  transaction.objectStore('entries').delete(id)
  return done(transaction)
}

export const listTrackers = () => getAll('trackers')
export const listEntries = () => getAll('entries')
export const listGroups = () => getAll('groups')
export const saveTracker = (tracker: Tracker) => put('trackers', tracker)
export const saveEntry = (entry: Entry) => put('entries', entry)
export const saveGroup = (group: Group) => put('groups', group)
