/**
 * Standardized typed storage store abstraction for HWA Helper extension.
 * Replaces reliance on globalThis for inter-module state sharing.
 */

export interface StorageArea {
  get<T = any>(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, T>>;
  set(items: Record<string, any>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear?(): Promise<void>;
}

// Memory fallback store for unit tests or non-extension runtime
class MemoryStorageArea implements StorageArea {
  private data = new Map<string, any>();

  async get<T = any>(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, T>> {
    const result: Record<string, any> = {};
    if (keys == null) {
      for (const [k, v] of this.data.entries()) {
        result[k] = structuredClone(v);
      }
      return result;
    }
    if (typeof keys === 'string') {
      if (this.data.has(keys)) {
        result[keys] = structuredClone(this.data.get(keys));
      }
      return result;
    }
    if (Array.isArray(keys)) {
      for (const k of keys) {
        if (this.data.has(k)) {
          result[k] = structuredClone(this.data.get(k));
        }
      }
      return result;
    }
    for (const [k, defaultVal] of Object.entries(keys)) {
      result[k] = this.data.has(k) ? structuredClone(this.data.get(k)) : defaultVal;
    }
    return result;
  }

  async set(items: Record<string, any>): Promise<void> {
    for (const [k, v] of Object.entries(items)) {
      this.data.set(k, structuredClone(v));
    }
  }

  async remove(keys: string | string[]): Promise<void> {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) {
      this.data.delete(k);
    }
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

function getChromeStorage(area: 'local' | 'session'): StorageArea {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
    return chrome.storage[area];
  }
  return new MemoryStorageArea();
}

export const localStorageStore = {
  async get<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
    const storage = getChromeStorage('local');
    const res = await storage.get([key]);
    return res[key] !== undefined ? (res[key] as T) : defaultValue;
  },

  async getMultiple<T = Record<string, any>>(keys: string[]): Promise<T> {
    const storage = getChromeStorage('local');
    return (await storage.get(keys)) as T;
  },

  async getAll(): Promise<Record<string, any>> {
    const storage = getChromeStorage('local');
    return await storage.get(null);
  },

  async set(key: string, value: any): Promise<void> {
    const storage = getChromeStorage('local');
    await storage.set({ [key]: value });
  },

  async setMultiple(items: Record<string, any>): Promise<void> {
    const storage = getChromeStorage('local');
    await storage.set(items);
  },

  async remove(keys: string | string[]): Promise<void> {
    const storage = getChromeStorage('local');
    await storage.remove(keys);
  },

  async mutate<T = any>(key: string, updater: (current: T | undefined) => T | Promise<T>): Promise<T> {
    const current = await this.get<T>(key);
    const updated = await updater(current);
    await this.set(key, updated);
    return updated;
  },
};

export const sessionStorageStore = {
  async get<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
    const storage = getChromeStorage('session');
    const res = await storage.get([key]);
    return res[key] !== undefined ? (res[key] as T) : defaultValue;
  },

  async set(key: string, value: any): Promise<void> {
    const storage = getChromeStorage('session');
    await storage.set({ [key]: value });
  },

  async remove(keys: string | string[]): Promise<void> {
    const storage = getChromeStorage('session');
    await storage.remove(keys);
  },
};
