import type { Change, Entry, Group, Tracker } from './model.ts'

type Stores = { trackers: Tracker; entries: Entry; groups: Group }

let opening: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('accountability', 2)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (event.oldVersion < 1) {
        db.createObjectStore('trackers', { keyPath: 'id' })
        db.createObjectStore('entries', { keyPath: 'id' })
      }
      if (event.oldVersion < 2) {
        db.createObjectStore('groups', { keyPath: 'id' })
        // Trackers saved before groups existed get the order the page showed them in: oldest first.
        const trackers = request.transaction!.objectStore('trackers')
        const saved = trackers.getAll()
        saved.onsuccess = () => {
          const oldestFirst = (saved.result as Tracker[]).toSorted((a, b) => a.createdAt - b.createdAt)
          for (const [order, tracker] of oldestFirst.entries()) trackers.put({ ...tracker, order })
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

export const listTrackers = () => getAll('trackers')
export const listEntries = () => getAll('entries')
export const listGroups = () => getAll('groups')
export const saveTracker = (tracker: Tracker) => put('trackers', tracker)
export const saveEntry = (entry: Entry) => put('entries', entry)
export const saveGroup = (group: Group) => put('groups', group)
