import fs from 'node:fs';

const skinBuf = fs.readFileSync('temp/splitlib/skin.pb').slice(74631);
const runeBuf = fs.readFileSync('temp/splitlib/hero_runes.pb');
const heroes = JSON.parse(fs.readFileSync('temp/splitlib/hero.json', 'utf8'));

function readVarint(buf, offset) {
  let res = 0, shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    res += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
    if (!(b & 0x80)) break;
  }
  return [res, offset];
}

const runeStatIdToAbbr = {
  1: 'Str',
  2: 'Int',
  3: 'Agi',
  4: 'HP',
  5: 'PA',
  6: 'MA',
  7: 'Arm',
  8: 'MD',
  9: 'Crit',
  10: 'Ddg',
  11: 'MP',
  12: 'AP',
  13: 'MCrit',
  14: 'Tough',
  15: 'Crush'
};

const skinStatIdToAbbr = {
  1: 'HP', 2: 'MA', 3: 'MP', 4: 'MAIN', 5: 'PA', 6: 'MD', 7: 'MD',
  8: 'Ddg', 9: 'Arm', 10: 'MA', 11: 'MP', 12: 'AP', 13: 'MCrit', 14: 'MAIN', 15: 'Crit'
};

let p = 0;
const heroGlyphs = {};
while (p < runeBuf.length) {
  const tagByte = runeBuf[p++];
  if ((tagByte >> 3) === 1) {
    const [len, n] = readVarint(runeBuf, p);
    const sub = runeBuf.slice(n, n + len);
    let heroId = 0, runes = [];
    let sp = 0;
    while (sp < sub.length) {
      const stag = sub[sp++];
      if ((stag >> 3) === 1) {
        const [v, sn] = readVarint(sub, sp);
        heroId = v; sp = sn;
      } else if ((stag >> 3) === 2) {
        const [rlen, sn] = readVarint(sub, sp);
        runes = Array.from(sub.slice(sn, sn + rlen));
        sp = sn + rlen;
      } else break;
    }
    if (heroId) {
      const h = heroes[heroId] || Object.values(heroes).find(x => x.id === heroId);
      const mainStatAbbr = h?.mainStat === 'agility' ? 'Agi' : (h?.mainStat === 'intelligence' ? 'Int' : 'Str');
      heroGlyphs[heroId] = runes.map(rId => {
        let stat = runeStatIdToAbbr[rId];
        if (!stat) stat = (rId === 1 || rId === 2 || rId === 3) ? mainStatAbbr : 'HP';
        return stat;
      });
    }
    p = n + len;
  } else break;
}

import { skinStats } from '../src/data/heroMetadata.ts';

const content = `// Generated hero glyph & skin stat mapping
(() => {
  globalThis.hwaHelperHeroGlyphs = ${JSON.stringify(heroGlyphs)};
  globalThis.hwaHelperSkinStats = ${JSON.stringify(skinStats)};
})();
`;

fs.writeFileSync('extension/hero-stat-data.js', content, 'utf8');
console.log('Wrote extension/hero-stat-data.js successfully! Length:', content.length);
