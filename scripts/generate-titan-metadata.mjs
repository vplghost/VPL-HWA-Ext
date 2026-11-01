import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const assetsDir = join(root, 'extension/assets/titans');

const namesContext = {};
vm.runInNewContext(await readFile(join(root, 'extension/data-names.js'), 'utf8'), namesContext);
const heroNames = namesContext.hwaHelperNameData.names.hero;

const splitlibTitans = JSON.parse(await readFile(join(root, 'temp/splitlib/titan.json'), 'utf8'));

const typeLabels = {
  melee: 'Tank',
  range: 'Marksman',
  support: 'Support',
  ultra: 'Supertitan',
  summon: 'Summoner'
};

const elementLabels = {
  water: 'Water',
  fire: 'Fire',
  earth: 'Earth',
  dark: 'Darkness',
  light: 'Light',
  mage: 'Spirit'
};

const metadata = {};
for (const [id, t] of Object.entries(splitlibTitans).sort(([a], [b]) => Number(a) - Number(b))) {
  const avatarExists = existsSync(join(assetsDir, `${id}.png`));
  metadata[id] = {
    name: heroNames[id] || `Titan #${id}`,
    role: typeLabels[t.type] || t.type || 'Unknown',
    element: elementLabels[t.mainElement] || t.mainElement || 'Unknown',
    hasAvatar: avatarExists,
    ...(avatarExists ? { avatarFile: `assets/titans/${id}.png` } : {})
  };
}

const outputJs = `// Generated titan metadata\n` +
  `globalThis.hwaHelperTitanMetadata = ${JSON.stringify(metadata, null, 2)};\n`;

await writeFile(join(root, 'extension/titan-metadata.js'), outputJs, 'utf8');
console.log(`Wrote titan metadata to extension/titan-metadata.js (${Object.keys(metadata).length} titans).`);
