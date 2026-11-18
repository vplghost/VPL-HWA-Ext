import type { TowerBuffMeta, TowerRulesData } from '@/src/types/game/tower';

export const towerBuffs: Record<string, TowerBuffMeta> = {
  "1": { name: "Exploding Morningstar", description: "Deals damage to enemies each time an enemy dies" },
  "2": { name: "Razor Flurry", description: "Turns every 5th attack into a Critical Hit" },
  "3": { name: "Hypno-Staff", description: "Stuns enemies at the start of the battle" },
  "4": { name: "Deafening Resonance", description: "Increases damage to stunned enemies" },
  "5": { name: "Shockstrike", description: "Applies stun after every 4 attacks" },
  "6": { name: "Euphoria Crystal", description: "Grants Energy at the start of the battle" },
  "7": { name: "Heart-Seeking Dagger", description: "Increases damage from Critical Hits" },
  "8": { name: "Berserker Ring", description: "Temporarily increases Physical Attack at the start of the battle" },
  "9": { name: "Sage Ring", description: "Temporarily increases Magic Attack at the start of the battle" },
  "10": { name: "Everwood Buckler", description: "Blocks the first 5 hits" },
  "11": { name: "Vampiric Charm", description: "Grants additional Vampirism" },
  "12": { name: "Spelldance Boots", description: "Increases Dodge based on Magic Defense" },
  "13": { name: "Executioner's Fervor", description: "Increases Critical Hit Chance based on Physical Attack" },
  "14": { name: "Bladehoner", description: "Increases Armor Penetration over time" },
  "15": { name: "Arcane Drain", description: "Lowers enemies' Magic Defense over time" },
  "16": { name: "Soulreaver", description: "Grants temporary Vampirism after using the first skill" },
  "17": { name: "Siphoning Gauntlet", description: "Restores Health when applying Control Effects" },
  "18": { name: "Hushing Scepter", description: "Silences enemies periodically" },
  "25": { name: "Bottle of Vitality", description: "Grants Energy to the leftmost Hero at the start of the battle" },
  "26": { name: "Evil Eye", description: "Increases Physical damage" },
  "27": { name: "Arcane Pendant", description: "Increases Magic damage" },
  "28": { name: "Piranha Knives Kit", description: "Turns the first 2 attacks into Critical Hits" },
  "29": { name: "Deathsong", description: "Makes all attacks of the rightmost Hero Critical Hits" },
  "30": { name: "Aggravating Duo", description: "Increases Hero's Physical damage with each attack on enemies" },
  "31": { name: "The First Light", description: "Blinds enemies affected by stun" },
  "32": { name: "Voidsong", description: "Silences enemies that received a Critical Hit" },
  "33": { name: "Sorcerer's Wrath", description: "Increases Magic damage with each skill used" },
  "34": { name: "Packleader's Helm", description: "Increases Health" },
  "35": { name: "Bulwark of Vitality", description: "Doubles Health of the rightmost Hero" },
  "36": { name: "Horns of Persistence", description: "Blocks the next 3 enemy attacks after using the first skill" },
  "37": { name: "Restoration Circlet", description: "Periodically heals the Hero with the lowest Health" },
  "38": { name: "Pain-charged Shoulderplate", description: "Grants extra Energy upon receiving damage" },
  "39": { name: "Thunderbringer", description: "Grants extra Energy with attacks on enemies" },
  "40": { name: "Necklace of Revenge", description: "Increases Damage based on lost Health" },
  "41": { name: "Hermit's Ring", description: "Solo Faction Heroes have higher Physical and Magic attack" },
  "42": { name: "Reflector", description: "A part of Shielded or Blocked damage is reflected back to enemies" },
  "43": { name: "Defender's Glove", description: "Heroes affected by an allied Buff can Block 1 hit" },
  "44": { name: "Arrows of Doom", description: "Enemies can't Dodge" },
  "45": { name: "Magic Tamer", description: "A part of Heroes' Magic damage is redirected to the furthest enemy" },
  "46": { name: "Wand of Despair", description: "Burns a part of enemy team Energy on killing any Hero" }
};

export const towerRules: TowerRulesData = {
  floorCount: 23,
  finalFloor: 23,
  finalTemplateId: 12,
  source: {
    staticVersion: "1.293.0",
    url: "https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.293.0/v0049/d973530195826f1575a002f97a3f30e9/lib/splitlib.json.zip",
    md5: "46e298e9f4305c4264057cbeb7fbf6bd",
    size: 5572457,
    files: {
      "magicTower.pb": {
        size: 649,
        sha256: "7f5b500ca3a383b75bd6e0034eba1d2c24a465849a40fcd7007d591886362ba0"
      },
      "magicTowerFloorTemplate.pb": {
        size: 2268,
        sha256: "a448286933d49b708db60e04a3abf2dbec2766c90133df7aa8bb5c42874e5b21"
      }
    }
  }
};

export function getTowerBuff(id: number | string): TowerBuffMeta | undefined {
  const strId = String(id);
  return towerBuffs[strId];
}
