export const TRACKING_HOSTS: ReadonlySet<string> = new Set([
  'analytics.nextersglobal.com',
  'wa.appsflyersdk.com',
  'websdk.appsflyersdk.com',
  'www.google-analytics.com',
  'googleads.g.doubleclick.net',
  'ad.doubleclick.net',
  'www.googleadservices.com',
]);

/**
 * Checks whether an input URL targets a known analytics, advertising, or telemetry endpoint.
 */
export function isTrackingUrl(input: string | URL | null | undefined, base?: string | URL): boolean {
  if (input == null) return false;
  try {
    const url = new URL(String(input), base);
    const host = url.hostname.toLowerCase();
    if (TRACKING_HOSTS.has(host)) return true;
    return host === 'www.google.com' && /^\/(?:ccm|rmkt)\/collect(?:\/|$)/.test(url.pathname);
  } catch (_) {
    return false;
  }
}
