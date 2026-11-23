import fs from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// 1. Read heroMetadata.ts
let heroTs = fs.readFileSync(join(root, 'src/data/heroMetadata.ts'), 'utf8');

// Parse current skinStats
const m = heroTs.match(/export const skinStats: SkinStatsDict = (\{[\s\S]*?\});/);
if (!m) throw new Error('Could not find skinStats in heroMetadata.ts');

const skinStats = JSON.parse(m[1]);

// 2. Correct Hero Default Skins:
// Iris (54): default skin is 242 -> Int
skinStats['242'] = 'Int';
// Xe'sha (51): default skin is 1010 -> Int
skinStats['1010'] = 'Int';
// Corvus (501): default skin is 1002 -> Str
skinStats['1002'] = 'Str';

// 3. Correct Hero Purchased Skins that are Health (HP) instead of Armor (Arm):
const heroHealthSkins = [
  82,   // Ziri Cybernetic
  93,   // Cleaver Barbarian
  95,   // Aurora Spring
  112,  // Ziri Champion
  121,  // Rufus Angel
  146,  // Ishmael Masquerade
  159,  // Lilith Winter
  169,  // Chabba Masquerade
  173,  // Luther Cybernetic
  180,  // Rufus Winter
  224,  // Martha Masquerade
  229,  // Elmir Cybernetic
  241,  // Astaroth Cybernetic
  253,  // Alvanor Winter
  291,  // Julius Demonic
  293   // Amira Demonic
];
for (const sid of heroHealthSkins) {
  skinStats[String(sid)] = 'HP';
}

// 4. Correct Titan Skins:
// Tanks:
// Sigurd (4000), Moloch (4010), Angus (4020), Brustar (4030), Rigel (4040), Pallant (4050)
const titanTanks = {
  4000: { default: 10001, primordial: 10013, biomech: 10051 },
  4010: { default: 10005, primordial: 10014, biomech: 10049 },
  4020: { default: 10009, primordial: 10015, biomech: 10046 },
  4030: { default: 10030, primordial: 10034, biomech: 10054 },
  4040: { default: 10031, primordial: 10037, biomech: 10055 },
  4050: { default: 10062, primordial: 10063 }
};

for (const [tid, s] of Object.entries(titanTanks)) {
  if (s.default) skinStats[String(s.default)] = 'HP';
  if (s.primordial) skinStats[String(s.primordial)] = 'PA';
  if (s.biomech) skinStats[String(s.biomech)] = 'HP';
}

// Non-Tank Titans: Default is PA, Primordial is HP, Biomech is PA
const titanNonTanks = {
  4001: { default: 10002, primordial: 10022, biomech: 10052 }, // Nova
  4002: { default: 10003, primordial: 10019, biomech: 10057 }, // Mairi
  4003: { default: 10004, primordial: 10027 },                 // Hyperion
  4004: { default: 10044, primordial: 10087 },                 // Tydus
  4011: { default: 10006, primordial: 10023, biomech: 10050 }, // Vulcan
  4012: { default: 10007, primordial: 10020, biomech: 10058 }, // Ignis
  4013: { default: 10008, primordial: 10028 },                 // Araji
  4014: { default: 10043, primordial: 10088 },                 // Asherona
  4021: { default: 10010, primordial: 10024, biomech: 10045 }, // Sylva
  4022: { default: 10011, primordial: 10021, biomech: 10056 }, // Avalon
  4023: { default: 10012, primordial: 10029 },                 // Eden
  4024: { default: 10040, primordial: 10089 },                 // Verdoc
  4031: { default: 10016, primordial: 10035, biomech: 10095 }, // Keros
  4032: { default: 10025, primordial: 10036, biomech: 10066 }, // Mort
  4033: { default: 10032, primordial: 10042 },                 // Tenebris
  4034: { default: 10048 },                                     // Umbra
  4041: { default: 10017, primordial: 10038, biomech: 10096 }, // Amon
  4042: { default: 10018, primordial: 10039, biomech: 10067 }, // Iyari
  4043: { default: 10026, primordial: 10041 },                 // Solaris
  4044: { default: 10047 },                                     // Lumira
  4051: { default: 10053, primordial: 10059 },                 // Alecto
  4052: { default: 10060, primordial: 10061 },                 // Orm
  4053: { default: 10064, primordial: 10065 },                 // Metida
  4054: { default: 10068, primordial: 10077 }                  // Valdur
};

for (const [tid, s] of Object.entries(titanNonTanks)) {
  if (s.default) skinStats[String(s.default)] = 'PA';
  if (s.primordial) skinStats[String(s.primordial)] = 'HP';
  if (s.biomech) skinStats[String(s.biomech)] = 'PA';
}

// 5. Replace in heroMetadata.ts
const newSkinStatsStr = JSON.stringify(skinStats);
heroTs = heroTs.replace(m[0], `export const skinStats: SkinStatsDict = ${newSkinStatsStr};`);

fs.writeFileSync(join(root, 'src/data/heroMetadata.ts'), heroTs, 'utf8');
console.log('Successfully updated skinStats in src/data/heroMetadata.ts!');
