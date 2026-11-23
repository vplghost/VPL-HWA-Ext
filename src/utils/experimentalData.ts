/**
 * Compatibility Barrel Export for Hero Wars: Alliance Data Helpers
 *
 * NOTE: This module delegates to dedicated domain utility files:
 * - `mineData.ts`: Mine configs, levels, cargo calculations, and gathering calls
 * - `mobData.ts`: Boss/Solo monster configs, rally phases, and rally calls
 * - `squadCapacity.ts`: Troop capacity modeling, units, allocation, and squad formation
 *
 * Direct imports from the respective domain files are preferred.
 */

export * from './squadCapacity.ts';
export * from './mobData.ts';
export * from './mineData.ts';

export type {
  CapacitySettings,
  UnitInfo,
} from './squadCapacity.ts';

export type {
  RallyPhaseInfo,
} from './mobData.ts';

export type {
  OptimizedGatheringTeamParams,
  OptimizedGatheringTeamResult,
} from './mineData.ts';

import {
  capacityExamples,
  normalizeCapacitySettings,
  capacitySignature,
  estimateHeroTroopCapacity,
  heroCapacity,
  squadCapacity,
  capacityModel,
  unitInfo,
  allocateTroops,
  availableHeroIds,
  normalizeCustomTeam,
  lowestPowerHeroes,
  highestPowerHeroes,
  teamOptions,
  autoJoinTeamOptions,
  teamTroopCapacity,
  buildSquad,
} from './squadCapacity.ts';

import {
  rallyWaitOptions,
  bossConfigId,
  bossLevel,
  soloMonsterConfigIds,
  soloMonsterLevel,
  rallyPhase,
  rallyMembers,
  buildRallyCall,
  buildJoinRallyCall,
} from './mobData.ts';

import {
  mineConfigs,
  getMineConfigId,
  getMineTypeLevel,
  mineConfigId,
  mineTypeLevel,
  buildMineSearchCall,
  buildGatherCall,
  RESOURCE_CARGO_WEIGHT,
  MINE_LEVEL_TOTAL_CARGO,
  TROOP_CARGO_CAPACITY_BY_LEVEL,
  calculateMineCargo,
  calculateRequiredTroopsForCargo,
  buildOptimizedGatheringTeam,
} from './mineData.ts';

export const experimentalDataHelper = {
  rallyWaitOptions,
  capacitySignature,
  heroCapacity,
  estimateHeroTroopCapacity,
  squadCapacity,
  normalizeCapacitySettings,
  capacityModel,
  unitInfo,
  allocateTroops,
  bossConfigId,
  bossLevel,
  soloMonsterConfigIds,
  soloMonsterLevel,
  mineConfigs,
  mineConfigId: getMineConfigId,
  mineTypeLevel: getMineTypeLevel,
  availableHeroIds,
  normalizeCustomTeam,
  lowestPowerHeroes,
  highestPowerHeroes,
  teamOptions,
  autoJoinTeamOptions,
  teamTroopCapacity,
  buildSquad,
  buildRallyCall,
  buildJoinRallyCall,
  buildGatherCall,
  buildMineSearchCall,
  rallyMembers,
  rallyPhase,
  RESOURCE_CARGO_WEIGHT,
  MINE_LEVEL_TOTAL_CARGO,
  TROOP_CARGO_CAPACITY_BY_LEVEL,
  calculateMineCargo,
  calculateRequiredTroopsForCargo,
  buildOptimizedGatheringTeam,
};

export default experimentalDataHelper;
