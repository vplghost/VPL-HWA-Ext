import { computeActiveAutomations } from '../composables/useActiveAutomations.ts';
import { getAmountAt, isMarchExpired, getMarchBadgeInfo } from '../utils/resourceData.ts';
import { gatheringProgress } from '../utils/gatheringProgress.ts';
import { calculateAccountMaxMarches } from '../utils/dashboardState.ts';
import { hospital as computeHospital } from './mineDefense.ts';

export interface RemoteBridgeSettings {
  enabled: boolean;
  endpointUrl: string;
  bootstrapKey?: string;
  clientGuid: string;
  deviceToken: string;
  otpSecret: string;
}

export interface RemoteCommandLogItem {
  id: string;
  action: string;
  status: 'done' | 'failed';
  message: string;
  at: number;
}

export interface RemoteBridgeState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError?: string | null;
  lastSyncedAt?: number | null;
  pairedEndpoint?: string | null;
  recentCommands?: RemoteCommandLogItem[];
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const ALLOWED_TOGGLE_TARGETS = new Set([
  'autoGather',
  'mineDefense',
  'autoHeal',
  'autoTrain',
  'energyBurn',
  'expiringClaims',
  'shopFavorites',
]);

export const ALLOWED_STOP_QUEUES = new Set([
  'raid',
  'monster',
  'tower',
  'dungeon',
  'building',
  'research',
]);

export const ALLOWED_SPECIAL_TRIGGERS = new Set([
  'run-daily-autopilot',
  'run-batch-heal',
  'claim-freebies',
]);

function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export function generateRandomHex(byteLength = 24): string {
  return [...randomBytes(byteLength)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateBase32Secret(byteLength = 20): string {
  const bytes = randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function createDefaultRemoteBridgeSettings(): RemoteBridgeSettings {
  const guid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : '00000000-0000-4000-8000-000000000000';
  return {
    enabled: false,
    endpointUrl: '',
    bootstrapKey: '',
    clientGuid: guid,
    deviceToken: generateRandomHex(24),
    otpSecret: generateBase32Secret(20),
  };
}

export function normalizeRemoteBridgeSettings(raw: any): RemoteBridgeSettings {
  const base = createDefaultRemoteBridgeSettings();
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: raw.enabled === true,
    endpointUrl: typeof raw.endpointUrl === 'string' ? raw.endpointUrl.trim() : '',
    bootstrapKey: typeof raw.bootstrapKey === 'string' ? raw.bootstrapKey.trim() : '',
    clientGuid: typeof raw.clientGuid === 'string' && raw.clientGuid.trim() ? raw.clientGuid.trim() : base.clientGuid,
    deviceToken:
      typeof raw.deviceToken === 'string' && raw.deviceToken.trim().length >= 16
        ? raw.deviceToken.trim()
        : base.deviceToken,
    otpSecret:
      typeof raw.otpSecret === 'string' && raw.otpSecret.replace(/[^A-Z2-7]/gi, '').length >= 16
        ? raw.otpSecret.trim().toUpperCase()
        : base.otpSecret,
  };
}

function isLocalOrLanHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m172 = h.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  return false;
}

/**
 * Validates and normalizes endpoint URL.
 * Accepts https:// anywhere, and http:// only for localhost / RFC-1918 LAN IPs / *.local.
 */
export function normalizeEndpointUrl(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:') {
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  }
  if (parsed.protocol === 'http:' && isLocalOrLanHost(parsed.hostname)) {
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  }
  return null;
}

export function buildMobilePairUrl(endpointUrl: string, clientGuid: string): string | null {
  const norm = normalizeEndpointUrl(endpointUrl);
  if (!norm || !clientGuid) return null;
  return `${norm}/?guid=${encodeURIComponent(clientGuid)}`;
}

export function toWebSocketUrl(endpointUrl: string, wsPath: string): string | null {
  const norm = normalizeEndpointUrl(endpointUrl);
  if (!norm) return null;
  const wsOrigin = norm.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  return `${wsOrigin}${wsPath.startsWith('/') ? wsPath : '/' + wsPath}`;
}

function base32DecodeBytes(secret: string): Uint8Array {
  const cleaned = String(secret || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/**
 * RFC 6238 6-digit TOTP (HMAC-SHA1, 30s period) using WebCrypto.
 * Matches HWA-ControlPanel/src/totp.mjs bit-for-bit.
 */
export async function generateTotpCode(
  secretBase32: string,
  now: number = Date.now(),
  periodSec = 30
): Promise<{ code: string; remainingSeconds: number; step: number }> {
  const keyBytes = base32DecodeBytes(secretBase32);
  if (keyBytes.length < 10) throw new Error('OTP secret is too short');
  const step = Math.floor(now / 1000 / periodSec);
  const counter = new Uint8Array(8);
  const view = new DataView(counter.buffer);
  view.setBigUint64(0, BigInt(step), false);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', cryptoKey, counter));
  const offset = sig[sig.length - 1] & 0x0f;
  const codeInt =
    (((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff)) %
    1_000_000;
  const elapsed = Math.floor(now / 1000) % periodSec;
  return {
    code: String(codeInt).padStart(6, '0'),
    remainingSeconds: periodSec - elapsed,
    step,
  };
}

export function validateRemoteCommand(cmd: any): { ok: true; action: string; payload: Record<string, any> } | { ok: false; error: string } {
  if (!cmd || typeof cmd !== 'object') return { ok: false, error: 'Invalid command object' };
  const action = String(cmd.action || '').trim();
  const payload = cmd.payload && typeof cmd.payload === 'object' ? cmd.payload : {};

  if (action === 'refresh-snapshot' || action === 'emergency-recall-gatherers') {
    return { ok: true, action, payload: {} };
  }
  if (action === 'toggle-automation') {
    const target = String(payload.target || '').trim();
    if (!ALLOWED_TOGGLE_TARGETS.has(target)) {
      return { ok: false, error: `Unsupported toggle target: ${target}` };
    }
    const enabled = typeof payload.enabled === 'boolean' ? payload.enabled : undefined;
    return { ok: true, action, payload: { target, ...(enabled !== undefined ? { enabled } : {}) } };
  }
  if (action === 'stop-queue') {
    const queue = String(payload.queue || '').trim();
    if (!ALLOWED_STOP_QUEUES.has(queue)) {
      return { ok: false, error: `Unsupported queue target: ${queue}` };
    }
    return { ok: true, action, payload: { queue } };
  }
  if (action === 'trigger-special') {
    const trigger = String(payload.trigger || '').trim();
    if (!ALLOWED_SPECIAL_TRIGGERS.has(trigger)) {
      return { ok: false, error: `Unsupported special trigger: ${trigger}` };
    }
    return { ok: true, action, payload: { trigger } };
  }
  return { ok: false, error: `Disallowed remote command: ${action}` };
}

/**
 * Builds a strictly sanitized telemetry snapshot for mobile viewing.
 * Never includes cookies, auth headers, lastRpcHeaders, or deviceToken.
 */
export function buildRemoteTelemetrySnapshot(
  stored: Record<string, any>,
  now: number = Date.now(),
  extras: { gameTabOnline?: boolean } = {}
) {
  const cache = stored?.rpcCache || {};
  const accountId = cache.accountStatus?.data?.id ?? cache.userGetInfo?.data?.id ?? null;
  const accountName = cache.accountStatus?.data?.name ?? cache.userGetInfo?.data?.name ?? null;

  const worldEnergyEntry = cache['resource:world-energy'];
  const campaignEnergyEntry = cache['resource:energy'] ?? cache['resource:refillable:1'];
  const worldEnergy = getAmountAt(worldEnergyEntry, now);
  const campaignEnergy = getAmountAt(campaignEnergyEntry, now);

  const rawMarches = Array.isArray(cache.marchStatus?.data?.marches)
    ? cache.marchStatus.data.marches
    : cache.marchStatus?.data?.marches && typeof cache.marchStatus.data.marches === 'object'
      ? Object.values(cache.marchStatus.data.marches)
      : [];
  const gatheringMarches = rawMarches.filter((m: any) => {
    if (isMarchExpired(m, now)) return false;
    const badge = getMarchBadgeInfo(m, now);
    return (
      badge.category === 'gather' ||
      Boolean(m?.mineId) ||
      ['food', 'wood', 'stone', 'iron', 'mine'].includes(m?.kind)
    );
  });
  const marchRows = gatheringMarches.map((m: any) => gatheringProgress(m, now, cache));
  const totalCap = marchRows.reduce((s: number, r: any) => s + (r.total || 0), 0);
  const totalCol = marchRows.reduce((s: number, r: any) => s + (r.collected || 0), 0);
  const gatherProgressPct = totalCap > 0 ? Math.round((totalCol / totalCap) * 1000) / 10 : null;

  const hospital = computeHospital(cache, now);
  const defenseState = stored?.smartGatherState?.defense;
  const incomingAttacks = Object.values(cache.incomingMineAttacks?.data?.attacks || {}).filter(
    (a: any) => Number(a?.impactAt) > now
  );

  const automations = computeActiveAutomations(stored).map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    statusTone: item.statusTone,
  }));

  const rawLogs = Array.isArray(stored?.automationLogs) ? stored.automationLogs : [];
  const recentLogs = rawLogs.slice(-15).reverse().map((l: any) => ({
    at: l?.timestamp ?? l?.at ?? null,
    level: l?.level ?? 'info',
    source: l?.source ?? l?.category ?? 'automation',
    message: String(l?.message ?? '').slice(0, 240),
  }));

  return {
    capturedAt: now,
    account: { id: accountId, name: accountName },
    gameTabOnline: Boolean(extras.gameTabOnline),
    energy: {
      world: typeof worldEnergy === 'number' && Number.isFinite(worldEnergy) ? Math.floor(worldEnergy) : null,
      worldCap: Number.isFinite(worldEnergyEntry?.data?.cap) ? Number(worldEnergyEntry.data.cap) : null,
      campaign: typeof campaignEnergy === 'number' && Number.isFinite(campaignEnergy) ? Math.floor(campaignEnergy) : null,
      campaignCap: Number.isFinite(campaignEnergyEntry?.data?.cap) ? Number(campaignEnergyEntry.data.cap) : null,
    },
    gathering: {
      activeMarches: gatheringMarches.length,
      maxMarches: stored?.autoGatherSettings?.maxMarches ?? calculateAccountMaxMarches(cache),
      progressPct: gatherProgressPct,
      enabled: stored?.autoGatherSettings?.enabled === true,
      waitingForTroops: Boolean(stored?.smartGatherState?.waitingForTroops),
      status: stored?.smartGatherState?.status || '',
    },
    mineDefense: {
      enabled: stored?.autoGatherSettings?.defenseRecallEnabled !== false,
      alertActive: Boolean(defenseState?.pending || defenseState?.intercept || incomingAttacks.length > 0),
      incomingCount: incomingAttacks.length,
      status: defenseState?.status || '',
    },
    infirmary: hospital
      ? {
          wounded: hospital.wounded,
          capacity: hospital.capacity,
          pct: hospital.capacity > 0 ? Math.round((hospital.wounded / hospital.capacity) * 1000) / 10 : 0,
        }
      : null,
    toggles: {
      autoGather: stored?.autoGatherSettings?.enabled === true,
      mineDefense: stored?.autoGatherSettings?.defenseRecallEnabled !== false,
      autoHeal: stored?.troopHealSettings?.autoHealEnabled === true,
      autoTrain: stored?.troopTrainSettings?.autoTrainEnabled === true,
      energyBurn: stored?.energyAutoBurnSettings?.enabled === true,
      expiringClaims: stored?.expiringClaimSettings?.enabled === true,
      shopFavorites: stored?.autoShopFavoritesEnabled === true,
    },
    activeAutomations: automations,
    recentLogs,
  };
}
