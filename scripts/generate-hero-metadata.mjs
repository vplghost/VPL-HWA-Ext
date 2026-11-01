import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { convertImgBuffer } from './convert-img-asset.mjs';

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

// Fetch avatars from Fandom wiki
const titles = [];
const idMap = {};
for (const [id] of playableHeroes) {
  const name = heroNames[id];
  if (name) {
    titles.push(`File:Mobile ${name} Avatar.png`);
    titles.push(`File:Browser ${name} Avatar.png`);
    titles.push(`File:${name} Avatar.png`);
    idMap[name] = id;
  }
}

const avatarUrls = {};
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50).join('|');
  const url = `https://hero-wars.fandom.com/api.php?action=query&titles=${encodeURIComponent(batch)}&prop=imageinfo&iiprop=url&format=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'HWAHelper/1.0' } });
    const data = await res.json();
    for (const p of Object.values(data.query?.pages || {})) {
      if (p.imageinfo?.[0]?.url) {
        const m = p.title.match(/File:(?:Mobile |Browser )?(.+?) Avatar\.png/);
        if (m && idMap[m[1]]) {
          const hid = idMap[m[1]];
          if (!avatarUrls[hid]) avatarUrls[hid] = p.imageinfo[0].url;
        }
      }
    }
  } catch (err) {
    console.error('Error querying Fandom:', err.message);
  }
}

console.log(`Found ${Object.keys(avatarUrls).length} hero avatar URLs on Fandom.`);

// Ensure avatar images exist on disk (check local .webp or .png first, then Fandom webp, then CDN .img)
for (const [id, originalUrl] of Object.entries(avatarUrls)) {
  const targetWebp = join(assetsDir, `${id}.webp`);
  const targetPng = join(assetsDir, `${id}.png`);
  if (existsSync(targetWebp) || existsSync(targetPng)) continue;

  try {
    const scaledUrl = originalUrl.replace(/\/revision\/latest(\/scale-to-width-down\/\d+)?/, '/revision/latest/scale-to-width-down/120');
    const res = await fetch(scaledUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(targetWebp, buffer);
    }
  } catch (err) {
    console.warn(`Failed downloading avatar for hero ${id}:`, err.message);
  }
}

// For playable heroes still missing an avatar, try game CDN .img asset
for (const [id] of playableHeroes) {
  const targetWebp = join(assetsDir, `${id}.webp`);
  const targetPng = join(assetsDir, `${id}.png`);
  if (existsSync(targetWebp) || existsSync(targetPng)) continue;

  const pad = String(id).padStart(4, '0');
  const candidateUrls = [
    `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons/hero/hero_${pad}_new.img`,
    `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.292.0/v0001/extends/icons/hero/hero_${pad}.img`
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const { png } = convertImgBuffer(Buffer.from(await res.arrayBuffer()));
        await writeFile(targetPng, png);
        console.log(`Extracted & converted hero ${id} avatar from CDN .img -> ${id}.png`);
        break;
      }
    } catch {
      // try next candidate
    }
  }
}

const metadata = {};
for (const [id, h] of playableHeroes) {
  const factionId = h.special?.[0];
  let avatarFile = null;
  if (existsSync(join(assetsDir, `${id}.webp`))) {
    avatarFile = `assets/heroes/${id}.webp`;
  } else if (existsSync(join(assetsDir, `${id}.png`))) {
    avatarFile = `assets/heroes/${id}.png`;
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
