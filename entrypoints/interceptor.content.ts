if (typeof (globalThis as any).defineContentScript === 'undefined') {
  (globalThis as any).defineContentScript = (config: any) => config;
}

import { installInterceptor } from '../src/content/interceptor.ts';

export interface InterceptRecord {
  endpoint: string;
  method?: string;
  status?: number;
  requestBody?: string;
  responseBody?: string;
  timestamp: string;
  transport?: string;
  direction?: string;
  encoding?: string;
  payload?: string;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
}

export function isTargetRpcUrl(url: string | URL | Request): boolean {
  if (!url) return false;
  const str = typeof url === 'string' ? url : (url as any).url || url.toString();
  return str.includes('/api/rpc') || str.includes('api.hero-wars-alliance.com');
}

export function isMqttUrl(url: string | URL): boolean {
  if (!url) return false;
  const str = typeof url === 'string' ? url : url.toString();
  return str.includes('emqx-hwmb-wss.nextersglobal.com/mqtt') || str.includes('/mqtt');
}

export function createApiRecordMessage(record: InterceptRecord): {
  source: 'hwa-helper-api';
  kind: 'api-record';
  record: InterceptRecord;
} {
  return {
    source: 'hwa-helper-api',
    kind: 'api-record',
    record
  };
}

export function createQueueStatusMessage(count: number): {
  source: 'hwa-helper-api';
  kind: 'rpc-queue-status';
  count: number;
} {
  return {
    source: 'hwa-helper-api',
    kind: 'rpc-queue-status',
    count: Math.max(0, Math.min(64, Math.floor(count)))
  };
}

export default defineContentScript({
  matches: [
    'https://*.hero-wars-alliance.com/*',
    'https://www.hero-wars-alliance.com/*',
    'https://hero-wars-alliance.com/*'
  ],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installInterceptor();
  }
});
