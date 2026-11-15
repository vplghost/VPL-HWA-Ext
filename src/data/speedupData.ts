import type { SpeedupDataStructure, SpeedupType } from '@/src/types/game/speedup';

export const speedupData: SpeedupDataStructure = {
  sources: {
    speedUpConstruction: {
      url: "https://hwmb-remote-config-cdn.nextersglobal.com/config/speedUpConstruction/3f1b14d8467852960a55926aecd9e693.json",
      md5: "3f1b14d8467852960a55926aecd9e693"
    },
    speedUpResearch: {
      url: "https://hwmb-remote-config-cdn.nextersglobal.com/config/speedUpResearch/4f01de43565a19c042e5c72374b64994.json",
      md5: "4f01de43565a19c042e5c72374b64994"
    },
    speedUpUnitHealing: {
      url: "https://hwmb-remote-config-cdn.nextersglobal.com/config/speedUpUnitHealing/9144b4f9ef04daa129df573fe32cc51b.json",
      md5: "9144b4f9ef04daa129df573fe32cc51b"
    }
  },
  durations: {
    speedUpConstruction: {
      "1": 60000,
      "2": 300000,
      "3": 3600000,
      "4": 10800000,
      "5": 28800000
    },
    speedUpResearch: {
      "1": 60000,
      "2": 300000,
      "3": 3600000,
      "4": 10800000,
      "5": 28800000
    },
    speedUpUnitHealing: {
      "1": 60000,
      "2": 300000,
      "3": 3600000,
      "4": 10800000,
      "5": 28800000
    }
  }
};

export function getSpeedupDuration(type: SpeedupType, itemLevel: number | string): number | null {
  const duration = speedupData.durations[type]?.[String(itemLevel)];
  return typeof duration === 'number' ? duration : null;
}

// Preserve backward compatibility for background worker scripts and VM tests
if (typeof globalThis !== 'undefined') {
  (globalThis as any).hwaHelperSpeedupData = speedupData;
}
