import { mailService } from '../services/mailService.ts';

export const mail = (globalThis as any).hwaHelperMailData || mailService;
export { mailService };
export * from '../services/mailService.ts';
