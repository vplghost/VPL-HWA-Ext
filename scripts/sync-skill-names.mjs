import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// 1. Load data sources
const loc = JSON.parse(await readFile(join(root, 'temp/items-current-en.json'), 'utf8'));
const heroes = JSON.parse(await readFile(join(root, 'temp/splitlib/hero.json'), 'utf8'));
const titans = JSON.parse(await readFile(join(root, 'temp/splitlib/titan.json'), 'utf8'));

console.log('Loaded locale and splitlib data.');

// 2. Build Hero Skills Map
// Playable heroes: keys 1..4 in h.skill
const heroSkillsMap = {};
for (const [id, h] of Object.entries(heroes)) {
  if (titans[id]) continue; // Skip titans
  if (!h || !h.skill) continue;
  const skills = h.skill;
  const skillObj = Array.isArray(skills)
    ? { 0: skills[0], 1: skills[1], 2: skills[2], 3: skills[3], 4: skills[4] }
    : skills;

  const s1 = loc['LIB_SKILL_' + skillObj['1']] || null;
  const s2 = loc['LIB_SKILL_' + skillObj['2']] || null;
  const s3 = loc['LIB_SKILL_' + skillObj['3']] || null;
  const s4 = loc['LIB_SKILL_' + skillObj['4']] || null;

  if (s1 && s2 && s3 && s4) {
    heroSkillsMap[id] = [s1, s2, s3, s4];
  }
}
console.log(`Resolved skills for ${Object.keys(heroSkillsMap).length} heroes.`);

// 3. Build Titan Skills Map
// Titans: indices 1..n in h.skill (index 0 is Basic Attack)
const titanSkillsMap = {};
for (const id of Object.keys(titans).sort((a, b) => Number(a) - Number(b))) {
  const h = heroes[id] || Object.values(heroes).find(x => x.id === Number(id));
  if (!h || !h.skill) continue;
  const skills = h.skill;
  const sids = Array.isArray(skills)
    ? skills.slice(1)
    : Object.keys(skills).filter(k => k !== '0').map(k => skills[k]);

  const names = sids
    .map(sid => loc['LIB_SKILL_' + sid])
    .filter(Boolean);

  if (names.length > 0) {
    titanSkillsMap[id] = names;
  }
}
console.log(`Resolved skills for ${Object.keys(titanSkillsMap).length} titans.`);

// 4. Update src/data/titanMetadata.ts
let titanTs = await readFile(join(root, 'src/data/titanMetadata.ts'), 'utf8');
let titanUpdates = 0;
for (const [tid, names] of Object.entries(titanSkillsMap)) {
  // Regex strictly within the block for this titan
  const regex = new RegExp(`("${tid}":\\s*\\{[^}]*?"skills":\\s*)\\[[^\\]]*\\]`);
  if (regex.test(titanTs)) {
    titanTs = titanTs.replace(regex, `$1${JSON.stringify(names)}`);
    titanUpdates++;
  } else {
    // If titan didn't have skills field, try to add it after avatarFile
    const addRegex = new RegExp(`("${tid}":\\s*\\{[^}]*?"avatarFile":\\s*"[^"]*",)`);
    if (addRegex.test(titanTs)) {
      titanTs = titanTs.replace(addRegex, `$1\n    "skills": ${JSON.stringify(names)},`);
      titanUpdates++;
    }
  }
}
await writeFile(join(root, 'src/data/titanMetadata.ts'), titanTs, 'utf8');
console.log(`Updated ${titanUpdates} titans in src/data/titanMetadata.ts.`);

// 5. Update src/data/heroMetadata.ts
let heroTs = await readFile(join(root, 'src/data/heroMetadata.ts'), 'utf8');
let heroUpdates = 0;

for (const [hid, names] of Object.entries(heroSkillsMap)) {
  const formattedSkills = `[\n      ${names.map(n => JSON.stringify(n)).join(',\n      ')}\n    ]`;
  const regex = new RegExp(`("${hid}":\\s*\\{[^}]*?"skills":\\s*)\\[[\\s\\S]*?\\]`);
  if (regex.test(heroTs)) {
    heroTs = heroTs.replace(regex, `$1${formattedSkills}`);
    heroUpdates++;
  }
}
await writeFile(join(root, 'src/data/heroMetadata.ts'), heroTs, 'utf8');
console.log(`Updated ${heroUpdates} heroes in src/data/heroMetadata.ts.`);
