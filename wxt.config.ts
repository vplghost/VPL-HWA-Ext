import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// Keep the established classic worker/MAIN-world contracts as WXT public assets.
// The popup is always compiled from entrypoints/popup; never ship its legacy renderer.
const excluded = new Set(['manifest.json', 'popup.html', 'popup.js', 'popup.css', 'theme.css', 'export-name.js']);
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
