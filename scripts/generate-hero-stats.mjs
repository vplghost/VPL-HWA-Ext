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
  1: 'MAIN', 2: 'HP', 3: 'MAIN', 4: 'Arm', 5: 'PA', 6: 'MD', 7: 'HP',
  8: 'Crit', 9: 'AP', 10: 'MA', 11: 'MP', 12: 'Dodge', 13: 'MCrit', 14: 'MAIN', 15: 'Crit'
};

const skinStatIdToAbbr = {
  1: 'HP', 2: 'MA', 3: 'MP', 4: 'MAIN', 5: 'PA', 6: 'MD', 7: 'MD',
  8: 'Dodge', 9: 'Arm', 10: 'MA', 11: 'MP', 12: 'AP', 13: 'MCrit', 14: 'MAIN', 15: 'Crit'
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
        let stat = runeStatIdToAbbr[rId] || 'HP';
        if (stat === 'MAIN' || rId === 1 || rId === 3 || rId === 14) stat = mainStatAbbr;
        return stat;
      });
    }
    p = n + len;
  } else break;
}

const skinStats = {};
for (let i = 0; i < skinBuf.length - 15; i++) {
  if (skinBuf[i] === 0x08) {
    const [skinId, n] = readVarint(skinBuf, i + 1);
    if (skinId > 0 && skinId < 2000 && skinBuf[n] === 0x12) {
      for (let j = n + 1; j < Math.min(skinBuf.length - 3, n + 40); j++) {
        if (skinBuf[j] === 0x1a && skinBuf[j + 2] === 0x08) {
          const statId = skinBuf[j + 3];
          if (statId > 0 && statId < 25) {
            skinStats[skinId] = skinStatIdToAbbr[statId] || 'PA';
            break;
          }
        }
      }
    }
  }
}

const content = `// Generated hero glyph & skin stat mapping
(() => {
  globalThis.hwaHelperHeroGlyphs = ${JSON.stringify(heroGlyphs)};
  globalThis.hwaHelperSkinStats = ${JSON.stringify(skinStats)};
})();
`;

fs.writeFileSync('extension/hero-stat-data.js', content, 'utf8');
console.log('Wrote extension/hero-stat-data.js successfully! Length:', content.length);
