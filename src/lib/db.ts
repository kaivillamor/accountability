import type { Entry, Tracker } from './model.ts'

type Stores = { trackers: Tracker; entries: Entry }

let opening: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('accountability', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('trackers', { keyPath: 'id' })
      request.result.createObjectStore('entries', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
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

export const listTrackers = () => getAll('trackers')
export const listEntries = () => getAll('entries')
export const saveTracker = (tracker: Tracker) => put('trackers', tracker)
export const saveEntry = (entry: Entry) => put('entries', entry)
