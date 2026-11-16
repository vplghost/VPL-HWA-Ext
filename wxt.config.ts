import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// Keep the established classic worker/MAIN-world contracts as WXT public assets.
// The popup and background are compiled from entrypoints; never ship legacy worker or popup renderer.
const excluded = new Set(['manifest.json', 'popup.html', 'popup.js', 'popup.css', 'theme.css', 'background.js']);
async function runtimeAssets(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(async (entry) => {
    if (excluded.has(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? runtimeAssets(path) : [path];
  }));
  return groups.flat();
}

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  hooks: {
    'build:publicAssets': async (wxt, assets) => {
      const source = resolve(wxt.config.root, 'extension');
      for (const path of await runtimeAssets(source)) {
        assets.push({ absoluteSrc: path, relativeDest: relative(source, path).replaceAll('\\', '/') });
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'HWA Helper',
    description: 'Personal page tweaks and API profiling for Hero Wars: Alliance',
    permissions: ['storage', 'unlimitedStorage', 'tabs', 'alarms'],
    host_permissions: [
      'https://*.hero-wars-alliance.com/*',
      'https://hero-wars-alliance.com/*',
    ],
    content_scripts: [
      {
        matches: [
          'https://*.hero-wars-alliance.com/*',
          'https://hero-wars-alliance.com/*',
        ],
        css: ['page.css'],
      },
    ],
  },
});
