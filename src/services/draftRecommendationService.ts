/**
 * Legends Draft Phase 2 — Instant Role/Faction Synergy Scorer & Top-3 Recommendation Engine.
 *
 * Pure JS heuristic (< 2ms for all 3^5 = 243 combinations, zero WASM calls).
 * Used for both Defense Phase (Stage 2) and Attack Phase (Stage 4); on-demand WASM
 * simulation is triggered ONLY when the user explicitly clicks Simulate on a specific team.
 */

import type { DraftHeroCandidate, DraftHeroLiveStats } from '../types/game/draft.ts';
import { buildDraftHeroCandidate } from '../utils/draftHelper.ts';

export interface DraftTeamScoreBreakdown {
  totalScore: number;
  roleScore: number;
  factionScore: number;
  powerScore: number;
  factionSummary: string;
  roleSummary: string;
  archetypeLabel: string;
  dominantFaction: string | null;
}

export interface DraftTeamRecommendation {
  rank: 1 | 2 | 3;
  key: string;
  heroIds: number[];
  heroes: DraftHeroCandidate[];
  score: number;
  totalPower: number;
  archetypeLabel: string;
  factionSummary: string;
  roleSummary: string;
  dominantFaction: string | null;
}

export function shortFactionName(faction?: string): string {
  if (!faction) return '';
  return faction.replace(/^Way of\s+/i, '').trim();
}

export function getFactionBadgeClass(faction?: string): string {
  const f = shortFactionName(faction).toLowerCase();
  if (f === 'eternity') return 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30';
  if (f === 'progress') return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
  if (f === 'nature') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  if (f === 'chaos') return 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30';
  if (f === 'mystery') return 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30';
  if (f === 'honor') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
}

export function getClassBadgeClass(heroClass?: string): string {
  const c = String(heroClass || '').toLowerCase();
  if (c === 'tank') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
  if (c === 'healer') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  if (c === 'support') return 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30';
  if (c === 'control') return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30';
  if (c === 'mage') return 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30';
  if (c === 'warrior') return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30';
  if (c === 'marksman') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
}

const DPS_CLASSES = new Set(['warrior', 'marksman', 'mage']);

export function scoreDraftTeam(
  heroes: DraftHeroCandidate[],
  mode: 'defense' | 'attack' = 'defense',
  enemyHeroes: DraftHeroCandidate[] = []
): DraftTeamScoreBreakdown {
  let tanks = 0;
  let fronts = 0;
  let healers = 0;
  let supports = 0;
  let controls = 0;
  let dps = 0;
  let totalPower = 0;
  let totalStars = 0;

  const factionCounts = new Map<string, number>();

  for (const h of heroes) {
    const cls = String(h.class || '').toLowerCase();
    const pos = String(h.role || '').toLowerCase();
    if (cls === 'tank') tanks++;
    if (pos === 'front') fronts++;
    if (cls === 'healer') healers++;
    if (cls === 'support') supports++;
    if (cls === 'control') controls++;
    if (DPS_CLASSES.has(cls)) dps++;
    totalPower += Number(h.power) || 0;
    totalStars += Number(h.star) || 0;

    const fac = shortFactionName(h.faction);
    if (fac) {
      factionCounts.set(fac, (factionCounts.get(fac) || 0) + 1);
    }
  }

  // 1. Role & Position Balance Score
  let roleScore = 0;
  if (tanks >= 1) roleScore += mode === 'defense' ? 32 : 26;
  else if (fronts >= 1) roleScore += 14;
  else roleScore -= 30; // No frontline tank/front

  if (tanks > 2) roleScore -= (tanks - 2) * 18;
  if (tanks === 2 && mode === 'defense') roleScore += 4;

  if (healers >= 1) roleScore += mode === 'defense' ? 24 : 16;
  if (healers > 2) roleScore -= (healers - 2) * 15;

  if (supports >= 1) roleScore += 12;
  if (controls >= 1) roleScore += mode === 'attack' ? 14 : 10;

  if (dps >= 1 && dps <= 3) roleScore += mode === 'attack' ? 26 : 20;
  else if (dps === 0) roleScore -= 24;
  else if (dps > 3) roleScore -= 8;

  // 2. Faction Synergy Score
  const sortedFactions = [...factionCounts.entries()].sort((a, b) => b[1] - a[1]);
  let factionScore = 0;
  for (const [, cnt] of sortedFactions) {
    if (cnt === 2) factionScore += 8;
    else if (cnt === 3) factionScore += 24;
    else if (cnt === 4) factionScore += 38;
    else if (cnt >= 5) factionScore += 52;
  }
  // 3 + 2 dual-faction synergy bonus
  if (sortedFactions.length >= 2 && sortedFactions[0]![1] === 3 && sortedFactions[1]![1] === 2) {
    factionScore += 8;
  }

  // 3. Attack-phase enemy counter heuristic
  let counterScore = 0;
  if (mode === 'attack' && enemyHeroes.length > 0) {
    const enemyHealers = enemyHeroes.filter((e) => String(e.class || '').toLowerCase() === 'healer').length;
    const enemyTanks = enemyHeroes.filter((e) => String(e.class || '').toLowerCase() === 'tank').length;
    if (enemyHealers >= 1 && (controls >= 1 || dps >= 2)) counterScore += 6;
    if (enemyTanks >= 2 && dps >= 2) counterScore += 5;
  }

  // 4. Power & Star tie-breaker (normalized to ~0..15 pts so synergy/role stay primary)
  const powerScore = Math.min(12, totalPower / 100000) + Math.min(3, totalStars * 0.15);

  const totalScore = Math.round((roleScore + factionScore + counterScore + powerScore) * 10) / 10;

  const dominantFaction =
    sortedFactions.length > 0 && sortedFactions[0]![1] >= 2 ? sortedFactions[0]![0] : null;
  const factionSummary = sortedFactions
    .filter(([, cnt]) => cnt >= 2)
    .map(([fac, cnt]) => `${cnt}× ${fac}`)
    .join(', ') || 'Mixed Factions';

  const roleParts: string[] = [];
  if (tanks > 0) roleParts.push(`${tanks} Tank`);
  else if (fronts > 0) roleParts.push(`${fronts} Front`);
  if (healers > 0) roleParts.push(`${healers} Heal`);
  if (supports > 0) roleParts.push(`${supports} Sup`);
  if (dps > 0) roleParts.push(`${dps} DPS`);
  if (controls > 0) roleParts.push(`${controls} Ctrl`);
  const roleSummary = roleParts.join(' · ') || 'Balanced';

  let archetypeLabel = mode === 'attack' ? 'Balanced Counter' : 'Balanced Defense';
  if (dominantFaction && sortedFactions[0]![1] >= 3) {
    archetypeLabel = `${dominantFaction} Core (${sortedFactions[0]![1]}/5)`;
  } else if (tanks >= 1 && healers >= 1 && mode === 'defense') {
    archetypeLabel = 'Sustain Tank + Heal';
  } else if (dps >= 2 && controls >= 1 && mode === 'attack') {
    archetypeLabel = 'Burst + Control';
  } else if (dps >= 3) {
    archetypeLabel = 'High DPS Rush';
  }

  return {
    totalScore,
    roleScore,
    factionScore,
    powerScore,
    factionSummary,
    roleSummary,
    archetypeLabel,
    dominantFaction,
  };
}

/**
 * Generates up to 3 diverse, high-scoring 5-hero team recommendations from a 5-round x 3-card pool.
 * Runs synchronously in < 2ms with zero WASM calls.
 */
export function recommendTop3DraftTeams(
  heroSteps: number[][] | undefined,
  heroDetails?: Record<number, DraftHeroLiveStats> | null,
  mode: 'defense' | 'attack' = 'defense',
  enemyHeroes: DraftHeroCandidate[] = []
): DraftTeamRecommendation[] {
  if (!Array.isArray(heroSteps) || heroSteps.length === 0) return [];
  const validCols = heroSteps.filter((col) => Array.isArray(col) && col.length > 0);
  if (validCols.length === 0) return [];

  // Pre-build candidate objects once
  const emptySet = new Set<number>();
  const colCandidates: DraftHeroCandidate[][] = validCols.map((col) =>
    col.map((id) => buildDraftHeroCandidate(id, emptySet, heroDetails))
  );

  // Enumerate combinations (3^5 = 243 max; cap at 1024 for safety)
  const combos: DraftHeroCandidate[][] = [];
  const current: DraftHeroCandidate[] = [];
  const usedIds = new Set<number>();

  function dfs(colIdx: number) {
    if (combos.length >= 1024) return;
    if (colIdx === colCandidates.length) {
      combos.push([...current]);
      return;
    }
    for (const cand of colCandidates[colIdx]!) {
      if (usedIds.has(cand.id)) continue;
      usedIds.add(cand.id);
      current.push(cand);
      dfs(colIdx + 1);
      current.pop();
      usedIds.delete(cand.id);
    }
  }
  dfs(0);

  if (combos.length === 0) return [];

  const scored = combos
    .map((heroes) => {
      const breakdown = scoreDraftTeam(heroes, mode, enemyHeroes);
      const heroIds = heroes.map((h) => h.id);
      const totalPower = heroes.reduce((sum, h) => sum + (Number(h.power) || 0), 0);
      return {
        key: heroIds.join('-'),
        heroIds,
        heroes,
        score: breakdown.totalScore,
        totalPower,
        archetypeLabel: breakdown.archetypeLabel,
        factionSummary: breakdown.factionSummary,
        roleSummary: breakdown.roleSummary,
        dominantFaction: breakdown.dominantFaction,
      };
    })
    .sort((a, b) => b.score - a.score || b.totalPower - a.totalPower);

  // Select Top 3 diverse teams (prefer >= 2 differing heroes from already chosen teams)
  const picked: typeof scored = [];
  const diffCount = (a: number[], b: number[]) => {
    const setB = new Set(b);
    return a.filter((id) => !setB.has(id)).length;
  };

  for (const minDiff of [2, 1]) {
    for (const cand of scored) {
      if (picked.length >= 3) break;
      if (picked.some((p) => p.key === cand.key)) continue;
      if (picked.every((p) => diffCount(p.heroIds, cand.heroIds) >= minDiff)) {
        picked.push(cand);
      }
    }
    if (picked.length >= 3) break;
  }

  return picked.slice(0, 3).map((item, idx) => ({
    rank: (idx + 1) as 1 | 2 | 3,
    ...item,
  }));
}
