// Saving work: autosave to the browser's storage, and project files on disk. No React: the
// hooks (hooks/useAutosave, useSaveStatus) and the save controls build on this.

/** What each page autosaves, under its own key. */
export type SaveSlot = 'canvas' | 'generator'
export const SAVE_SLOTS: readonly SaveSlot[] = ['canvas', 'generator']

const STORAGE_PREFIX = 'rgd-generator:'
const storageKey = (slot: SaveSlot) => `${STORAGE_PREFIX}${slot}`

/** Each slot's text as this tab last read or wrote it: unchanged content is never rewritten,
 *  and another tab writing the same content isn't a change. */
const known = new Map<SaveSlot, string | null>()

/** A slot's saved value, or undefined if there is none (or it can't be read). */
export function readSaved(slot: SaveSlot): unknown {
  try {
    const text = window.localStorage.getItem(storageKey(slot))
    known.set(slot, text)
    return text === null ? undefined : (JSON.parse(text) as unknown)
  } catch {
    return undefined
  }
}

/** Save a slot now. False if the browser refused (storage full or blocked), or another tab
 *  has saved over it since (see watchOtherTabs). */
export function writeSaved(slot: SaveSlot, value: unknown): boolean {
  if (suspended || savedElsewhere.has(slot)) return false
  try {
    const text = JSON.stringify(value)
    // Unchanged: nothing to write (and no other tab is told of a change).
    if (text !== known.get(slot)) window.localStorage.setItem(storageKey(slot), text)
    known.set(slot, text)
    // (A warning about another tab stands until reload.)
    setStatus({ savedAt: Date.now(), error: savedElsewhere.size > 0 ? status.error : null })
    return true
  } catch (error) {
    setStatus({ ...status, error: `Autosave failed: ${String(error)}` })
    return false
  }
}

// Large values (images), stored once ---------------------------------------------------------

/** References to stored blobs look like this inside saved documents. */
export const BLOB_PREFIX = 'rgd-blob:'
const blobKey = (id: string) => `${STORAGE_PREFIX}blob:${id}`
/** Ids of strings already hashed (long data URLs: hash each once). */
const blobIds = new Map<string, string>()

/** A short, stable id for a string's content (FNV-1a, with its length). */
function contentId(text: string): string {
  let id = blobIds.get(text)
  if (id) return id
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  id = `${text.length.toString(36)}-${hash.toString(36)}`
  blobIds.set(text, id)
  return id
}

/** Store a large string once (by content) and return its reference for a saved document;
 *  the same content is never written twice. Falls back to the string itself if storage
 *  refuses. */
export function storeBlob(text: string): string {
  const id = contentId(text)
  const key = blobKey(id)
  try {
    if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text)
    return BLOB_PREFIX + id
  } catch {
    return text
  }
}

/** A stored blob's content from its reference (or the value itself if it isn't one; null if
 *  it's missing). */
export function loadBlob(value: string): string | null {
  if (!value.startsWith(BLOB_PREFIX)) return value
  try {
    return window.localStorage.getItem(blobKey(value.slice(BLOB_PREFIX.length)))
  } catch {
    return null
  }
}

/** Remove stored blobs no saved document refers to any more (`refs`: the ones in use). */
export function pruneBlobs(refs: ReadonlySet<string>): void {
  try {
    const prefix = blobKey('')
    const unused: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(prefix) && !refs.has(BLOB_PREFIX + key.slice(prefix.length))) {
        unused.push(key)
      }
    }
    for (const key of unused) window.localStorage.removeItem(key)
  } catch {
    // Nothing to do: it's only tidying.
  }
}

/** `value` with every blob reference replaced by its content (for project files, which
 *  must stand on their own). */
export function inlineBlobs(value: unknown): unknown {
  if (typeof value === 'string')
    return value.startsWith(BLOB_PREFIX) ? (loadBlob(value) ?? '') : value
  if (Array.isArray(value)) return value.map(inlineBlobs)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inlineBlobs(v)]))
  }
  return value
}

// Save status, for the save controls --------------------------------------------------------

export interface SaveStatus {
  /** When anything was last autosaved (ms), or null if not this session. */
  savedAt: number | null
  /** The last save's failure, if it failed. */
  error: string | null
  /** The project file saves go to (Save writes there again), if one was picked. */
  fileName: string | null
}

let status: SaveStatus = { savedAt: null, error: null, fileName: null }
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SaveStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}

export function getSaveStatus(): SaveStatus {
  return status
}

export function subscribeSaveStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Other tabs ----------------------------------------------------------------------------------

/** Slots another tab has saved since this one loaded: this tab's copy is out of date. */
const savedElsewhere = new Set<SaveSlot>()

/**
 * Two tabs autosaving the same page would overwrite each other's work, last one wins. When
 * another tab saves a slot (the browser's `storage` event fires only in the *other* tabs),
 * this tab stops autosaving it and says so: reloading picks up the newer work.
 */
function watchOtherTabs() {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e) => {
    const slot = SAVE_SLOTS.find((s) => storageKey(s) === e.key)
    if (!slot || savedElsewhere.has(slot) || e.newValue === known.get(slot)) return
    savedElsewhere.add(slot)
    setStatus({
      error: `The ${slot} was changed in another tab, so this tab stopped autosaving it. Reload to continue here.`,
    })
  })
}
watchOtherTabs()

// Pending autosaves ----------------------------------------------------------------------------

const flushes = new Set<() => void>()
let suspended = false

/** Register a page's pending-autosave flush (so a manual save includes its latest state). */
export function registerFlush(flush: () => void): () => void {
  flushes.add(flush)
  return () => flushes.delete(flush)
}

/** Write every pending autosave now. */
export function flushAutosaves(): void {
  flushes.forEach((flush) => flush())
}

/** Stop autosaving until the page reloads: an opened project was just written to storage,
 *  and the page closing must not overwrite it with what was on screen. */
export function suspendAutosave(): void {
  suspended = true
}

// Project files --------------------------------------------------------------------------------

const APP = 'rgd-generator'

/** A saved project: every page's autosave, plus the timeline (Theatre's own save data). */
export interface ProjectFile {
  app: typeof APP
  version: 1
  savedAt: string
  canvas?: unknown
  generator?: unknown
  /** Theatre's project state (keyframes, sequence length), when the timeline was loaded. */
  timeline?: unknown
}

/** The project as it is now (pending autosaves written first). */
export function buildProjectFile(timeline: unknown = undefined): ProjectFile {
  flushAutosaves()
  const file: ProjectFile = { app: APP, version: 1, savedAt: new Date().toISOString() }
  for (const slot of SAVE_SLOTS) {
    // Images are stored apart from the documents: put them back in, so the file is whole.
    const value = readSaved(slot)
    if (value !== undefined) file[slot] = inlineBlobs(value)
  }
  if (timeline !== undefined && timeline !== null) file.timeline = timeline
  return file
}

/** A project file's contents, or null if it isn't one. */
export function parseProjectFile(text: string): ProjectFile | null {
  try {
    const value = JSON.parse(text) as Partial<ProjectFile> | null
    if (!value || typeof value !== 'object' || value.app !== APP || value.version !== 1) return null
    return value as ProjectFile
  } catch {
    return null
  }
}

/** Put an opened project's pages in storage (reload to show them). */
export function restoreProjectFile(file: ProjectFile): void {
  for (const slot of SAVE_SLOTS) {
    try {
      if (file[slot] === undefined) window.localStorage.removeItem(storageKey(slot))
      else window.localStorage.setItem(storageKey(slot), JSON.stringify(file[slot]))
      known.delete(slot)
    } catch {
      // Reported by the next autosave; nothing else to do here.
    }
  }
}

/** The File System Access API's save picker (Chromium), where available. */
interface SaveFileHandle {
  name: string
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}
type SavePicker = (options: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<SaveFileHandle>

let fileHandle: SaveFileHandle | null = null

/**
 * Write a project file to disk. Where the browser can (Chromium), the first save asks where
 * and later ones overwrite that file, like a desktop app (`saveAs` asks again); elsewhere
 * each save downloads a copy. Resolves with the file's name, or null if cancelled.
 */
export async function saveProjectToDisk(
  file: ProjectFile,
  { saveAs = false }: { saveAs?: boolean } = {},
): Promise<string | null> {
  const json = JSON.stringify(file, null, 2)
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  if (picker) {
    try {
      if (!fileHandle || saveAs) {
        fileHandle = await picker({
          suggestedName: 'rgd-project.json',
          types: [{ description: 'RGD project', accept: { 'application/json': ['.json'] } }],
        })
      }
      const writable = await fileHandle.createWritable()
      await writable.write(json)
      await writable.close()
      setStatus({ fileName: fileHandle.name, error: null })
      return fileHandle.name
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      setStatus({ error: `Save failed: ${String(error)}` })
      throw error
    }
  }
  const stamp = file.savedAt.slice(0, 16).replace(/[:T]/g, '-')
  const name = `rgd-project-${stamp}.json`
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  setStatus({ fileName: name, error: null })
  return name
}
