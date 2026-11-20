// A small, browser-compatible IndexedDB stand-in for tests: open/upgrade, transactions and
// the object-store operations the image asset store uses (get, put, delete, getAllKeys).
// Requests and transactions complete asynchronously, as in a browser.

type Handler = ((event: { target: unknown }) => void) | null

class FakeRequest<T> {
  result!: T
  error: unknown = null
  onsuccess: Handler = null
  onerror: Handler = null
  onupgradeneeded: Handler = null
  onblocked: Handler = null
  addEventListener(type: string, handler: (event: unknown) => void) {
    if (type === 'success') this.onsuccess = handler
    if (type === 'error') this.onerror = handler
  }
  succeed(result: T) {
    this.result = result
    setTimeout(() => this.onsuccess?.({ target: this }), 0)
  }
  fail(error: unknown) {
    this.error = error
    setTimeout(() => this.onerror?.({ target: this }), 0)
  }
}

interface StoreData {
  keyPath: string
  values: Map<unknown, unknown>
}

class FakeObjectStore {
  private readonly store: StoreData
  private readonly transaction: FakeTransaction
  constructor(store: StoreData, transaction: FakeTransaction) {
    this.store = store
    this.transaction = transaction
  }
  private operation<T>(run: () => T): FakeRequest<T> {
    const request = new FakeRequest<T>()
    this.transaction.begin()
    setTimeout(() => {
      const result = run()
      request.succeed(result)
      this.transaction.end()
    }, 0)
    return request
  }
  get(key: unknown): FakeRequest<unknown> {
    return this.operation(() => this.store.values.get(key))
  }
  put(value: Record<string, unknown>): FakeRequest<unknown> {
    return this.operation(() => {
      const key = value[this.store.keyPath]
      this.store.values.set(key, { ...value })
      return key
    })
  }
  delete(key: unknown): FakeRequest<undefined> {
    return this.operation(() => {
      this.store.values.delete(key)
      return undefined
    })
  }
  getAllKeys(): FakeRequest<unknown[]> {
    return this.operation(() => [...this.store.values.keys()])
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null
  onerror: ((event?: unknown) => void) | null = null
  onabort: ((event?: unknown) => void) | null = null
  error: unknown = null
  private pending = 0
  private completed = false

  private readonly database: FakeDatabase
  constructor(database: FakeDatabase) {
    this.database = database
    setTimeout(() => this.maybeComplete(), 0)
  }

  objectStore(name: string): FakeObjectStore {
    const store = this.database.stores.get(name)
    if (!store) throw new Error(`No object store ${name}`)
    return new FakeObjectStore(store, this)
  }

  begin() {
    this.pending++
  }

  end() {
    this.pending--
    this.maybeComplete()
  }

  abort() {
    if (this.completed) return
    this.completed = true
    this.error = new Error('aborted')
    setTimeout(() => this.onabort?.(), 0)
  }

  private maybeComplete() {
    if (this.completed || this.pending > 0) return
    this.completed = true
    setTimeout(() => this.oncomplete?.(), 0)
  }
}

class FakeDatabase {
  readonly name: string
  readonly version: number
  readonly stores = new Map<string, StoreData>()
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  }
  constructor(name: string, version: number) {
    this.name = name
    this.version = version
  }
  createObjectStore(name: string, options: { keyPath: string }) {
    this.stores.set(name, { keyPath: options.keyPath, values: new Map() })
  }
  transaction(name: string) {
    if (!this.stores.has(name)) throw new Error(`No object store ${name}`)
    return new FakeTransaction(this)
  }
  close() {}
}

class FakeIndexedDB {
  private readonly databases = new Map<string, FakeDatabase>()

  open(name: string, version = 1): FakeRequest<FakeDatabase> {
    const request = new FakeRequest<FakeDatabase>()
    setTimeout(() => {
      const existing = this.databases.get(name)
      const database = existing ?? new FakeDatabase(name, version)
      if (!existing) this.databases.set(name, database)
      request.result = database
      // The upgrade needs the request's result too; set it before firing.
      request.onupgradeneeded?.({ target: request })
      setTimeout(() => request.succeed(database), 0)
    }, 0)
    return request
  }

  deleteDatabase(name: string): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>()
    setTimeout(() => {
      this.databases.delete(name)
      request.succeed(undefined)
    }, 0)
    return request
  }
}

/** A fresh fake IndexedDB factory (each has its own databases). */
export function createFakeIndexedDb(): IDBFactory {
  return new FakeIndexedDB() as unknown as IDBFactory
}
