// Everything the user creates stays in this browser (IndexedDB). Nothing is stored on our server.

const DB_NAME = 'ahead';
const VERSION = 1;
const STORES = ['kv', 'images', 'checkins'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = op(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const get = <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const put = (store: StoreName, key: string, value: unknown) => run<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key));
export const del = (store: StoreName, key: string) => run<undefined>(store, 'readwrite', (s) => s.delete(key));
export const all = <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll());
export const keys = (store: StoreName) => run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys());

/** Deletes every photo, result and check-in on this device. */
export async function wipeAll(): Promise<void> {
  await Promise.all(STORES.map((name) => run(name, 'readwrite', (s) => s.clear())));
}

export const newId = () => `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
