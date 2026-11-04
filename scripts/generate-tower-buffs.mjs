import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const nameData = await readFile(new URL('../extension/data-names.js', import.meta.url), 'utf8');
const assetUrl = nameData.match(/^\/\/ Generated from (https:\/\/[^\s]+\/locale\/en\.json\.gz)/)?.[1];
if (!assetUrl || new URL(assetUrl).hostname !== 'heroesmobile-a-cdn.nextersglobal.com') {
  throw new Error('Missing trusted English locale URL in data-names.js');
}

const response = await fetch(assetUrl);
if (!response.ok) throw new Error(`Locale download failed: HTTP ${response.status}`);
const locale = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'));
const buffs = {};
for (const [key, name] of Object.entries(locale)) {
  const match = /^MAGIC_TOWER_BUFF_(\d+)_NAME$/.exec(key);
  if (!match || typeof name !== 'string') continue;
  const description = locale[`MAGIC_TOWER_BUFF_${match[1]}_DESC`];
  if (typeof description !== 'string') throw new Error(`Missing description for Tower buff ${match[1]}`);
  buffs[match[1]] = { name, description: description.replace(/<[^>]*>/g, '') };
}
if (!Object.keys(buffs).length) throw new Error('No Tower buffs found in English locale');
const output = `// Generated from ${assetUrl}\n` +
  `globalThis.hwaHelperTowerBuffs = ${JSON.stringify(buffs, null, 2)};\n`;
await writeFile(new URL('../extension/tower-buffs.js', import.meta.url), output);
console.log(`Generated ${Object.keys(buffs).length} Tower buffs`);
