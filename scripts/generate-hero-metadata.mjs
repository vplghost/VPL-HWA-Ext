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

const HERO_SKILLS = {
  1: ['Crystal of Selias', 'Crystalline Cataclysm', 'Piercing Light', 'Rainbow Halo'],
  2: ['Iron Sky', 'Unstoppable Charge', 'Retaliation', "Harun's Pride"],
  3: ['Blade Whirlwind', 'Enraging Soul', 'Piercing Pain', 'Wrath of the Dead'],
  4: ['Flame Veil', 'Devastation', "Demon's Allegiance", 'Last Word'],
  5: ['Fetters of the Wind', "Dragon's Breath", 'Explosive Sphere', 'Alien Life'],
  6: ['Paralysis', "Mage's Curse", 'Dark Deal', 'Dread'],
  7: ['Solar Sanctuary', 'Healing Beam', 'Vow of Silence', 'Second Wind'],
  8: ['Big Powder Keg', 'Fire Arrow', 'Discharge', 'Wild Fire'],
  9: ['Death Flower', 'Spy Drone', 'Toxic Smoke', 'Camouflage'],
  10: ['Doppelganger', 'Power Throw', 'Spell Puppeteer', 'Underworld Power'],
  11: ['Bottomless Stomach', 'Gluttony', 'Heavy Fat', 'Wild Hunger'],
  12: ['Hyper Jump', 'Demolition Robot', 'Toxic Spray', 'Plasma Explosion'],
  13: ['Total Extermination', 'Magic Missiles', 'Magnetic Field', 'Full Charge'],
  14: ['Big Gun', 'Concussion', 'Smokescreen', 'Armor-Piercing Bullet'],
  15: ['Lead Storm', 'Fragmentation Grenade', 'Fire Support', 'High-Caliber Burst'],
  16: ['Instruments of Fate', 'Foresight', 'Shackles of Weakness', 'Dimensional Shift'],
  17: ['Totem of Wrath', 'Healing Spirits', 'Cursed Arrows', 'Hex'],
  18: ['Ion Cyclone', 'Force Field', 'Interference', 'Compact Generator'],
  19: ['Black Arrow', 'Shadow Fall', 'Dark Reflection', 'Night Vengeance'],
  20: ['Deadly Shower', 'True Shot', 'Smart Arrow', 'Beast Slayer'],
  21: ['Righteous Wrath', 'Holy Shield', 'Compassion', 'Ascended'],
  22: ['Masquerade', 'Boldness', 'Frolic', 'Trick'],
  23: ['Armament of Beauty', 'Wandering Lights', 'Conciliation', 'Hypnotic Ball'],
  24: ['Rusty Hook', 'Putrefaction', 'Heavyweight', 'Kitchen Scraps'],
  25: ['Mirage', 'Phantom Strike', 'Storm Blades', 'Awakening'],
  26: ['Ritual of Flames', 'Gehenna', 'Infernal Pact', 'Possession'],
  27: ['Underpants', 'Gehenna', 'Infiltration', 'Faith'],
  28: ["Dragon's Claw", 'Spear of Dawn', 'Open Heart', "Dragon's Blood"],
  29: ['Fountain of Blood', "Ancestors' Amulet", 'Wings of Night', 'Blood Covenant'],
  30: ['Heavy Wisdom', 'Ruined Memory', 'Lost Youth', 'Memory Loss'],
  31: ['Kinetic Potion', 'Fatigue Acid', 'Inebriating Potion', 'Exhausting Potion'],
  32: ['Solar Wind', 'Retribution', 'Celestial Guardians', 'Flaming Retribution'],
  33: ['Lord of the Storm', 'Chain Lightning', 'Conductance', 'Wind Whisper'],
  34: ['Frozen Needle', 'Chains of Frost', 'Cold Touch', 'Crystallization'],
  35: ['Torment of Power', 'Icy Grasp', 'Leper', 'Tainted Shield'],
  36: ['Queen of Flowers', 'Poisonous Pollen', "Queen's Revenge", 'Toxic Affection'],
  37: ['You Will Not Stop Me', 'I See You', 'Beam of Pain', 'Survival Instinct'],
  38: ['Shifting Sands', 'Mirage', 'Dervish', 'Many As One'],
  39: ['Shelter of Sands', 'Focused Fury', 'Shadow of Fury', 'Desert Reflection'],
  40: ['Astraea', 'Serenity', 'Disharmony', 'Equilibrium'],
  41: ['Nexus of Horror', 'Negator of Dimensions', 'Deadly Tendrils', 'Survival Instinct'],
  42: ["Rakashi's Barrier", "Rakashi's Blessing", "Rakashi's Mockery", "Rakashi's Oath"],
  43: ['Two Faces', 'White / Dark Night', 'Limbo', 'Zenith'],
  44: ['Best Friends', "Predator's Charge", "Tracker's Instinct", 'Bond of Hearts'],
  45: ['Ravenous Pack', 'Spirit Banishment', 'Wisdom of Ancients', 'Imminent End'],
  46: ["Forefather's Oath", 'Secret of Long Life', 'Tea Party', 'Speed of Ancestors'],
  47: ["Terravok's Wrath", 'Earth Stone', "Nature's Barrier", 'Living Earth'],
  49: ['Dance of Death', "Assassin's Instinct", 'Embraced by Pain', 'Unknown Toxins'],
  50: ['Tessellation', 'High-Voltage Module', 'MP-300 Capacitors', 'Overcharge'],
  51: ['Soul Radiance', 'Void Glares', 'Black Sun', 'Abyss Energy'],
  52: ['Desirable Burden', 'Mirage of Truth', 'Illusory Alliance', 'Patient Malice'],
  53: ['Runic Shield', "Blacksmith's Mastery", "Dragon's Breath", 'Hardened Scales'],
  54: ['Bite of the Soul', 'Exposed Soul', 'Demonic Pact', 'Otherworldly Bloom'],
  55: ['Spore Cloud', 'Mycological Symbiosis', 'Fungal Bloom', 'Endless Grove'],
  56: ['Nine Lives', 'Copycat', 'Defensive Protocol', 'Energy Core'],
  57: ['Phoenix Flight', 'Flame Whirlwind', 'Burning Blood', 'Fiery Heart'],
  58: ['Flame Transfer', 'Phoenix Embrace', 'Ignited Souls', 'Bonds of Fire'],
  59: ['Breath of Depths', 'Torrent of Water', 'Abyssal Surge', 'Tidal Dominance'],
  60: ['Labyrinth of Mirrors', 'Radiant Prism', 'Mirage Dance', 'Mirror Shards'],
  61: ['Wild Hunt', 'Huntress Trap', 'Primeval Fury', 'Pack Leader'],
  62: ['Solar Flare', 'Sun Ray', 'Dawn Blessing', 'Daylight'],
  63: ['Dual Pistols', 'Ancient Relic', 'Acrobatics', 'Tomb Raider'],
  64: ['Magic Tome', 'Spell Scribe', 'Arcane Glyph', 'Ancient Runes'],
  65: ['Time Dilation', 'Temporal Rift', 'Time Stop', 'Chrono Shift'],
  66: ['Turtle Power', 'Shell Shock', 'Pizza Time', 'Sewer Strike'],
  67: ['North Star', 'Aurora Borealis', 'Polar Wind', 'Frost Nova'],
  68: ['Sweet Melody', 'Fruit Punch', 'Sugar Rush', 'Sweetness'],
  69: ['Golden Goose', 'Egg Drop', 'Honk of War', 'Feathers'],
  70: ['Dream Weaver', 'Nightmare', 'Sleepwalker', 'Lullaby'],
  71: ['Lightning Strike', 'Electric Arc', 'Thunder Shield', 'Overload'],
  72: ['Bear Hug', 'Forest Roar', 'Primal Might', 'Hibernation'],
  73: ['Blood Drain', 'Dark Mist', 'Crimson Surge', 'Vampiric Aura'],
  74: ['Cat Scratch', 'Agile Leap', 'Feline Grace', 'Nine Lives'],
  75: ['Flame Candle', 'Melt', 'Hot Wax', 'Incinerate'],
  76: ['Raven Call', 'Feather Storm', 'Shadow Wings', 'Dark Omen'],
  77: ['Mother Nature', 'Seed of Life', 'Healing Rain', 'Bloom'],
  78: ['Forest Sentinel', 'Root Grasp', 'Ancient Bark', 'Woodland Whisper'],
  79: ['Lion Heart', 'Regal Roar', 'Golden Mane', 'Pride Leader'],
  500: ['Ode to Murder', 'Danse Macabre', 'Ballad of Clean Hands', 'Rhythm of War'],
  501: ['Strike of the Damned', 'Morass of Souls', 'Altar of Souls', 'Royal Defense'],
  502: ['Army of Graven', 'Bone Armor', 'Moonlight', 'Necromancy'],
  503: ['Duality of Nature', 'Rune of Earth', 'Rune of Water', 'Harmony of Forest'],
  504: ['Blessed Vanguard', 'Righteous Zeal', 'Purifying Flames', "Inquisitor's Resolve"]
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

  const skills = HERO_SKILLS[id] || null;
  metadata[id] = {
    name: heroNames[id] || `Hero #${id}`,
    role: roleNames[h.role] || 'Unknown',
    class: heroClasses[id] || 'Unknown',
    faction: factionNames[factionId] || 'Unknown',
    hasAvatar: !!avatarFile,
    ...(avatarFile ? { avatarFile } : {}),
    ...(skills ? { skills } : {})
  };
}

const outputJs = `// Generated hero metadata\n` +
  `globalThis.hwaHelperHeroMetadata = ${JSON.stringify(metadata, null, 2)};\n`;

await writeFile(join(root, 'extension/hero-metadata.js'), outputJs, 'utf8');
console.log(`Wrote hero metadata to extension/hero-metadata.js (${Object.keys(metadata).length} heroes).`);
