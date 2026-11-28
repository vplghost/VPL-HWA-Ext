import {
  normalizeRemoteBridgeSettings,
  normalizeEndpointUrl,
  toWebSocketUrl,
  validateRemoteCommand,
  buildRemoteTelemetrySnapshot,
  type RemoteBridgeSettings,
  type RemoteBridgeState,
} from '../services/remoteBridgeService.ts';

export const REMOTE_BRIDGE_ALARM = 'hwa-remote-bridge-keepalive';

const SNAPSHOT_STORAGE_KEYS = [
  'rpcCache',
  'autoGatherSettings',
  'smartGatherState',
  'troopTrainSettings',
  'autoTrainState',
  'troopHealSettings',
  'autoHealState',
  'energyAutoBurnSettings',
  'energyAutoBurnState',
  'expiringClaimSettings',
  'expiringClaimState',
  'autoShopFavoritesEnabled',
  'raidQueue',
  'monsterQueue',
  'buildingQueue',
  'researchQueue',
  'towerRun',
  'dungeonRun',
  'activeResourceLocks',
  'automationLogs',
];

let activeWs: WebSocket | null = null;
let activeWsKey = '';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let snapshotDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function updateBridgeState(cr: any, patch: Partial<RemoteBridgeState>) {
  try {
    const prev = (await cr?.storage?.local?.get('remoteBridgeState'))?.remoteBridgeState || {};
    await cr?.storage?.local?.set({
      remoteBridgeState: { ...prev, ...patch },
    });
  } catch (_) {}
}

async function appendRecentCommand(
  cr: any,
  entry: { id: string; action: string; status: 'done' | 'failed'; message: string; at: number }
) {
  try {
    const prev = (await cr?.storage?.local?.get('remoteBridgeState'))?.remoteBridgeState || {};
    const list = Array.isArray(prev.recentCommands) ? prev.recentCommands : [];
    const next = [entry, ...list.filter((r: any) => r?.id !== entry.id)].slice(0, 15);
    await cr?.storage?.local?.set({
      remoteBridgeState: { ...prev, recentCommands: next },
    });
  } catch (_) {}
}

export async function checkRemoteBridgeConnection(endpointUrl: string): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const norm = normalizeEndpointUrl(endpointUrl);
  if (!norm) return { ok: false, error: 'Invalid endpoint URL (use https:// or local LAN http://)' };
  const started = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${norm}/healthz`, { method: 'GET', signal: ctrl.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    if (data?.ok !== true) return { ok: false, latencyMs, error: 'Unexpected /healthz response' };
    return { ok: true, latencyMs };
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'Connection timed out (5s)' : String(err?.message || err) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function pairRemoteBridge(settings: RemoteBridgeSettings): Promise<{ ok: boolean; error?: string }> {
  const norm = normalizeEndpointUrl(settings.endpointUrl);
  if (!norm) return { ok: false, error: 'Invalid endpoint URL' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.bootstrapKey) headers['X-Bootstrap-Key'] = settings.bootstrapKey;
  try {
    const res = await fetch(`${norm}/api/ext/pair`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientGuid: settings.clientGuid,
        deviceToken: settings.deviceToken,
        otpSecret: settings.otpSecret,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `Pair failed (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function revokeRemoteSessions(cr: any): Promise<{ ok: boolean; revoked?: number; error?: string }> {
  const raw = (await cr?.storage?.local?.get('remoteBridgeSettings'))?.remoteBridgeSettings;
  const settings = normalizeRemoteBridgeSettings(raw);
  const norm = normalizeEndpointUrl(settings.endpointUrl);
  if (!norm) return { ok: false, error: 'No valid endpoint URL configured' };
  try {
    const res = await fetch(`${norm}/api/ext/revoke-sessions`, {
      method: 'POST',
      headers: {
        'X-Client-Guid': settings.clientGuid,
        Authorization: `Bearer ${settings.deviceToken}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, revoked: data.revoked ?? 0 };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function buildAndPushSnapshot(
  cr: any,
  hasGameTab: () => Promise<boolean>
): Promise<{ ok: boolean; snapshot?: any }> {
  const raw = (await cr?.storage?.local?.get('remoteBridgeSettings'))?.remoteBridgeSettings;
  const settings = normalizeRemoteBridgeSettings(raw);
  if (!settings.enabled) return { ok: false };
  const norm = normalizeEndpointUrl(settings.endpointUrl);
  if (!norm) return { ok: false };

  const stored = (await cr?.storage?.local?.get(SNAPSHOT_STORAGE_KEYS)) || {};
  const gameTabOnline = await hasGameTab().catch(() => false);
  const now = Date.now();
  const snapshot = buildRemoteTelemetrySnapshot(stored, now, { gameTabOnline });

  if (activeWs && activeWs.readyState === 1) {
    try {
      activeWs.send(JSON.stringify({ type: 'snapshot', snapshot }));
      await updateBridgeState(cr, { lastSyncedAt: now, lastError: null });
      return { ok: true, snapshot };
    } catch (_) {}
  }

  try {
    const res = await fetch(`${norm}/api/ext/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Guid': settings.clientGuid,
        Authorization: `Bearer ${settings.deviceToken}`,
      },
      body: JSON.stringify({ snapshot }),
    });
    if (res.ok) {
      await updateBridgeState(cr, { lastSyncedAt: now, lastError: null });
      return { ok: true, snapshot };
    }
  } catch (_) {}
  return { ok: false, snapshot };
}

export function disconnectRemoteBridge(cr?: any) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (snapshotDebounceTimer) {
    clearTimeout(snapshotDebounceTimer);
    snapshotDebounceTimer = null;
  }
  reconnectAttempt = 0;
  activeWsKey = '';
  if (activeWs) {
    try {
      activeWs.close(1000, 'Disabled');
    } catch (_) {}
    activeWs = null;
  }
  cr?.alarms?.clear?.(REMOTE_BRIDGE_ALARM);
}

export async function ensureRemoteBridgeConnected(
  cr: any,
  opts: {
    forcePair?: boolean;
    hasGameTab: () => Promise<boolean>;
    executeCommand: (action: string, payload: Record<string, any>) => Promise<{ ok: boolean; message: string; data?: any }>;
  }
) {
  const raw = (await cr?.storage?.local?.get('remoteBridgeSettings'))?.remoteBridgeSettings;
  const settings = normalizeRemoteBridgeSettings(raw);
  const norm = normalizeEndpointUrl(settings.endpointUrl);

  if (!settings.enabled || !norm) {
    disconnectRemoteBridge(cr);
    await updateBridgeState(cr, { status: 'disconnected', lastError: null });
    return;
  }

  cr?.alarms?.create?.(REMOTE_BRIDGE_ALARM, { periodInMinutes: 1 });

  const wsKey = `${norm}|${settings.clientGuid}|${settings.deviceToken}`;
  if (!opts.forcePair && activeWs && activeWs.readyState === 1 && activeWsKey === wsKey) {
    return;
  }

  if (activeWs) {
    try {
      activeWs.close(1000, 'Reconnecting');
    } catch (_) {}
    activeWs = null;
  }

  await updateBridgeState(cr, { status: 'connecting', lastError: null });
  const pairRes = await pairRemoteBridge(settings);
  if (!pairRes.ok) {
    await updateBridgeState(cr, { status: 'error', lastError: pairRes.error || 'Pairing failed' });
    scheduleReconnect(cr, opts);
    return;
  }

  const wsUrl = toWebSocketUrl(norm, '/ws/extension');
  if (!wsUrl || typeof WebSocket === 'undefined') {
    await updateBridgeState(cr, { status: 'error', lastError: 'WebSocket unavailable in this runtime' });
    return;
  }

  const ws = new WebSocket(wsUrl);
  activeWs = ws;
  activeWsKey = wsKey;

  ws.addEventListener('open', () => {
    if (activeWs !== ws) return;
    reconnectAttempt = 0;
    ws.send(JSON.stringify({ type: 'auth', guid: settings.clientGuid, token: settings.deviceToken }));
  });

  ws.addEventListener('message', async (ev) => {
    if (activeWs !== ws) return;
    let msg: any;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg?.type === 'connected') {
      await updateBridgeState(cr, { status: 'connected', lastError: null, pairedEndpoint: norm });
      await buildAndPushSnapshot(cr, opts.hasGameTab);
      return;
    }
    if (msg?.type === 'command' && msg.command) {
      const cmd = msg.command;
      const valid = validateRemoteCommand(cmd);
      let execResult: { ok: boolean; message: string; data?: any };
      if (!valid.ok) {
        execResult = { ok: false, message: valid.error };
      } else {
        try {
          execResult = await opts.executeCommand(valid.action, valid.payload);
        } catch (err: any) {
          execResult = { ok: false, message: String(err?.message || err) };
        }
      }
      const { snapshot } = await buildAndPushSnapshot(cr, opts.hasGameTab);
      const ackStatus = execResult.ok ? 'done' : 'failed';
      await appendRecentCommand(cr, {
        id: String(cmd.id || Date.now()),
        action: String(cmd.action || 'unknown'),
        status: ackStatus,
        message: execResult.message,
        at: Date.now(),
      });
      const ackPayload = {
        type: 'command-ack',
        id: cmd.id,
        status: ackStatus,
        result: { message: execResult.message, ...(execResult.data ? { data: execResult.data } : {}) },
        snapshot,
      };
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(ackPayload));
      } else {
        await fetch(`${norm}/api/ext/command-ack`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Guid': settings.clientGuid,
            Authorization: `Bearer ${settings.deviceToken}`,
          },
          body: JSON.stringify(ackPayload),
        }).catch(() => {});
      }
    }
  });

  ws.addEventListener('close', async () => {
    if (activeWs !== ws) return;
    activeWs = null;
    await updateBridgeState(cr, { status: 'disconnected' });
    scheduleReconnect(cr, opts);
  });

  ws.addEventListener('error', async () => {
    if (activeWs !== ws) return;
    await updateBridgeState(cr, { status: 'error', lastError: 'WebSocket connection error' });
  });
}

function scheduleReconnect(
  cr: any,
  opts: {
    hasGameTab: () => Promise<boolean>;
    executeCommand: (action: string, payload: Record<string, any>) => Promise<{ ok: boolean; message: string; data?: any }>;
  }
) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delays = [2000, 5000, 15000, 30000];
  const delay = delays[Math.min(reconnectAttempt, delays.length - 1)];
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureRemoteBridgeConnected(cr, opts);
  }, delay);
}

export function scheduleSnapshotPush(cr: any, hasGameTab: () => Promise<boolean>) {
  if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);
  snapshotDebounceTimer = setTimeout(() => {
    snapshotDebounceTimer = null;
    void buildAndPushSnapshot(cr, hasGameTab);
  }, 2000);
}
