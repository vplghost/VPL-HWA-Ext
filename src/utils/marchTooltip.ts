import { formatNumber } from './formatters.ts';
import { normalizeArray } from './troops.ts';
import {
  bossLevel,
  soloMonsterLevel,
  getMineTypeLevel,
} from './experimentalData.ts';

/**
 * Format remaining time duration for march stages
 */
export function formatMarchDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'Due now';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Resolve readable name for a hero ID
 */
export function resolveHeroName(id: number | string): string {
  const metaMap = (globalThis as any).hwaHelperHeroMetadata;
  if (metaMap?.[String(id)]?.name) return metaMap[String(id)].name;
  const nameMap = (globalThis as any).hwaHelperNameMap;
  if (typeof nameMap?.hero === 'function') {
    const mapped = nameMap.hero(Number(id));
    if (mapped) return mapped;
  }
  if (nameMap?.heroNames?.[String(id)]) {
    return nameMap.heroNames[String(id)];
  }
  return `Hero #${id}`;
}

export interface MarchSquadDetails {
  heroNames: string[];
  totalTroops: number;
  troopsText: string;
}

/**
 * Extract hero names and troop counts from march object or RPC cache squads
 */
export function extractMarchSquadDetails(march: any, cache: any = {}): MarchSquadDetails {
  let heroIds: number[] = [];
  let unitCounts: Array<{ id: number; count: number }> = [];

  const teamHeroIds = normalizeArray(march?.team?.heroIds);
  const rallyHeroIds = normalizeArray(march?.rally?.team?.heroIds);

  if (teamHeroIds.length > 0) {
    heroIds = teamHeroIds;
    const units = normalizeArray(march?.team?.units);
    if (units.length > 0) {
      unitCounts = units.map((u: any) => ({
        id: u?.id ?? u?.unitId,
        count: u?.count ?? u?.state?.survived ?? 0,
      }));
    }
  } else if (rallyHeroIds.length > 0) {
    heroIds = rallyHeroIds;
    const units = normalizeArray(march?.rally?.team?.units);
    if (units.length > 0) {
      unitCounts = units.map((u: any) => ({
        id: u?.id ?? u?.unitId,
        count: u?.count ?? u?.state?.survived ?? 0,
      }));
    }
  } else if (march?.squadId && cache) {
    const rawSquads =
      cache['getUnitSummary:unit']?.data?.squads ||
      cache.inventoryGet?.data?.unit?.squads ||
      cache['user_getUnitSummary']?.data?.squads;
    const squads = normalizeArray(rawSquads);
    const matchedSquad = squads.find((s: any) => s?.id === march.squadId);
    if (matchedSquad) {
      const heroes = normalizeArray(matchedSquad.heroes);
      if (heroes.length > 0) {
        heroIds = heroes.map((h: any) => Number(h?.id ?? h?.heroId)).filter(Boolean);
      }
      const units = normalizeArray(matchedSquad.units);
      if (units.length > 0) {
        unitCounts = units.map((u: any) => ({
          id: u?.id ?? u?.unitId,
          count: u?.state?.survived ?? u?.count ?? 0,
        }));
      }
    }
  }

  const heroNames = heroIds.map(resolveHeroName);
  const totalTroops = unitCounts.reduce((sum, u) => sum + (Number(u.count) || 0), 0);
  const troopsText = totalTroops > 0 ? `${formatNumber(totalTroops)} troops` : '';

  return { heroNames, totalTroops, troopsText };
}

/**
 * Generate comprehensive multi-line tooltip for header march badge
 */
export function formatMarchTooltip(march: any, now = Date.now(), cache: any = {}): string {
  if (!march) return 'Active march';

  const isRaid = Boolean(march?.rally) || march?.kind === 'raid' || march?.previousKind === 'raid';
  const isMine =
    Boolean(march?.mineId) ||
    ['food', 'wood', 'stone', 'iron', 'mine'].includes(march?.kind) ||
    ['food', 'wood', 'stone', 'iron', 'mine'].includes(march?.previousKind);
  const isMonster =
    !isRaid &&
    !isMine &&
    (march?.kind === 'attack' || march?.previousKind === 'attack' || Boolean(march?.mobConfigId));
  const isReturning = march?.kind === 'return' || march?.stage === 'returnToOutpost';
  const isAutoJoin = Boolean(march?.rally?.isAutoJoin);

  const { heroNames, troopsText } = extractMarchSquadDetails(march, cache);
  const lines: string[] = [];

  // ==================== RAID ====================
  if (isRaid) {
    const rally = march.rally || {};
    const configId = rally.mobConfigId ?? march.mobConfigId;
    const lvl = configId ? bossLevel(configId) : null;
    const targetLabel = lvl ? `Level ${lvl} Boss` : (rally.target || (configId ? `Boss #${configId}` : 'Guild Boss'));
    const title = `${isAutoJoin ? '⚡ Auto-Join Raid' : '⚔️ Rally Raid'} · ${targetLabel}`;
    lines.push(title);

    if (rally.leaderName) {
      lines.push(`Leader: ${rally.leaderName}`);
    }

    if (isReturning || march.stage === 'returnToOutpost') {
      const returnTime = march.endsAt ? formatMarchDuration(march.endsAt - now) : (rally.returnAt ? formatMarchDuration(rally.returnAt - now) : 'In progress');
      const res = march.result || rally.result;
      const resLabel = res === 'win' ? 'Victory' : res ? `Result: ${res}` : 'Battle complete';
      lines.push(`Status: Returning to base (${resLabel}) · ${returnTime} remaining`);
    } else if (march.stage === 'battle' || march.stage === 'battleInRally') {
      lines.push('Status: Battle in progress · Awaiting outcome');
    } else if (march.stage === 'moveToTargetInRally' || march.stage === 'moveToTarget') {
      const arr = march.endsAt || rally.arrivalAt;
      const arrTime = arr ? formatMarchDuration(arr - now) : 'In progress';
      lines.push(`Status: Traveling to boss · ${arrTime} to arrival`);
    } else if (march.stage === 'waitingForRallyStart' || (rally.waitUntil && now < rally.waitUntil)) {
      const waitTime = rally.waitUntil ? formatMarchDuration(rally.waitUntil - now) : (march.endsAt ? formatMarchDuration(march.endsAt - now) : 'Waiting');
      lines.push(`Status: Preparing rally · Wait: ${waitTime} remaining`);
    } else if (march.stage === 'moveToRallyLeader') {
      const eta = rally.memberEta || march.endsAt;
      const etaTime = eta ? formatMarchDuration(eta - now) : 'In progress';
      lines.push(`Status: Joining rally leader · ${etaTime} remaining`);
    } else {
      const rem = march.endsAt ? formatMarchDuration(march.endsAt - now) : 'Active';
      lines.push(`Status: Active rally march · ${rem}`);
    }

    if (heroNames.length > 0) {
      lines.push(`Heroes (${heroNames.length}/5): ${heroNames.join(', ')}`);
    }
    if (troopsText) {
      lines.push(`Troops: ${troopsText}`);
    }
    lines.push('(Click to view Raid dialog)');
    return lines.join('\n');
  }

  // ==================== GATHERING ====================
  if (isMine) {
    let mineType = march.kind !== 'return' && march.kind !== 'mine' ? march.kind : null;
    let mineLevel: number | null = null;
    if (march.mineConfigId) {
      const info = getMineTypeLevel(march.mineConfigId);
      if (info) {
        mineType = info.type;
        mineLevel = info.level;
      }
    }
    if (!mineType && cache?.mineMap?.[march.mineId]) {
      const mInfo = cache.mineMap[march.mineId];
      if (mInfo?.mineType) mineType = mInfo.mineType;
      if (mInfo?.mineConfigId) {
        const info = getMineTypeLevel(mInfo.mineConfigId);
        if (info) {
          mineType = info.type;
          mineLevel = info.level;
        }
      }
    }

    const typeCap = mineType ? mineType.charAt(0).toUpperCase() + mineType.slice(1) : 'Resource';
    const lvlText = mineLevel ? ` (Lv.${mineLevel})` : '';
    lines.push(`⛏️ Gathering · ${typeCap} Mine${lvlText}`);

    const isTraveling = march.stage === 'moveToTargetInSolo' && Number.isFinite(march.targetArrivalAt) && now < march.targetArrivalAt;
    if (isReturning) {
      const retTime = march.endsAt || march.returnAt ? formatMarchDuration((march.endsAt || march.returnAt) - now) : 'In progress';
      lines.push(`Status: Returning to outpost · ${retTime} remaining`);
    } else if (isTraveling) {
      const arrTime = formatMarchDuration(march.targetArrivalAt - now);
      lines.push(`Status: Traveling to mine · ${arrTime} to arrival`);
    } else {
      const remTime = march.endsAt && march.endsAt > now ? formatMarchDuration(march.endsAt - now) : 'In progress';
      lines.push(`Status: Gathering resources · ${remTime}`);
    }

    if (heroNames.length > 0) {
      lines.push(`Heroes (${heroNames.length}/5): ${heroNames.join(', ')}`);
    }
    if (troopsText) {
      lines.push(`Troops: ${troopsText}`);
    }
    lines.push('(Click to view Gathering dialog)');
    return lines.join('\n');
  }

  // ==================== MONSTER ====================
  if (isMonster) {
    const lvl = march.mobConfigId ? soloMonsterLevel(march.mobConfigId) : null;
    const targetLabel = lvl ? `Level ${lvl} Monster` : (march.mobConfigId ? `Monster #${march.mobConfigId}` : 'World Monster');
    lines.push(`👾 Monster Attack · ${targetLabel}`);

    const isFighting = !isReturning && Number.isFinite(march.targetArrivalAt) && now >= march.targetArrivalAt;
    const isTraveling = !isReturning && !isFighting && Number.isFinite(march.targetArrivalAt) && now < march.targetArrivalAt;

    if (isReturning) {
      const retTime = march.endsAt || march.returnAt ? formatMarchDuration((march.endsAt || march.returnAt) - now) : 'In progress';
      const res = march.result === 'win' ? 'Victory' : march.result ? `Result: ${march.result}` : 'Battle complete';
      lines.push(`Status: Returning to base (${res}) · ${retTime} remaining`);
    } else if (isFighting) {
      lines.push('Status: Fighting in battle · Awaiting outcome');
    } else if (isTraveling) {
      const arrTime = formatMarchDuration(march.targetArrivalAt - now);
      lines.push(`Status: Marching to monster · ${arrTime} to arrival`);
    } else {
      const remTime = march.endsAt && march.endsAt > now ? formatMarchDuration(march.endsAt - now) : 'In progress';
      lines.push(`Status: Attack march · ${remTime}`);
    }

    if (heroNames.length > 0) {
      lines.push(`Heroes (${heroNames.length}/5): ${heroNames.join(', ')}`);
    }
    if (troopsText) {
      lines.push(`Troops: ${troopsText}`);
    }
    lines.push('(Click to view Monster dialog)');
    return lines.join('\n');
  }

  // Fallback for scout or unspecified march
  const defRem = march.endsAt ? formatMarchDuration(march.endsAt - now) : 'In progress';
  lines.push(`March · ${march.kind || 'Outpost'}`);
  lines.push(`Status: ${march.stage || 'Active'} · ${defRem}`);
  if (heroNames.length > 0) lines.push(`Heroes: ${heroNames.join(', ')}`);
  return lines.join('\n');
}

/**
 * Tooltip for Raid queue status badge
 */
export function formatRaidQueueTooltip(queue: any): string {
  if (!queue) return 'Raid Queue';
  const lvl = queue.options?.level || 1;
  const count = queue.bossQueue?.remain_raid_count ?? queue.options?.count ?? 0;
  const phase = queue.phase || 'Active';
  const heroNames = normalizeArray(queue.options?.heroIds).map(resolveHeroName);
  const lines = [
    `⚔️ Raid Queue Active (Level ${lvl} Boss)`,
    `Status: ${phase} · Rounds left: ${count}`,
  ];
  if (heroNames.length > 0) {
    lines.push(`Lineup (${heroNames.length}/5): ${heroNames.join(', ')}`);
  }
  lines.push('(Click to view Raid dialog)');
  return lines.join('\n');
}

/**
 * Tooltip for Monster queue status badge
 */
export function formatMonsterQueueTooltip(queue: any): string {
  if (!queue) return 'Monster Queue';
  const lvl = queue.options?.level || 1;
  const phase = queue.phase || 'Active';
  const heroNames = normalizeArray(queue.options?.heroIds).map(resolveHeroName);
  const lines = [
    `👾 Monster Queue Active (Level ${lvl} Monster)`,
    `Status: ${phase} · Target level: ${lvl}`,
  ];
  if (heroNames.length > 0) {
    lines.push(`Lineup (${heroNames.length}/5): ${heroNames.join(', ')}`);
  }
  lines.push('(Click to view Monster dialog)');
  return lines.join('\n');
}

/**
 * Tooltip for Auto-Gathering status badge
 */
export function formatAutoGatherTooltip(settings: any): string {
  if (!settings) return 'Auto-Gathering';
  const type = settings.mineType ? String(settings.mineType).toUpperCase() : 'ROTATE';
  const lvl = settings.mineLevel || 10;
  const max = settings.maxMarches || 3;
  return [
    `⛏️ Auto-Gathering Active`,
    `Target: ${type} (Lv.${lvl}) · Max Marches: ${max}`,
    `(Click to view Gathering dialog)`,
  ].join('\n');
}
