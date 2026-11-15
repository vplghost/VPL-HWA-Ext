if (typeof (globalThis as any).defineContentScript === 'undefined') {
  (globalThis as any).defineContentScript = (config: any) => config;
}

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
    'https://www.hero-wars-alliance.com/*',
    'https://hero-wars-alliance.com/*'
  ],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    let interceptEnabled = true;
    let recordingActive = false;

    // Listen to control message from isolated world bridge
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.source !== 'hwa-helper-config' || event.data.kind !== 'control') return;
      if (event.data.interceptEnabled !== undefined) {
        interceptEnabled = Boolean(event.data.interceptEnabled);
      }
      if (event.data.recordingActive !== undefined) {
        recordingActive = Boolean(event.data.recordingActive);
      }
    });

    // Notify bridge that MAIN world interceptor is ready
    window.postMessage({ source: 'hwa-helper-api', kind: 'ready' }, location.origin);
  }
});
