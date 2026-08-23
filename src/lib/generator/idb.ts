/**
 * The tab's own store, and the reason there is one.
 *
 * Media never reaches a disk we own, so anything the app wants to remember
 * *about a contributor's files* has to be remembered on their machine. Two
 * things qualify: `run-thumbnails`, the contact sheet for a saved run, and
 * `pending-run`, the folder handle of a run that has not finished yet.
 *
 * Both stores share one database because a second `indexedDB.open` on the same
 * name with a different version blocks the first — the version lives here so
 * adding a store is one edit rather than a race.
 */

const DB_NAME = 'stockflow'
const DB_VERSION = 2

export const THUMBNAILS = 'run-thumbnails'
export const PENDING_RUN = 'pending-run'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      // Guarded rather than versioned: the same block has to serve a fresh
      // install and a browser that already holds the v1 thumbnails.
      if (!db.objectStoreNames.contains(THUMBNAILS)) {
        db.createObjectStore(THUMBNAILS, { keyPath: 'runId' })
      }
      if (!db.objectStoreNames.contains(PENDING_RUN)) {
        db.createObjectStore(PENDING_RUN, { keyPath: 'slot' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    // A second tab still holding the old version blocks the upgrade. Failing
    // is better than hanging: every caller here treats an error as "nothing
    // stored", which costs a resume card, not a run.
    request.onblocked = () => reject(new Error('another tab is holding the old database'))
  })
}

/** One request against one store, with the connection closed afterwards. */
export function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = work(tx.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
      }),
  )
}
