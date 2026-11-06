import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const assetsDir = join(root, 'extension/assets/heroes');
await mkdir(assetsDir, { recursive: true });

const namesContext = {};
vm.runInNewContext(await readFile(join(root, 'extension/data-names.js'), 'utf8'), namesContext);
const heroNames = namesContext.hwaHelperNameData.names.hero;

const splitlibHeroes = JSON.parse(await readFile(join(root, 'temp/splitlib/hero.json'), 'utf8'));
const heroClassBuf = await readFile(join(root, 'temp/splitlib/hero_class.pb'));

function decodeHeroClasses(buf) {
  function decodeVarint(buffer, offset) {
    let res = 0, shift = 0;
    while (true) {
      const b = buffer[offset++];
      res |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return [res, offset];
  }
  const classNames = {
    0: 'Tank',
    1: 'Warrior',
    2: 'Marksman',
    3: 'Mage',
    4: 'Healer',
    5: 'Support',
    6: 'Control'
  };
  const heroClasses = {};
  let offset = 0;
  while (offset < buf.length) {
    const [tag, nextOff] = decodeVarint(buf, offset);
    offset = nextOff;
    if ((tag & 7) === 2) {
      const [len, o2] = decodeVarint(buf, offset);
      offset = o2;
      const end = offset + len;
      let classId = 0;
      let heroIds = [];
      while (offset < end) {
        const [subTag, o3] = decodeVarint(buf, offset);
        offset = o3;
        if ((subTag & 7) === 0) {
          const [v, o4] = decodeVarint(buf, offset);
          offset = o4;
          if ((subTag >> 3) === 1) classId = v;
        } else if ((subTag & 7) === 2) {
          const [subLen, o4] = decodeVarint(buf, offset);
          offset = o4;
          const subEnd = offset + subLen;
          while (offset < subEnd) {
            const [hid, o5] = decodeVarint(buf, offset);
            offset = o5;
            heroIds.push(hid);
          }
        }
      }
      for (const id of heroIds) heroClasses[id] = classNames[classId] || 'Unknown';
    }
  }
  return heroClasses;
}

const heroClasses = decodeHeroClasses(heroClassBuf);

const factionNames = {
  1: 'Way of Eternity',
  2: 'Way of Nature',
  3: 'Way of Honor',
  4: 'Way of Chaos',
  5: 'Way of Progress',
  6: 'Way of Mystery'
};

const roleNames = {
  front: 'Front',
  middle: 'Middle',
  back: 'Back'
};

const playableHeroes = Object.entries(splitlibHeroes)
  .filter(([id, h]) => h.type === 'hero' && Number(id) < 1000)
  .sort(([a], [b]) => Number(a) - Number(b));

console.log(`Found ${playableHeroes.length} playable heroes.`);

// Download/convert avatars with assets:sync first; metadata generation stays local.
const metadata = {};
for (const [id, h] of playableHeroes) {
  const factionId = h.special?.[0];
  let avatarFile = null;
  if (existsSync(join(assetsDir, `${id}.png`))) {
    avatarFile = `assets/heroes/${id}.png`;
  } else if (existsSync(join(assetsDir, `${id}.webp`))) {
    avatarFile = `assets/heroes/${id}.webp`;
  }

  metadata[id] = {
    name: heroNames[id] || `Hero #${id}`,
    role: roleNames[h.role] || 'Unknown',
    class: heroClasses[id] || 'Unknown',
    faction: factionNames[factionId] || 'Unknown',
    hasAvatar: !!avatarFile,
    ...(avatarFile ? { avatarFile } : {})
  };
}

const outputJs = `// Generated hero metadata\n` +
  `globalThis.hwaHelperHeroMetadata = ${JSON.stringify(metadata, null, 2)};\n`;

await writeFile(join(root, 'extension/hero-metadata.js'), outputJs, 'utf8');
console.log(`Wrote hero metadata to extension/hero-metadata.js (${Object.keys(metadata).length} heroes).`);
