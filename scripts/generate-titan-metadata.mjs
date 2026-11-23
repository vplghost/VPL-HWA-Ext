import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

import { nameData } from '../src/data/nameData.ts';

const root = resolve(import.meta.dirname, '..');
const assetsDir = join(root, 'extension/assets/titans');

const heroNames = nameData.names.hero;

const splitlibTitans = JSON.parse(await readFile(join(root, 'temp/splitlib/titan.json'), 'utf8'));
const splitlibHeroes = JSON.parse(await readFile(join(root, 'temp/splitlib/hero.json'), 'utf8'));
const splitlibArtifactTypes = JSON.parse(await readFile(join(root, 'temp/splitlib/artifact_type.json'), 'utf8'));

let locale = {};
try {
  locale = JSON.parse(await readFile(join(root, 'temp/items-current-en.json'), 'utf8'));
} catch (e) {
  console.warn('Could not read temp/items-current-en.json:', e.message);
}

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
  let skills = null;
  if (heroData?.skill) {
    const sids = Array.isArray(heroData.skill)
      ? heroData.skill.slice(1)
      : Object.keys(heroData.skill).filter(k => k !== '0').map(k => heroData.skill[k]);
    const names = sids.map(sid => locale['LIB_SKILL_' + sid]).filter(Boolean);
    if (names.length > 0) skills = names;
  }
  metadata[id] = {
    name: heroNames[id] || `Titan #${id}`,
    role: typeLabels[t.type] || t.type || 'Unknown',
    element: elementLabels[t.mainElement] || t.mainElement || 'Unknown',
    hasAvatar: avatarExists,
    ...(avatarExists ? { avatarFile: `assets/titans/${id}.png` } : {}),
    ...(skills ? { skills } : {}),
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

await writeFile(join(root, 'temp/titan-metadata.js'), outputJs, 'utf8');
console.log(`Wrote titan metadata to temp/titan-metadata.js (${Object.keys(metadata).length} titans).`);
