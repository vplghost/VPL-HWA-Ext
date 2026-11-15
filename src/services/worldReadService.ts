import type {
  WorldReadState,
  WorldReadPlanOptions,
  WorldReadPlanResult,
} from '../types/game/worldRead';

const list = (value: any): any[] =>
  Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

export function incomingTtl(cache: Record<string, any>, now: number): number {
  return list(cache.incomingMineAttacks?.data?.attacks).some((attack: any) => attack.impactAt > now)
    ? 15000
    : 60000;
}

export function key(call: any): string | null {
  if (call?.name === 'getIncomingMarches' && call?.feature === 'march') return 'incoming';
  if (
    call?.name === 'getRallyById' &&
    call?.feature === 'rally' &&
    typeof call.args?.rallyId === 'string'
  ) {
    return 'rally:' + call.args.rallyId + ':' + (call.args.mapId || '');
  }
  return null;
}

export function fresh(
  cache: Record<string, any>,
  call: any,
  now: number,
  after: number,
  version?: number | null
): boolean {
  const account = String(cache.accountStatus?.data?.id);
  if (key(call) === 'incoming') {
    const entry = cache.incomingMineAttacks;
    const at = Date.parse(entry?.updatedAt);
    return (
      String(entry?.data?.accountId) === account &&
      entry.data.snapshotAt > 0 &&
      at <= now &&
      at >= now - incomingTtl(cache, now)
    );
  }
  const data = cache.rallyReadStatus?.data;
  const row = String(data?.accountId) === account ? data.rallies?.[call.args.rallyId] : null;
  if (!row || (call.args.mapId && call.args.mapId !== row.mapId)) return false;
  return (
    row.at <= now &&
    row.at >= now - 60000 &&
    (Number.isFinite(version) && Number.isFinite(row.version)
      ? (row.version as number) >= (version as number)
      : row.at >= after)
  );
}

export function wakeAt(state: WorldReadState | null | undefined): number | null {
  const times = Object.values(state?.entries || {})
    .filter((row: any) => row.pending)
    .map((row: any) => row.until);
  return times.length ? Math.min(...times) : null;
}

export function plan(
  previous: Record<string, any> | null | undefined,
  cache: Record<string, any>,
  calls: any[],
  now: number,
  options: WorldReadPlanOptions = {}
): WorldReadPlanResult {
  const accountId = cache.accountStatus?.data?.id;
  const state: WorldReadState = {
    accountId: accountId == null ? null : String(accountId),
    entries: {},
  };
  if (state.accountId != null && previous != null && String(previous.accountId) === state.accountId) {
    for (const [id, row] of Object.entries(previous.entries || {})) {
      if ((row as any).pending || now - (row as any).sentAt < 60000) {
        state.entries[id] = { ...(row as any) };
      }
    }
  }
  const allowed: any[] = [];
  for (const call of calls) {
    const id = key(call);
    if (!id || state.accountId == null) {
      allowed.push(call);
      continue;
    }
    const old = state.entries[id];
    const after = Math.max(options.after ?? now - 5000, old?.after || 0);
    const versions = [options.version, old?.version].filter((v): v is number => Number.isFinite(v));
    const version = versions.length ? Math.max(...versions) : null;
    if (options.isRallyCreated && old) {
      delete state.entries[id];
    }
    if (!options.isRallyCreated && fresh(cache, call, now, after, version)) {
      delete state.entries[id];
      continue;
    }
    if (!options.isRallyCreated && old && old.until > now) {
      old.pending =
        old.pending ||
        (id !== 'incoming' &&
          ((Number.isFinite(version) &&
            (!Number.isFinite(old.sentVersion) || (version as number) > (old.sentVersion as number))) ||
            (!Number.isFinite(options.version) && after > old.sentAt)));
      old.after = after;
      old.version = version;
      continue;
    }
    allowed.push(call);
    state.entries[id] = {
      call,
      tabId: options.tabId,
      after,
      version,
      sentVersion: version,
      sentAt: now,
      until: now + (id === 'incoming' ? 10000 : 5000),
      pending: false,
    };
  }
  const rows = Object.entries(state.entries);
  for (const [id] of rows.slice(0, Math.max(0, rows.length - 200))) {
    delete state.entries[id];
  }
  return { state, calls: allowed, wakeAt: wakeAt(state) };
}

export const worldReadService = {
  incomingTtl,
  key,
  fresh,
  plan,
  wakeAt,
};

// Preserve backward compatibility for background service worker scripts and VM tests
if (typeof globalThis !== 'undefined') {
  if (!(globalThis as any).hwaHelperWorldRead) {
    (globalThis as any).hwaHelperWorldRead = worldReadService;
  }
}
