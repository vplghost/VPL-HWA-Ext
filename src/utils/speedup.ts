import '../../extension/speedup-data.js';
import '../../extension/speedup.js';
export type SpeedupKind = 'building' | 'research' | 'healing';
export const speedup = (globalThis as any).hwaHelperSpeedup;
