/**
 * Internal Typed Event Bus for Background Runtime (`RuntimeEventBus`).
 * Dispatches every incoming API/MQTT record in strict sequential order with
 * a single source-of-truth `liveCache`, eliminating stale `chrome.storage.local` reads
 * and dropped events inside `api-record-batch`.
 */

export interface RuntimeDispatchContext {
  tabId: number;
  liveCache: Record<string, any>;
  chrome: any;
  now: number;
}

export type RuntimeEventTopic =
  | 'record:ingested'
  | `rpc:${string}`
  | `mqtt:${string}`
  | `alarm:${string}`
  | 'queue:state-changed';

export type RuntimeEventListener = (
  payload: any,
  ctx: RuntimeDispatchContext
) => Promise<void> | void;

export function extractRecordTopics(record: any): RuntimeEventTopic[] {
  const topics: RuntimeEventTopic[] = ['record:ingested'];
  if (!record || typeof record !== 'object') return topics;

  if (record.eventType && typeof record.eventType === 'string') {
    topics.push(`mqtt:${record.eventType}`);
  } else if (record.transport === 'websocket' || record.transport === 'mqtt') {
    try {
      const payload = typeof record.payload === 'string' ? JSON.parse(record.payload) : record.payload;
      const ev = payload?.result?.type || payload?.type || payload?.event;
      if (typeof ev === 'string' && ev) topics.push(`mqtt:${ev}`);
    } catch (_) {}
  }

  if (record.requestBody) {
    try {
      const parsed = typeof record.requestBody === 'string' ? JSON.parse(record.requestBody) : record.requestBody;
      const calls = Array.isArray(parsed?.calls) ? parsed.calls : (parsed?.name ? [parsed] : []);
      const seen = new Set<string>();
      for (const c of calls) {
        if (typeof c?.name === 'string' && c.name && !seen.has(c.name)) {
          seen.add(c.name);
          topics.push(`rpc:${c.name}`);
        }
      }
    } catch (_) {}
  }

  return topics;
}

export class RuntimeEventBus {
  private listeners = new Map<RuntimeEventTopic, Set<RuntimeEventListener>>();

  on(topic: RuntimeEventTopic, listener: RuntimeEventListener): () => void {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  async emit(topic: RuntimeEventTopic, payload: any, ctx: RuntimeDispatchContext): Promise<void> {
    const set = this.listeners.get(topic);
    if (!set || set.size === 0) return;
    for (const listener of Array.from(set)) {
      await listener(payload, ctx);
    }
  }

  async dispatchRecord(record: any, ctx: RuntimeDispatchContext): Promise<void> {
    if (!record) return;
    const topics = extractRecordTopics(record);
    for (const topic of topics) {
      await this.emit(topic, record, ctx);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export function createRuntimeEventBus(): RuntimeEventBus {
  return new RuntimeEventBus();
}
