import { speedupData } from '../data/speedupData.ts';
import '../../extension/speedup.js';
export type SpeedupKind = 'building' | 'research' | 'healing';
export const speedup = (globalThis as any).hwaHelperSpeedup;
export { speedupData };
