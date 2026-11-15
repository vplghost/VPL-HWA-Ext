import type { MineDefenseData } from '../types/game/mineDefense';

// Generated from remote config buildingLevel & bonus.
export const mineDefenseData: MineDefenseData = {
  sources: {
    building: {
      url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/building/6079f8c3c425fbbef1d81bc09c925533.json',
      md5: '6079f8c3c425fbbef1d81bc09c925533',
    },
    buildingLevel: {
      url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/buildingLevel/8f8820e1d76bbfa899e8bdf9241880bf.json',
      md5: '8f8820e1d76bbfa899e8bdf9241880bf',
    },
    bonus: {
      url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/bonus/ea971ab94960e0606c25e03fedce1bab.json',
      md5: 'ea971ab94960e0606c25e03fedce1bab',
    },
  },
  capacities: {
    '162': {
      '0': 0,
      '1': 400,
      '2': 700,
      '3': 1200,
      '4': 1700,
      '5': 2200,
      '6': 2800,
      '7': 3400,
      '8': 4000,
      '9': 4700,
      '10': 5300,
      '11': 6000,
      '12': 6700,
      '13': 7400,
      '14': 8200,
      '15': 8900,
      '16': 9600,
      '17': 10400,
      '18': 11200,
      '19': 11900,
      '20': 12700,
      '21': 13500,
      '22': 14300,
      '23': 15100,
      '24': 16000,
      '25': 16800,
    },
    '174': {
      '0': 0,
      '1': 400,
      '2': 700,
      '3': 1200,
      '4': 1700,
      '5': 2200,
      '6': 2800,
      '7': 3400,
      '8': 4000,
      '9': 4700,
      '10': 5300,
      '11': 6000,
      '12': 6700,
      '13': 7400,
      '14': 8200,
      '15': 8900,
      '16': 9600,
      '17': 10400,
      '18': 11200,
      '19': 11900,
      '20': 12700,
      '21': 13500,
      '22': 14300,
      '23': 15100,
      '24': 16000,
      '25': 16800,
    },
    '175': {
      '0': 0,
      '1': 400,
      '2': 700,
      '3': 1200,
      '4': 1700,
      '5': 2200,
      '6': 2800,
      '7': 3400,
      '8': 4000,
      '9': 4700,
      '10': 5300,
      '11': 6000,
      '12': 6700,
      '13': 7400,
      '14': 8200,
      '15': 8900,
      '16': 9600,
      '17': 10400,
      '18': 11200,
      '19': 11900,
      '20': 12700,
      '21': 13500,
      '22': 14300,
      '23': 15100,
      '24': 16000,
      '25': 16800,
    },
  },
};

export function getInfirmaryCapacity(
  buildingId: number | string,
  level: number | string
): number | undefined {
  return mineDefenseData.capacities[String(buildingId)]?.[String(level)];
}

// Preserve backward compatibility for background service worker scripts and VM tests
if (typeof globalThis !== 'undefined') {
  if (!(globalThis as any).hwaHelperMineDefenseData) {
    (globalThis as any).hwaHelperMineDefenseData = mineDefenseData;
  }
}
