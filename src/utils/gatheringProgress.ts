import { getMineTypeLevel } from './mineData.ts';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Estimates describe collection at the mine, not resources already delivered to the city. */
export function gatheringProgress(march: any, now = Date.now(), cache: Record<string, any> = {}) {
  const raw = cache.gatheringStatus?.data?.gatherings;
  const summaries: any[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const saved = cache.gatheringStatus?.data?.plans?.[march?.squadId];
  const summary = summaries.find(row => row && march?.squadId != null && String(row.squadId) === String(march.squadId)
    && (!march.mineId || row.mineId === march.mineId)) || (saved && (!march?.mineId || saved.mineId === march.mineId) ? saved : null);
  const mine = cache.mineMap?.[march?.mineId || summary?.mineId] || {};
  const configId = march?.mineConfigId ?? mine.mineConfigId;
  const config = configId ? getMineTypeLevel(configId) : null;
  const rawType = config?.type || mine.mineType || (march?.kind === 'return' ? march?.previousKind : march?.kind);
  const type = ['food', 'wood', 'stone', 'iron'].includes(rawType) ? rawType : null;
  const resource = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Resources';
  const target = `${resource} Mine${config?.level ? ` (Lv.${config.level})` : ''}`;
  const returning = march?.kind === 'return' || march?.stage === 'returnToOutpost';
  const explicitGathering = ['interactionWithTarget', 'gathering'].includes(march?.stage);
  const start = summary?.startedAt ?? march?.gatheringStartedAt ?? (explicitGathering ? march?.startedAt : null);
  const duration = summary?.plannedDurationMs ?? march?.gatheringDurationMs ?? (explicitGathering ? march?.durationMs : null);
  const end = finite(start) && finite(duration) && duration > 0 ? start + duration : march?.gatheringEndsAt ?? (explicitGathering ? march?.endsAt : null);
  const arrival = march?.targetArrivalAt ?? march?.endsAt;
  const traveling = !returning && !summary && !explicitGathering && String(march?.stage).startsWith('moveTo') && (!finite(arrival) || now < arrival);
  const stop = returning ? march?.gatheringStoppedAt : now;
  const known = finite(start) && finite(duration) && duration > 0 && (!returning || finite(stop));
  const ratio = traveling ? 0 : known ? clamp(((stop as number) - start) / duration) : null;
  const planned = summary?.plannedGatheredResourceAmount ?? march?.gatheringTotalAmount;
  const total = finite(planned) && planned >= 0 ? planned : null;
  const collected = total != null && ratio != null ? Math.floor(total * ratio) : traveling ? 0 : null;
  const eta = returning ? march?.endsAt ?? march?.returnAt : traveling ? arrival : end;
  const remainingSeconds = finite(eta) ? Math.max(0, Math.ceil((eta - now) / 1000)) : null;
  return { type, resource, target, phase: returning ? 'Returning' : traveling ? 'Traveling to mine' : 'Gathering',
    progress: ratio == null ? null : Math.round(ratio * 1000) / 10, ratio, collected, total,
    durationMs: known ? duration : null, remainingSeconds,
  };
}
