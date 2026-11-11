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
  },
});
