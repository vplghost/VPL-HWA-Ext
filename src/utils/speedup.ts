import { speedupData } from '../data/speedupData.ts';
import { speedupService } from '../services/speedupService.ts';

export type SpeedupKind = 'building' | 'research' | 'healing';
export const speedup = (globalThis as any).hwaHelperSpeedup || speedupService;
export { speedupData, speedupService };
export * from '../services/speedupService.ts';
