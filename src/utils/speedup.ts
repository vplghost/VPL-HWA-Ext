import { speedupData } from '../data/speedupData.ts';
import { speedupService } from '../services/speedupService.ts';

export type SpeedupKind = 'building' | 'research' | 'healing';
export const speedup = speedupService;
export { speedupData, speedupService };
export * from '../services/speedupService.ts';
