/**
 * Helper for resolving claimable Event Quests and Battle Pass tiers.
 */

import { defaultBattlepassLevels, type BattlePassLevelDef } from '../data/battlepassCatalog.ts';
import { knownQuestTargets } from './tierHelper.ts';

export interface ClaimableQuestItem {
  questId: number;
  eventId: number;
  groupId: number;
  title: string;
}

export interface ClaimableBattlePassItem {
  battlepassId: number;
  levelIdAndTrackIdToClaim: [number, number][];
  count: number;
}

/**
 * Resolve all claimable special event quests.
 */
export function resolveClaimableEventQuests(cache: any): ClaimableQuestItem[] {
  const events =
    cache?.specialQuestStatus?.data?.events ||
    cache?.['getSpecialQuestState:quest']?.data?.events ||
    cache?.questEvents?.data?.events ||
    [];

  const list = Array.isArray(events) ? events : [];
  const claimable: ClaimableQuestItem[] = [];
  const seenQuestIds = new Set<number>();

  for (const event of list) {
    if (!event || !Array.isArray(event.groups)) continue;
    for (const group of event.groups) {
      if (!group || !Array.isArray(group.quests)) continue;
      for (let i = 0; i < group.quests.length; i++) {
        const quest = group.quests[i];
        if (!quest || quest.id == null || seenQuestIds.has(Number(quest.id))) continue;

        // Check if already completed
        const isCompleted =
          quest.state === 'completed' ||
          quest.state === 3 ||
          (Number(quest.completionCount) || 0) > 0;

        if (isCompleted) continue;

        // Check if ready to claim:
        // Must be explicitly marked ready by server, or have an exact verified target.
        // We never use synthetic ladders or default steps here to avoid false claims and ValidationError.
        const isReady = quest.state === 'ready' || quest.state === 2;
        const verifiedTarget =
          quest.target != null ? Number(quest.target) :
          quest.condition?.target != null ? Number(quest.condition.target) :
          knownQuestTargets[Number(quest.id)] != null ? Number(knownQuestTargets[Number(quest.id)]) :
          null;

        const progress = Number(quest.progress) || 0;

        if (isReady || (verifiedTarget != null && verifiedTarget > 0 && progress >= verifiedTarget)) {
          seenQuestIds.add(Number(quest.id));
          claimable.push({
            questId: Number(quest.id),
            eventId: Number(event.id),
            groupId: Number(group.id),
            title: group.localeKey || `Event Quest #${quest.id}`
          });
        }

        // Linear quest chain constraint:
        // In any quest chain, once the first uncompleted tier is reached,
        // all subsequent tiers are locked until this active tier is completed.
        break;
      }
    }
  }

  return claimable;
}

/**
 * Resolve all claimable battle pass rewards (levelId & trackId pairs).
 */
export function resolveClaimableBattlePassRewards(
  cache: any,
  dynamicCatalog?: any
): ClaimableBattlePassItem[] {
  const rawPasses =
    cache?.battlepassLiveStatus?.data?.battlepasses ||
    cache?.['getBattlepassState:battlepass']?.data?.battlepasses ||
    [];

  const passes = Array.isArray(rawPasses) ? rawPasses : [];
  const results: ClaimableBattlePassItem[] = [];

  for (const pass of passes) {
    const bpId = Number(pass?.battlepassId);
    if (!bpId) continue;

    const points = Number(pass.points) || 0;
    const activatedTrackIds = Array.isArray(pass.activatedTrackIds)
      ? pass.activatedTrackIds.map(Number)
      : [];

    if (activatedTrackIds.length === 0) continue;

    const claimedSet = new Set<string>();
    if (Array.isArray(pass.claimedRewards)) {
      for (const r of pass.claimedRewards) {
        if (r && r.levelId != null && r.trackId != null) {
          claimedSet.add(`${r.levelId}:${r.trackId}`);
        }
      }
    }

    // Lookup level definitions from dynamic catalog or fallback
    const catalogLevels: BattlePassLevelDef[] =
      dynamicCatalog?.battlepass?.levels?.filter(
        (l: any) => Number(l.battlepassId) === bpId
      ) ||
      defaultBattlepassLevels[bpId] ||
      [];

    const pairsToClaim: [number, number][] = [];

    for (const level of catalogLevels) {
      if (Number(level.points) <= points) {
        for (const trackId of activatedTrackIds) {
          const key = `${level.id}:${trackId}`;
          if (!claimedSet.has(key)) {
            pairsToClaim.push([level.id, trackId]);
          }
        }
      }
    }

    if (pairsToClaim.length > 0) {
      results.push({
        battlepassId: bpId,
        levelIdAndTrackIdToClaim: pairsToClaim,
        count: pairsToClaim.length
      });
    }
  }

  return results;
}

/**
 * Count total claimable items across Event Quests and Battle Passes.
 */
export function countClaimableEvents(cache: any, dynamicCatalog?: any): number {
  const questCount = resolveClaimableEventQuests(cache).length;
  const bpCount = resolveClaimableBattlePassRewards(cache, dynamicCatalog).reduce(
    (sum, item) => sum + item.count,
    0
  );
  return questCount + bpCount;
}

/**
 * Count total claimable Event Quests.
 */
export function countClaimableEventQuests(cache: any): number {
  return resolveClaimableEventQuests(cache).length;
}

/**
 * Count total claimable Battle Pass reward tiers.
 */
export function countClaimableBattlePass(cache: any, dynamicCatalog?: any): number {
  return resolveClaimableBattlePassRewards(cache, dynamicCatalog).reduce(
    (sum, item) => sum + item.count,
    0
  );
}
