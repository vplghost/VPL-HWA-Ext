import type {
  FrontierDefender,
  FrontierChestData,
  FrontierMission,
} from '../types/game/frontier.ts';
import { simulateBattleWithUnity } from '../utils/dungeonBattleSim.ts';

/**
 * Calculates total power of a defender team in a Frontier stage.
 */
export function calculateStageEnemyPower(defenders: FrontierDefender[] = []): number {
  if (!Array.isArray(defenders)) return 0;
  return defenders.reduce((sum, d) => sum + (Number(d?.power) || 0), 0);
}

/**
 * Parses and formats AFK Chest information.
 */
export function getFrontierChestInfo(chestData?: FrontierChestData | null) {
  const percent = Number(chestData?.filled_in_percents) || 0;
  const coins = Number(chestData?.reward?.coin?.['23']) || 0;
  const collectedAt = Number(chestData?.collected_at) || 0;
  const hasReward = percent > 0 || coins > 0;
  return {
    percent,
    coins,
    collectedAt,
    hasReward,
    claimable: hasReward,
  };
}

/**
 * Builds battle payload for Frontier simulation if needed.
 */
export function buildFrontierBattlePayload(
  playerHeroes: any[] = [],
  defenders: FrontierDefender[] = [],
  stage = 1,
  seed = Math.floor(Math.random() * 1000000000)
) {
  const attackers = playerHeroes.map((h) => ({
    unit: {
      id: Number(h.id),
      level: Number(h.level) || 1,
      color: Number(h.color) || 1,
      star: Number(h.star) || 1,
      power: Number(h.power) || 0,
      skills: h.skills || {},
      artifacts: h.artifacts || [],
      talisman: h.talisman,
      skins: h.skins,
      currentSkin: h.currentSkin,
    },
    state: { hp: 1, energy: 0, isDead: false },
  }));

  const defenderUnits = defenders.map((d) => ({
    unit: {
      id: Number(d.id),
      level: Number(d.level) || 1,
      color: Number(d.color) || 1,
      star: Number(d.star) || 1,
      power: Number(d.power) || 0,
      skinData: d.skinData,
      talisman: d.talisman,
    },
    state: { hp: 1, energy: 0, isDead: false },
  }));

  return {
    type: 'hero',
    stage,
    seed,
    attackers,
    defenders: defenderUnits,
  };
}

/**
 * Simulates a Frontier battle outcome using Unity WebAssembly battle engine.
 */
export async function simulateFrontierBattle(battlePayload: any, seed = Math.floor(Math.random() * 1000000000)) {
  return await simulateBattleWithUnity(battlePayload, seed);
}

/**
 * Dispatches eternalStory_autoFight with specified hero team to server.
 */
export async function executeFrontierAutoFight(
  dispatchRpc: (calls: any[]) => Promise<any>,
  heroIds: number[]
) {
  if (!Array.isArray(heroIds) || heroIds.length === 0) {
    throw new Error('Hero team cannot be empty for Frontier fight.');
  }
  return await dispatchRpc([
    {
      name: 'eternalStory_autoFight',
      args: { hero_packs: [heroIds] },
    },
  ]);
}

/**
 * Saves team preset for Frontier on server.
 */
export async function saveFrontierTeam(
  dispatchRpc: (calls: any[]) => Promise<any>,
  heroIds: number[]
) {
  return await dispatchRpc([
    {
      name: 'battle_teamSet',
      args: {
        key: 'eternalStory',
        units: [heroIds],
      },
    },
  ]);
}

/**
 * Collects accumulated Frontier AFK chest coins.
 */
export async function collectFrontierChest(
  dispatchRpc: (calls: any[]) => Promise<any>
) {
  return await dispatchRpc([
    {
      name: 'eternalStory_collectChest',
      args: {},
    },
  ]);
}

/**
 * Refreshes current Frontier mission state and chest.
 */
export async function refreshFrontierState(
  dispatchRpc: (calls: any[]) => Promise<any>,
  heroIds: number[] = []
) {
  return await dispatchRpc([
    {
      name: 'eternalStory_getState',
      args: { hero_packs: heroIds.length ? [heroIds] : [] },
    },
    {
      name: 'eternalStory_getChest',
      args: {},
    },
  ]);
}
