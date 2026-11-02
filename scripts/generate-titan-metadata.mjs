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
const splitlibHeroes = JSON.parse(await readFile(join(root, 'temp/splitlib/hero.json'), 'utf8'));
const splitlibArtifactTypes = JSON.parse(await readFile(join(root, 'temp/splitlib/artifact_type.json'), 'utf8'));

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
  const heroData = splitlibHeroes[id] || Object.values(splitlibHeroes).find(x => x.id === Number(id));
  metadata[id] = {
    name: heroNames[id] || `Titan #${id}`,
    role: typeLabels[t.type] || t.type || 'Unknown',
    element: elementLabels[t.mainElement] || t.mainElement || 'Unknown',
    hasAvatar: avatarExists,
    ...(avatarExists ? { avatarFile: `assets/titans/${id}.png` } : {}),
    artifacts: Array.isArray(heroData?.artifacts) ? heroData.artifacts : []
  };
}

// Evolution fragment cost from titanCrown
const crownType = (Array.isArray(splitlibArtifactTypes) ? splitlibArtifactTypes : Object.values(splitlibArtifactTypes))
  .find(x => x.type === 'titanCrown');

const evolveCost = {};
if (crownType?.evolution) {
  for (const [star, ev] of Object.entries(crownType.evolution)) {
    evolveCost[Number(star)] = Number(ev.costFragmentsAmount);
  }
} else {
  Object.assign(evolveCost, { 1: 15, 2: 300, 3: 900, 4: 1500, 5: 4500, 6: 15000 });
}

// Level costs [dust, gold] from titanCrown (identical for all 3 titan artifact types)
const levelCosts = [];
if (crownType?.levels) {
  for (let i = 1; i <= 120; i++) {
    const lvl = crownType.levels[String(i)];
    if (lvl) {
      levelCosts[i] = [
        Number(lvl.cost?.coin?.['18'] || 0),
        Number(lvl.cost?.gold || 0)
      ];
    }
  }
}

const outputJs = `// Generated titan metadata\n` +
  `globalThis.hwaHelperTitanMetadata = ${JSON.stringify(metadata, null, 2)};\n\n` +
  `globalThis.hwaHelperTitanArtifactEvolveCost = ${JSON.stringify(evolveCost, null, 2)};\n\n` +
  `globalThis.hwaHelperTitanArtifactLevelCosts = ${JSON.stringify(levelCosts)};\n`;

await writeFile(join(root, 'extension/titan-metadata.js'), outputJs, 'utf8');
console.log(`Wrote titan metadata to extension/titan-metadata.js (${Object.keys(metadata).length} titans).`);
