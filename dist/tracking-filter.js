// Shared by the page hook, service worker, and popup.
(() => {
  const trackingHosts = new Set([
    'analytics.nextersglobal.com',
    'wa.appsflyersdk.com',
    'websdk.appsflyersdk.com',
    'www.google-analytics.com',
    'googleads.g.doubleclick.net',
    'ad.doubleclick.net',
    'www.googleadservices.com'
  ]);

  globalThis.hwaHelperIsTrackingUrl = (input, base) => {
    try {
      const url = new URL(String(input), base);
      if (trackingHosts.has(url.hostname.toLowerCase())) return true;
      return url.hostname.toLowerCase() === 'www.google.com'
        && /^\/(?:ccm|rmkt)\/collect(?:\/|$)/.test(url.pathname);
    } catch (_) {
      return false;
    }
  };
})();
