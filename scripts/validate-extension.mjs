import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';

/** Check the artifact, including classic service-worker dependencies. */
export async function validateExtension(directory) {
  const root = resolve(directory);
  async function requireFile(file) {
    const target = resolve(root, file);
    if (!target.startsWith(root + sep) || !(await stat(target)).isFile()) throw new Error(`Invalid extension artifact: ${file}`);
    return target;
  }
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || manifest.name !== 'HWA Helper') throw new Error('Invalid extension manifest');
  const worker = manifest.background?.service_worker;
  const popup = manifest.action?.default_popup;
  if (!worker || !popup) throw new Error('Missing worker or popup');
  const scripts = [worker, ...manifest.content_scripts.flatMap(entry => entry.js ?? [])];
  for (const file of [...scripts, popup, ...manifest.content_scripts.flatMap(entry => entry.css ?? [])]) await requireFile(file);
  const seen = new Set();
  async function validateScript(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const source = await readFile(await requireFile(file), 'utf8');
    if (/\bchrome\.alarms\b/.test(source) && !manifest.permissions?.includes('alarms')) {
      throw new Error('Missing alarms permission for queue worker');
    }
    for (const call of source.matchAll(/importScripts\(([^)]+)\)/g)) {
      for (const dependency of call[1].matchAll(/['"]([^'"]+)['"]/g)) await validateScript(dependency[1]);
    }
  }
  for (const script of scripts) await validateScript(script);
  const html = await readFile(join(root, popup), 'utf8');
  if (/src=["'](?:\.\/)?popup\.js["']/.test(html)) throw new Error('Legacy popup renderer in WXT output');
  for (const reference of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)) await requireFile(reference[1].replace(/^\//, ''));
  return manifest;
}
