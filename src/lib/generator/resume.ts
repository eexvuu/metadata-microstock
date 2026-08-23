import type { DirectoryHandle } from '#/lib/sources/browser-directory'
import { PENDING_RUN, transact } from './idb'

/**
 * The folder of a run that has not finished, so closing the tab costs one
 * click instead of a whole run.
 *
 * The rows themselves are already safe in two places — `.metadata-progress.json`
 * in the folder, and the checkpoint on the server that History reads. What is
 * *not* recoverable without this is the way back to the folder: a directory
 * handle dies with the page, and asking somebody to find the same folder again
 * a day later is how a resumable run stops being resumed.
 *
 * A `FileSystemDirectoryHandle` is structured-cloneable, so IndexedDB can keep
 * one. What it cannot keep is the permission: the handle comes back revoked and
 * `requestPermission` only answers inside a user gesture. That is why resuming
 * is a button rather than something the page does on load.
 *
 * One slot. The tool runs one folder at a time, and a second run replacing the
 * first is the honest model — two half-finished runs would need a screen to
 * choose between them, and that is a worse answer than "the last one".
 */

const SLOT = 'current'

/** Past this the folder has almost certainly moved on; the rows are gone too. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export interface PendingRun {
  slot: string
  /** The `generation_run` row this folder belongs to, reused on resume. */
  runId: string
  folderName: string
  platform: 'adobe' | 'shutterstock'
  directory: DirectoryHandle
  filesTotal: number
  filesDone: number
  savedAt: number
}

export async function savePendingRun(
  record: Omit<PendingRun, 'slot' | 'savedAt'>,
): Promise<void> {
  await write({ ...record, slot: SLOT, savedAt: Date.now() })
}

/** Cheap enough to call after every checkpoint — one small record, no blobs. */
export async function updatePendingProgress(filesDone: number): Promise<void> {
  const current = await read()
  if (!current) return
  await write({ ...current, filesDone, savedAt: Date.now() })
}

export async function loadPendingRun(): Promise<PendingRun | null> {
  const current = await read()
  if (!current) return null
  if (Date.now() - current.savedAt > STALE_AFTER_MS) {
    await clearPendingRun()
    return null
  }
  return current
}

export async function clearPendingRun(): Promise<void> {
  try {
    await transact(PENDING_RUN, 'readwrite', (store) => store.delete(SLOT))
  } catch (error) {
    console.warn('[stockflow] resumable run not cleared:', error)
  }
}

/**
 * Remembering a folder is a convenience wrapped around the real work. A
 * storage failure here — a blocked upgrade, a browser with site data off —
 * must never be the reason a run refuses to start or a finished one reports an
 * error, so it is logged and swallowed exactly like the read is.
 */
async function write(record: PendingRun): Promise<void> {
  try {
    await transact(PENDING_RUN, 'readwrite', (store) => store.put(record))
  } catch (error) {
    console.warn('[stockflow] resumable run not saved:', error)
  }
}

/**
 * IndexedDB is not worth a broken screen: a private window, a browser with
 * storage blocked, or a handle whose structured clone the browser refuses all
 * end up here, and none of them should stop somebody starting a run.
 */
async function read(): Promise<PendingRun | null> {
  try {
    const record = await transact<PendingRun | undefined>(
      PENDING_RUN,
      'readonly',
      (store) => store.get(SLOT),
    )
    return record ?? null
  } catch (error) {
    console.warn('[stockflow] no resumable run read:', error)
    return null
  }
}

/**
 * Ask for the folder back. Chrome answers `granted` without a prompt when the
 * permission is still remembered, and shows one otherwise — either way it has
 * to happen inside the click, which is why this takes the handle rather than
 * reading it from the store itself.
 */
export async function regrantWrite(directory: DirectoryHandle): Promise<boolean> {
  if (!directory.requestPermission) return true
  try {
    return (await directory.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch (error) {
    console.warn('[stockflow] folder permission refused:', error)
    return false
  }
}
