/**
 * Hydra Guild Boss Service (`hydraService.ts`).
 * Parses live `clanBoss_getAll`, `clanBoss_getDayHistory`, and `teamGetAll.clan_boss`,
 * enforces Guildmate Lock Guard, Overkill Guard, and Super Horn Safety,
 * and provides 3-team sequential damage simulation via Unity WASM.
 */

export const HYDRA_CONFIG_STORAGE_KEY = 'hydraOptimizerConfig';

export interface HydraTierDef {
  tierId: number;
  name: string;
  shortName: string;
}

export const HYDRA_TIERS: readonly HydraTierDef[] = [
  { tierId: 1, name: 'Common Hydra', shortName: 'Common' },
  { tierId: 2, name: 'Elder Hydra', shortName: 'Elder' },
  { tierId: 3, name: 'Ancient Hydra', shortName: 'Ancient' },
  { tierId: 4, name: 'Dreadful Hydra', shortName: 'Dreadful' },
  { tierId: 5, name: 'Legendary Hydra', shortName: 'Legendary' },
] as const;

export interface HydraElementDef {
  heroId: number;
  element: 'Darkness' | 'Water' | 'Earth' | 'Fire' | 'Wind' | 'Light';
  icon: string;
  badgeCls: string;
}

export const HYDRA_ELEMENT_BY_HERO_ID: Record<number, HydraElementDef> = {
  8010: { heroId: 8010, element: 'Darkness', icon: '🌑', badgeCls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  8011: { heroId: 8011, element: 'Water', icon: '💧', badgeCls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  8012: { heroId: 8012, element: 'Earth', icon: '🪨', badgeCls: 'bg-amber-600/15 text-amber-500 border-amber-500/30' },
  8013: { heroId: 8013, element: 'Fire', icon: '🔥', badgeCls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  8014: { heroId: 8014, element: 'Wind', icon: '🌪️', badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  8015: { heroId: 8015, element: 'Light', icon: '✨', badgeCls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
};

export interface HydraHeadState {
  bossHeadId: number;
  tierId: number;
  tierName: string;
  heroId: number;
  element: string;
  icon: string;
  badgeCls: string;
  hp: number;
  maxHp: number;
  hpPct: number;
  energy: number;
  isDead: boolean;
  isAlive: boolean;
  attackerId: string | number | null;
  isLockedByGuildmate: boolean;
  bestDamage: number;
  canRaid: boolean;
}

export interface HydraTierSummary {
  tierId: number;
  name: string;
  shortName: string;
  heads: HydraHeadState[];
  defeatedCount: number;
  totalCount: number;
}

export interface HydraParsedState {
  regularTries: number;
  superTries: number;
  endDay: number | null;
  heads: HydraHeadState[];
  tiers: HydraTierSummary[];
  savedTeams: number[][];
}

export type HydraPlanStrategy = 'highest-effective' | 'finish-low-hp' | 'target-tier';

export interface HydraPlannerConfig {
  strategy?: HydraPlanStrategy;
  preferredTierId?: number | null;
  overkillGuardPct?: number; // default: 0.25 (25% wasted damage triggers warning)
  preferRaid?: boolean;      // default: true
  allowSuperTries?: boolean; // default: false (never spend Golden Horns without explicit opt-in)
}

export interface HydraTargetRecommendation {
  head: HydraHeadState;
  predictedDamage: number;
  effectiveDamage: number;
  overkillDamage: number;
  wasteRatio: number;
  overkillWarning: boolean;
  recommendedMode: 'raid' | 'battle';
  reason: string;
}

export interface HydraHornPlanResult {
  availableHorns: number;
  regularHornsUsed: number;
  superHornsUsed: number;
  skippedLockedCount: number;
  overkillWarnings: number;
  recommendations: HydraTargetRecommendation[];
}

export function resolveHydraElement(heroId: number): HydraElementDef {
  return (
    HYDRA_ELEMENT_BY_HERO_ID[heroId] || {
      heroId,
      element: 'Darkness',
      icon: '🐉',
      badgeCls: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    }
  );
}

/**
 * Parses `clanBoss_getAll` + `teamGetAll` into structured 5-tier Hydra state.
 */
export function parseHydraState(rawGetAll: any, rawTeamGetAll?: any): HydraParsedState {
  const data = rawGetAll && typeof rawGetAll === 'object' ? rawGetAll : {};
  const regularTries = Math.max(0, Math.floor(Number(data.tries) || 0));
  const superTries = Math.max(0, Math.floor(Number(data.superTries) || 0));
  const endDay = Number.isFinite(Number(data.endDay)) && Number(data.endDay) > 0 ? Number(data.endDay) : null;

  const bestByHead = new Map<number, { damage: number; enableRaid: boolean }>();
  if (Array.isArray(data.headsBestResults)) {
    for (const row of data.headsBestResults) {
      const id = Number(row?.bossHeadId);
      if (Number.isInteger(id) && id > 0) {
        bestByHead.set(id, {
          damage: Math.max(0, Number(row?.damage) || 0),
          enableRaid: row?.enableRaid === true,
        });
      }
    }
  }

  const heads: HydraHeadState[] = [];
  if (Array.isArray(data.heads)) {
    for (const raw of data.heads) {
      const bossHeadId = Number(raw?.bossHeadId);
      if (!Number.isInteger(bossHeadId) || bossHeadId <= 0) continue;
      const tierId = Math.max(1, Math.min(5, Math.ceil(bossHeadId / 6)));
      const tierDef = HYDRA_TIERS[tierId - 1] || HYDRA_TIERS[0];
      const heroId = Number(raw?.heroId) || 0;
      const elem = resolveHydraElement(heroId);
      const maxHp = Math.max(1, Number(raw?.state?.maxHp) || 1);
      const isDead = raw?.state?.isDead === true || Number(raw?.state?.hp) <= 0;
      const hp = isDead ? 0 : Math.max(0, Number(raw?.state?.hp) || 0);
      const hpPct = isDead ? 0 : Math.min(100, Math.round((hp / maxHp) * 1000) / 10);
      const best = bestByHead.get(bossHeadId);
      const attackerId = raw?.attackerId ?? null;

      heads.push({
        bossHeadId,
        tierId,
        tierName: tierDef.name,
        heroId,
        element: elem.element,
        icon: elem.icon,
        badgeCls: elem.badgeCls,
        hp,
        maxHp,
        hpPct,
        energy: Math.max(0, Number(raw?.state?.energy) || 0),
        isDead,
        isAlive: !isDead,
        attackerId,
        isLockedByGuildmate: attackerId != null && String(attackerId).trim() !== '',
        bestDamage: best?.damage ?? 0,
        canRaid: best?.enableRaid === true,
      });
    }
  }
  heads.sort((a, b) => a.bossHeadId - b.bossHeadId);

  const tiers: HydraTierSummary[] = HYDRA_TIERS.map((t) => {
    const tierHeads = heads.filter((h) => h.tierId === t.tierId);
    return {
      tierId: t.tierId,
      name: t.name,
      shortName: t.shortName,
      heads: tierHeads,
      defeatedCount: tierHeads.filter((h) => h.isDead).length,
      totalCount: tierHeads.length,
    };
  });

  const savedTeams: number[][] = [];
  const rawClanBossTeams = rawTeamGetAll?.clan_boss;
  if (Array.isArray(rawClanBossTeams)) {
    for (const team of rawClanBossTeams.slice(0, 3)) {
      if (Array.isArray(team)) {
        savedTeams.push(team.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 5));
      }
    }
  }
  while (savedTeams.length < 3) savedTeams.push([]);

  return {
    regularTries,
    superTries,
    endDay,
    heads,
    tiers,
    savedTeams,
  };
}

/**
 * Plans optimal Hydra horn targets with Guildmate Lock Guard, Overkill Guard,
 * Raid preference, and strict Super Horn opt-in safety.
 */
export function planHydraHornTargets(params: {
  state: HydraParsedState;
  predictedDamageByHead?: Record<number, number>;
  fallbackPredictedDamage?: number;
  config?: HydraPlannerConfig;
}): HydraHornPlanResult {
  const { state } = params;
  const cfg = params.config || {};
  const strategy: HydraPlanStrategy = cfg.strategy || 'highest-effective';
  const overkillGuardPct = Math.max(0, Math.min(0.95, Number(cfg.overkillGuardPct ?? 0.25)));
  const preferRaid = cfg.preferRaid !== false;
  const allowSuperTries = cfg.allowSuperTries === true;
  const preferredTierId = cfg.preferredTierId != null ? Number(cfg.preferredTierId) : null;

  const regularHornsUsed = state.regularTries;
  const superHornsUsed = allowSuperTries ? state.superTries : 0;
  const availableHorns = regularHornsUsed + superHornsUsed;

  const aliveHeads = state.heads.filter((h) => h.isAlive);
  const skippedLockedCount = aliveHeads.filter((h) => h.isLockedByGuildmate).length;
  const eligible = aliveHeads.filter((h) => !h.isLockedByGuildmate);

  const scored: HydraTargetRecommendation[] = eligible.map((head) => {
    const simDmg = params.predictedDamageByHead?.[head.bossHeadId];
    const predictedDamage = Math.max(
      0,
      Math.round(
        Number.isFinite(simDmg) && (simDmg as number) > 0
          ? (simDmg as number)
          : head.bestDamage > 0
            ? head.bestDamage
            : Number(params.fallbackPredictedDamage) || Math.round(head.maxHp * 0.35)
      )
    );
    const effectiveDamage = Math.min(predictedDamage, head.hp);
    const overkillDamage = Math.max(0, predictedDamage - head.hp);
    const wasteRatio = predictedDamage > 0 ? overkillDamage / predictedDamage : 0;
    const overkillWarning = wasteRatio > overkillGuardPct;
    const recommendedMode: 'raid' | 'battle' =
      preferRaid && head.canRaid && head.bestDamage > 0 && head.bestDamage >= Math.min(head.hp, predictedDamage * 0.9)
        ? 'raid'
        : 'battle';

    const reasonParts: string[] = [];
    if (recommendedMode === 'raid') reasonParts.push('Instant Raid unlocked');
    if (overkillWarning) {
      reasonParts.push(`Overkill warning (${Math.round(wasteRatio * 100)}% wasted)`);
    } else if (predictedDamage >= head.hp) {
      reasonParts.push('Clean kill (within overkill guard)');
    } else {
      reasonParts.push('High effective damage');
    }

    return {
      head,
      predictedDamage,
      effectiveDamage,
      overkillDamage,
      wasteRatio: Math.round(wasteRatio * 1000) / 1000,
      overkillWarning,
      recommendedMode,
      reason: reasonParts.join(' · '),
    };
  });

  scored.sort((a, b) => {
    if (strategy === 'target-tier' && preferredTierId != null) {
      const aMatch = a.head.tierId === preferredTierId ? 1 : 0;
      const bMatch = b.head.tierId === preferredTierId ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
    }
    if (strategy === 'finish-low-hp') {
      if (a.overkillWarning !== b.overkillWarning) return a.overkillWarning ? 1 : -1;
      if (a.head.hp !== b.head.hp) return a.head.hp - b.head.hp;
      return b.effectiveDamage - a.effectiveDamage;
    }
    // Default: highest-effective (prefer non-overkill heads when effective damage is close)
    if (a.effectiveDamage !== b.effectiveDamage) return b.effectiveDamage - a.effectiveDamage;
    if (a.overkillWarning !== b.overkillWarning) return a.overkillWarning ? 1 : -1;
    return a.overkillDamage - b.overkillDamage;
  });

  return {
    availableHorns,
    regularHornsUsed,
    superHornsUsed,
    skippedLockedCount,
    overkillWarnings: scored.filter((s) => s.overkillWarning).length,
    recommendations: scored,
  };
}

/**
 * Sequentially simulates up to 3 Hydra teams against a single head, carrying remaining HP
 * across teams and stopping early if the head is defeated.
 */
export async function simulateHydraHeadDamage(params: {
  head: HydraHeadState;
  teams: number[][];
  simulateTeamFn: (teamHeroIds: number[], remainingHp: number, teamIndex: number) => Promise<number>;
}): Promise<{
  bossHeadId: number;
  totalDamage: number;
  perTeamDamage: number[];
  killsHead: boolean;
  overkillDamage: number;
  remainingHp: number;
}> {
  let remainingHp = Math.max(0, params.head.hp);
  let totalRawDamage = 0;
  const perTeamDamage: number[] = [];

  for (let i = 0; i < Math.min(3, params.teams.length); i++) {
    const team = params.teams[i];
    if (!Array.isArray(team) || team.length === 0 || remainingHp <= 0) {
      perTeamDamage.push(0);
      continue;
    }
    const dmg = Math.max(0, Math.round(Number(await params.simulateTeamFn(team, remainingHp, i)) || 0));
    perTeamDamage.push(dmg);
    totalRawDamage += dmg;
    remainingHp = Math.max(0, remainingHp - dmg);
  }

  return {
    bossHeadId: params.head.bossHeadId,
    totalDamage: totalRawDamage,
    perTeamDamage,
    killsHead: remainingHp <= 0,
    overkillDamage: Math.max(0, totalRawDamage - params.head.hp),
    remainingHp,
  };
}

export function formatHydraDamage(val: number): string {
  const n = Math.max(0, Number(val) || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}
