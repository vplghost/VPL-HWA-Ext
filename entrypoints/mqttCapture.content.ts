if (typeof (globalThis as any).defineContentScript === 'undefined') {
  (globalThis as any).defineContentScript = (config: any) => config;
}

import { installMqttCapture } from '../src/content/mqttCapture.ts';

export default defineContentScript({
  matches: [
    'https://www.hero-wars-alliance.com/*',
    'https://hero-wars-alliance.com/*'
  ],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installMqttCapture();
  }
});
