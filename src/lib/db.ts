import type { Change, Entry, Group, Snapshot, Tracker } from './model.ts'

type Stores = { trackers: Tracker; entries: Entry; groups: Group }

let opening: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('accountability', 3)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const from = event.oldVersion
      if (from < 1) {
        db.createObjectStore('trackers', { keyPath: 'id' })
        db.createObjectStore('entries', { keyPath: 'id' })
      }
      if (from < 2) db.createObjectStore('groups', { keyPath: 'id' })
      // Records saved by older versions get the fields added since, in one pass so the steps
      // can't overwrite each other: an order (version 2), oldest first as the page used to show
      // them, and when they last changed (version 3), for which their creation is the best known.
      const transaction = request.transaction!
      const trackers = transaction.objectStore('trackers')
      const savedTrackers = trackers.getAll()
      savedTrackers.onsuccess = () => {
        const oldestFirst = (savedTrackers.result as Tracker[]).toSorted((a, b) => a.createdAt - b.createdAt)
        for (const [order, tracker] of oldestFirst.entries()) {
          const upgraded = { ...tracker }
          if (from < 2) upgraded.order = order
          if (from < 3) upgraded.updatedAt = tracker.createdAt
          trackers.put(upgraded)
        }
      }
      if (from < 3) {
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
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['trackers', 'entries', 'groups'], 'readwrite')
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
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// Swaps everything on this device for `snapshot`, together or not at all.
export async function replaceAll(snapshot: Snapshot): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['trackers', 'entries', 'groups'], 'readwrite')
    for (const store of ['trackers', 'entries', 'groups'] as const) {
      const records = transaction.objectStore(store)
      records.clear()
      for (const record of snapshot[store]) records.put(record)
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export const listTrackers = () => getAll('trackers')
export const listEntries = () => getAll('entries')
export const listGroups = () => getAll('groups')
export const saveTracker = (tracker: Tracker) => put('trackers', tracker)
export const saveEntry = (entry: Entry) => put('entries', entry)
export const saveGroup = (group: Group) => put('groups', group)
