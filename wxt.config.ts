import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'HWA Helper',
    description: 'Personal page tweaks and API profiling for Hero Wars: Alliance',
    permissions: ['storage', 'unlimitedStorage', 'tabs'],
    host_permissions: [
      'https://*.hero-wars-alliance.com/*',
      'https://hero-wars-alliance.com/*',
    ],
    background: {
      service_worker: 'background.js',
    },
    content_scripts: [
      {
        matches: [
          'https://www.hero-wars-alliance.com/*',
          'https://hero-wars-alliance.com/*',
        ],
        css: ['page.css'],
        js: ['bridge.js'],
        run_at: 'document_start',
      },
      {
        matches: [
          'https://www.hero-wars-alliance.com/*',
          'https://hero-wars-alliance.com/*',
        ],
        js: ['tracking-filter.js', 'intercept.js', 'mqtt-capture.js'],
        run_at: 'document_start',
        world: 'MAIN',
      },
    ],
  },
});
