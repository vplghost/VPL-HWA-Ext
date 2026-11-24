/**
 * IndexedDB Offload Store for Game Window Recorder (`hwaRecorderDb`).
 * Keeps multi-megabyte session recordings out of `chrome.storage.local` (10 MB quota),
 * with an automatic in-memory fallback for Node.js unit test environments.
 */

export interface RecorderStore {
  readonly backend: 'indexeddb' | 'memory';
  appendApiRecords(records: any[]): Promise<number>;
  appendInteraction(entry: any): Promise<number>;
  getCounts(): Promise<{ apiCount: number; interactionCount: number }>;
  exportAll(): Promise<{ records: any[]; interactions: any[] }>;
  clear(): Promise<void>;
  estimateBytes(): Promise<number>;
}

const DB_NAME = 'hwaRecorderDb';
const DB_VERSION = 1;
const API_STORE = 'apiEntries';
const INTERACTION_STORE = 'interactionEntries';

function estimateEntrySize(item: any): number {
  try {
    return JSON.stringify(item).length * 2;
  } catch {
    return 256;
  }
}

export class InMemoryRecorderStore implements RecorderStore {
  readonly backend = 'memory' as const;
  private api: any[] = [];
  private interactions: any[] = [];
  private approxBytes = 0;

  async appendApiRecords(records: any[]): Promise<number> {
    if (!Array.isArray(records) || records.length === 0) return this.api.length;
    for (const r of records) {
      this.api.push(r);
      this.approxBytes += estimateEntrySize(r);
    }
    return this.api.length;
  }

  async appendInteraction(entry: any): Promise<number> {
    if (!entry) return this.interactions.length;
    this.interactions.push(entry);
    this.approxBytes += estimateEntrySize(entry);
    return this.interactions.length;
  }

  async getCounts(): Promise<{ apiCount: number; interactionCount: number }> {
    return { apiCount: this.api.length, interactionCount: this.interactions.length };
  }

  async exportAll(): Promise<{ records: any[]; interactions: any[] }> {
    return {
      records: this.api.slice(),
      interactions: this.interactions.slice(),
    };
  }

  async clear(): Promise<void> {
    this.api = [];
    this.interactions = [];
    this.approxBytes = 0;
  }

  async estimateBytes(): Promise<number> {
    return this.approxBytes;
  }
}

export class IndexedDbRecorderStore implements RecorderStore {
  readonly backend = 'indexeddb' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private approxBytes = 0;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(API_STORE)) {
          db.createObjectStore(API_STORE, { keyPath: 'idx', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(INTERACTION_STORE)) {
          db.createObjectStore(INTERACTION_STORE, { keyPath: 'idx', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        this.dbPromise = null;
        reject(req.error || new Error('Failed to open hwaRecorderDb'));
      };
    });
    return this.dbPromise;
  }

  async appendApiRecords(records: any[]): Promise<number> {
    if (!Array.isArray(records) || records.length === 0) {
      const { apiCount } = await this.getCounts();
      return apiCount;
    }
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(API_STORE, 'readwrite');
      const store = tx.objectStore(API_STORE);
      for (const r of records) {
        store.add({ payload: r });
        this.approxBytes += estimateEntrySize(r);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IDB appendApiRecords failed'));
    });
    const { apiCount } = await this.getCounts();
    return apiCount;
  }

  async appendInteraction(entry: any): Promise<number> {
    if (!entry) {
      const { interactionCount } = await this.getCounts();
      return interactionCount;
    }
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(INTERACTION_STORE, 'readwrite');
      tx.objectStore(INTERACTION_STORE).add({ payload: entry });
      this.approxBytes += estimateEntrySize(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IDB appendInteraction failed'));
    });
    const { interactionCount } = await this.getCounts();
    return interactionCount;
  }

  async getCounts(): Promise<{ apiCount: number; interactionCount: number }> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([API_STORE, INTERACTION_STORE], 'readonly');
      const apiReq = tx.objectStore(API_STORE).count();
      const intReq = tx.objectStore(INTERACTION_STORE).count();
      let apiCount = 0;
      let interactionCount = 0;
      apiReq.onsuccess = () => { apiCount = Number(apiReq.result) || 0; };
      intReq.onsuccess = () => { interactionCount = Number(intReq.result) || 0; };
      tx.oncomplete = () => resolve({ apiCount, interactionCount });
      tx.onerror = () => reject(tx.error || new Error('IDB getCounts failed'));
    });
  }

  private readAllFromStore(db: IDBDatabase, storeName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const out: any[] = [];
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out.push(cursor.value?.payload ?? cursor.value);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error || new Error(`IDB readAll ${storeName} failed`));
    });
  }

  async exportAll(): Promise<{ records: any[]; interactions: any[] }> {
    const db = await this.openDb();
    const [records, interactions] = await Promise.all([
      this.readAllFromStore(db, API_STORE),
      this.readAllFromStore(db, INTERACTION_STORE),
    ]);
    return { records, interactions };
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([API_STORE, INTERACTION_STORE], 'readwrite');
      tx.objectStore(API_STORE).clear();
      tx.objectStore(INTERACTION_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IDB clear failed'));
    });
    this.approxBytes = 0;
  }

  async estimateBytes(): Promise<number> {
    return this.approxBytes;
  }
}

let singletonStore: RecorderStore | null = null;

export function createRecorderStore(preferIndexedDb = true): RecorderStore {
  if (preferIndexedDb && typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function') {
    return new IndexedDbRecorderStore();
  }
  return new InMemoryRecorderStore();
}

export function getRecorderStore(): RecorderStore {
  if (!singletonStore) {
    singletonStore = createRecorderStore(true);
  }
  return singletonStore;
}
