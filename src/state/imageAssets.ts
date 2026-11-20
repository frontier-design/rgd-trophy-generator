// Image assets: large pattern sources are stored apart from the lightweight workspace
// documents, in IndexedDB (localStorage keeps the documents and preferences). Saved documents
// refer to an asset by content, as `rgd-asset:<id>`; project files get the image put back
// (inline, as a data URL) so they stand on their own in any browser.
//
// Legacy saves are still supported: embedded data URLs and localStorage `rgd-blob:<id>`
// references load as they did, and migrate into IndexedDB when persisted again. The legacy
// localStorage copy is never removed before the IndexedDB write has succeeded.

/** A stored asset's reference in saved documents. */
export const ASSET_PREFIX = 'rgd-asset:'
/** The prefix older saves used for localStorage-stored strings. */
export const LEGACY_BLOB_PREFIX = 'rgd-blob:'
const STORAGE_PREFIX = 'rgd-generator:'
const legacyBlobKey = (id: string) => `${STORAGE_PREFIX}blob:${id}`
const DATABASE = 'rgd-generator'
const STORE = 'images'
const DATABASE_VERSION = 1

/** What a store must do (IndexedDB in browsers; an in-memory/browser-compatible adapter in
 *  tests, or a mock). */
export interface ImageAssetStore {
  read(id: string): Promise<string | null>
  write(id: string, data: string): Promise<void>
  remove(id: string): Promise<void>
  keys(): Promise<string[]>
}

/** Ids of data URLs already hashed (long strings: hash each once). */
const contentIds = new Map<string, string>()
/** Data URLs of assets loaded or written this session, by reference (so rendering doesn't
 *  wait on IndexedDB again, and a sync document parse can find what this tab already has). */
const cache = new Map<string, string>()

/** A short, stable id for a string's content (FNV-1a, with its length), matching the ids
 *  legacy localStorage blobs were stored under. */
function contentId(text: string): string {
  let id = contentIds.get(text)
  if (id) return id
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  id = `${text.length.toString(36)}-${hash.toString(36)}`
  contentIds.set(text, id)
  return id
}

/** Whether a saved string refers to a stored image (IndexedDB asset or legacy blob). */
export function isImageAssetRef(value: string): boolean {
  return value.startsWith(ASSET_PREFIX) || value.startsWith(LEGACY_BLOB_PREFIX)
}

/** The legacy localStorage blob a reference or content id names, if it's still there. */
function readLegacyBlob(id: string): string | null {
  try {
    return window.localStorage.getItem(legacyBlobKey(id))
  } catch {
    return null
  }
}

/** The legacy localStorage copy of `data` (as older saves stored images), if it fits. */
function writeLegacyBlob(data: string): string | null {
  const id = contentId(data)
  try {
    if (window.localStorage.getItem(legacyBlobKey(id)) === null) {
      window.localStorage.setItem(legacyBlobKey(id), data)
    }
    return LEGACY_BLOB_PREFIX + id
  } catch {
    return null
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed'))
  })
}

/** The browser's IndexedDB, opened once (and reopened if a test swaps the factory). */
let databaseFactory: IDBFactory | null = null
let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  const factory = globalThis.indexedDB
  if (!factory) throw new Error('IndexedDB is not available')
  if (factory !== databaseFactory || !databasePromise) {
    databaseFactory = factory
    databasePromise = new Promise((resolve, reject) => {
      const opening = factory.open(DATABASE, DATABASE_VERSION)
      opening.onupgradeneeded = () => {
        const database = opening.result
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' })
      }
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error ?? new Error('IndexedDB could not open'))
      opening.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
    })
  }
  return databasePromise
}

function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  return openDatabase().then((database) =>
    new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode)
      let result: T
      let failure: unknown = null
      tx.oncomplete = () => (failure ? reject(failure) : resolve(result))
      tx.onerror = () => reject(tx.error ?? failure ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? failure ?? new Error('IndexedDB transaction aborted'))
      run(tx.objectStore(STORE)).then(
        (value) => (result = value),
        (error) => {
          failure = error
          try {
            tx.abort()
          } catch {
            // Already aborted.
          }
        },
      )
    }),
  )
}

/** The browser store: one record per content id, the data URL itself. */
const indexedDbStore: ImageAssetStore = {
  read: (id) => transaction('readonly', async (store) => {
    const record = (await request(store.get(id))) as { data?: unknown } | undefined
    return typeof record?.data === 'string' ? record.data : null
  }),
  write: (id, data) => transaction('readwrite', async (store) => {
    await request(store.put({ id, data }))
  }),
  remove: (id) => transaction('readwrite', async (store) => {
    await request(store.delete(id))
  }),
  keys: () => transaction('readonly', async (store) => {
    const keys = await request(store.getAllKeys())
    return keys.map(String)
  }),
}

/** An in-memory stand-in, for a browser without IndexedDB (the document then falls back to a
 *  legacy localStorage blob) and for tests that only need the API shape. */
function memoryStore(): ImageAssetStore {
  const entries = new Map<string, string>()
  return {
    read: async (id) => entries.get(id) ?? null,
    write: async (id, data) => void entries.set(id, data),
    remove: async (id) => void entries.delete(id),
    keys: async () => [...entries.keys()],
  }
}

let overrideStore: ImageAssetStore | null = null
let fallbackStore: ImageAssetStore | null = null

/** Replace the asset store (tests can install a browser-compatible fake or an adapter);
 *  null restores IndexedDB. */
export function setImageAssetStore(store: ImageAssetStore | null): void {
  overrideStore = store
  databasePromise = null
  databaseFactory = null
}

function store(): ImageAssetStore {
  if (overrideStore) return overrideStore
  if (!globalThis.indexedDB) {
    fallbackStore ??= memoryStore()
    return fallbackStore
  }
  return indexedDbStore
}

/** Forget session caches (tests isolate storage state). */
export function clearImageAssetCaches(): void {
  cache.clear()
  contentIds.clear()
  fallbackStore = null
}

/** Whether a stored string is a data URL (an embedded image) rather than a reference/URL. */
export function isEmbeddedImage(value: string): boolean {
  return value.startsWith('data:image/')
}

/**
 * Store an image (data URL) and return the reference a saved document uses: an IndexedDB
 * asset, or (where IndexedDB refuses) a legacy localStorage blob, or the data URL itself as a
 * last resort. Store only content that isn't one of those: URLs pass through unchanged.
 * Resolves only once the durable write has succeeded, so a document can't refer to an asset
 * that wasn't stored yet.
 */
export async function storeImageAsset(data: string): Promise<string> {
  if (!isEmbeddedImage(data)) return data
  const id = contentId(data)
  const ref = ASSET_PREFIX + id
  cache.set(ref, data)
  try {
    await store().write(id, data)
    return ref
  } catch {
    // No IndexedDB (or it refused): keep a durable legacy copy where possible.
    return writeLegacyBlob(data) ?? data
  }
}

/** The data URL behind a reference (or the value itself for a plain URL/data URL); null if
 *  it's missing. IndexedDB assets fall back to the legacy localStorage copy of the same
 *  content, and legacy references migrate into IndexedDB once read successfully. */
export async function loadImageAsset(value: string): Promise<string | null> {
  if (!value) return null
  if (!isImageAssetRef(value)) return value
  const cached = cache.get(value)
  if (cached) return cached
  const id = value.startsWith(ASSET_PREFIX)
    ? value.slice(ASSET_PREFIX.length)
    : value.slice(LEGACY_BLOB_PREFIX.length)

  if (value.startsWith(ASSET_PREFIX)) {
    try {
      const data = await store().read(id)
      if (data) {
        cache.set(value, data)
        return data
      }
    } catch {
      // Try the legacy copy below.
    }
  }

  const legacy = readLegacyBlob(id)
  if (!legacy) return null
  cache.set(value, legacy)
  // Migrate: write the durable IndexedDB copy. Keep the legacy copy (it is the only durable
  // one until this succeeds, and harmless afterwards).
  try {
    await store().write(id, legacy)
  } catch {
    // It still loads from localStorage.
  }
  return legacy
}

/** A reference's data URL from what this session has already loaded, or a legacy blob in
 *  localStorage; null when only an async IndexedDB read could find it. */
export function resolveImageAssetSync(value: string): string | null {
  if (!value) return null
  if (!isImageAssetRef(value)) return value
  const cached = cache.get(value)
  if (cached) return cached
  const id = value.startsWith(ASSET_PREFIX)
    ? value.slice(ASSET_PREFIX.length)
    : value.slice(LEGACY_BLOB_PREFIX.length)
  const legacy = readLegacyBlob(id)
  if (legacy) cache.set(value, legacy)
  return legacy
}

/** `value` with every image reference replaced by its data URL, recursively (for project
 *  files, which must stand on their own). Throws if a referenced image can't be read:
 *  a project must not save successfully with a missing image. */
export async function inlineImageAssets(value: unknown): Promise<unknown> {
  if (typeof value === 'string') {
    if (!isImageAssetRef(value)) return value
    const data = await loadImageAsset(value)
    if (data === null) throw new Error(`Missing image asset: ${value}`)
    return data
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => inlineImageAssets(item)))
  }
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [key, await inlineImageAssets(item)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}

/** `value` with every embedded image and legacy blob reference replaced by an IndexedDB
 *  asset reference, recursively (for putting a project file back into storage). Resolves
 *  once all assets are durably written, before the document refers to them. */
export async function storeEmbeddedImageAssets(value: unknown): Promise<unknown> {
  if (typeof value === 'string') {
    if (isEmbeddedImage(value)) return storeImageAsset(value)
    if (value.startsWith(LEGACY_BLOB_PREFIX)) {
      const data = await loadImageAsset(value)
      if (data === null) throw new Error(`Missing image asset: ${value}`)
      return storeImageAsset(data)
    }
    return value
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => storeEmbeddedImageAssets(item)))
  }
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(
        async ([key, item]) => [key, await storeEmbeddedImageAssets(item)] as const,
      ),
    )
    return Object.fromEntries(entries)
  }
  return value
}

/** Remove IndexedDB assets no saved document refers to any more (`refs`: the ones in use). */
export async function pruneImageAssets(refs: ReadonlySet<string>): Promise<void> {
  const used = new Set(
    [...refs]
      .filter((ref) => ref.startsWith(ASSET_PREFIX))
      .map((ref) => ref.slice(ASSET_PREFIX.length)),
  )
  try {
    const ids = await store().keys()
    const unused = ids.filter((id) => !used.has(id))
    await Promise.all(unused.map((id) => store().remove(id)))
    // Forgotten from this session too, so it doesn't look stored when it isn't.
    for (const id of unused) {
      cache.delete(ASSET_PREFIX + id)
      cache.delete(LEGACY_BLOB_PREFIX + id)
    }
  } catch {
    // It's only tidying.
  }
}
