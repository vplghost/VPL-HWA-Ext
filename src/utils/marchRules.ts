import type { BasicResourceType, MineTypesMap, RallyTargetsMap, RouteSpeedsMap } from '../types/game/march';

// Hero Wars: Alliance 1.293.0 (client 1.293.1010) remote config:
// globalMapMine 8e714674, globalMapMobRally 4a3a6b4b, globalMapRouteSpeed 5d86c2e8.

export const mineTypes: MineTypesMap = {
  '12': 'wood',
  '20': 'wood',
  '21': 'wood',
  '22': 'wood',
  '23': 'wood',
  '24': 'wood',
  '27': 'food',
  '28': 'food',
  '29': 'food',
  '30': 'food',
  '31': 'food',
  '32': 'food',
  '35': 'stone',
  '36': 'stone',
  '37': 'stone',
  '38': 'stone',
  '39': 'stone',
  '40': 'stone',
  '43': 'iron',
  '44': 'iron',
  '45': 'iron',
  '46': 'iron',
  '47': 'iron',
  '48': 'iron',
  '55': 'wood',
  '56': 'wood',
  '57': 'wood',
  '58': 'wood',
  '65': 'food',
  '66': 'food',
  '67': 'food',
  '68': 'food',
  '75': 'stone',
  '76': 'stone',
  '77': 'stone',
  '78': 'stone',
  '85': 'iron',
  '86': 'iron',
  '87': 'iron',
  '88': 'iron',
};

export const rallyTargets: RallyTargetsMap = {
  '25': 'Ork Shaman',
  '26': 'Blood Shaman',
  '27': 'Werewolf',
  '28': 'Dire Werewolf',
  '29': 'Wild Demon',
  '60': '[PvP] Boss, level 1',
  '61': '[PvP] Boss, level 2',
  '62': '[PvP] Boss, level 3',
  '63': '[PvP] Boss, level 4',
  '64': '[PvP] Boss, level 5',
  '65': '[PvP] Boss, level 6',
  '66': '[PvP] Boss, level 7',
  '67': '[PvP] Boss, level 8',
  '68': '[PvP] Boss, level 9',
  '69': '[PvP] Boss, level 10',
  '70': '[PvP] Boss, level 11',
  '71': '[PvP] Boss, level 12',
  '72': '[PvP] Boss, level 13',
  '73': '[PvP] Boss, level 14',
  '74': '[PvP] Boss, level 15',
  '75': '[PvP] Boss, level 16',
  '76': '[PvP] Boss, level 17',
  '77': '[PvP] Boss, level 18',
  '78': '[PvP] Boss, level 19',
  '79': '[PvP] Boss, level 20',
  '80': '[PvP] Boss, level 21',
  '81': '[PvP] Boss, level 22',
  '82': '[PvP] Boss, level 23',
  '83': '[PvP] Boss, level 24',
  '84': '[PvP] Boss, level 25',
  '85': '[PvP] Boss, level 26',
  '86': '[PvP] Boss, level 27',
  '87': '[PvP] Boss, level 28',
  '88': '[PvP] Boss, level 29',
  '89': '[PvP] Boss, level 30',
};

export const routeSpeeds: RouteSpeedsMap = {
  toTargetRallyPve: 20,
  returnToOutpost: 15,
};

export function getMineResourceType(configId: number | string | null | undefined): BasicResourceType | undefined {
  if (configId == null) return undefined;
  return mineTypes[String(configId)];
}

export function getRallyTargetName(configId: number | string | null | undefined): string | undefined {
  if (configId == null) return undefined;
  return rallyTargets[String(configId)];
}

export function getRouteSpeed(routeType: string | null | undefined): number | undefined {
  if (!routeType) return undefined;
  return routeSpeeds[routeType];
}
