import { getItemName } from '../data/nameData.ts';
import { getItemIcon } from './itemResources.ts';

export interface ChestRewardPreview {
  type: string;
  id: string | number;
  name: string;
  amount: number;
  icon?: string | null;
}

export interface ChestChoiceOption {
  choiceIndex: number;
  label: string;
  reward: ChestRewardPreview;
}

// Known Choice Chests configurations
export const CHOICE_CHEST_DEFINITIONS: Record<number | string, ChestChoiceOption[]> = {
  // 47: Chest of Defender Titans
  '47': [
    {
      choiceIndex: 0,
      label: 'Sigurd fragment',
      reward: { type: 'fragmentTitan', id: 4000, name: 'Sigurd fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Moloch fragment',
      reward: { type: 'fragmentTitan', id: 4010, name: 'Moloch fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Angus fragment',
      reward: { type: 'fragmentTitan', id: 4020, name: 'Angus fragment', amount: 5 }
    },
  ],

  // 48: Chest of Marksman Titans
  '48': [
    {
      choiceIndex: 0,
      label: 'Nova fragment',
      reward: { type: 'fragmentTitan', id: 4001, name: 'Nova fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Vulcan fragment',
      reward: { type: 'fragmentTitan', id: 4011, name: 'Vulcan fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Sylva fragment',
      reward: { type: 'fragmentTitan', id: 4021, name: 'Sylva fragment', amount: 5 }
    },
  ],

  // 49: Chest of Support Titans
  '49': [
    {
      choiceIndex: 0,
      label: 'Mairi fragment',
      reward: { type: 'fragmentTitan', id: 4002, name: 'Mairi fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Ignis fragment',
      reward: { type: 'fragmentTitan', id: 4012, name: 'Ignis fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Avalon fragment',
      reward: { type: 'fragmentTitan', id: 4022, name: 'Avalon fragment', amount: 5 }
    },
  ],

  // 50: Chest of Supertitans
  '50': [
    {
      choiceIndex: 0,
      label: 'Hyperion fragment',
      reward: { type: 'fragmentTitan', id: 4003, name: 'Hyperion fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Araji fragment',
      reward: { type: 'fragmentTitan', id: 4013, name: 'Araji fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Eden fragment',
      reward: { type: 'fragmentTitan', id: 4023, name: 'Eden fragment', amount: 5 }
    },
  ],

  // 51: Skin Stone Chest
  '51': [
    {
      choiceIndex: 0,
      label: 'Intelligence Skin Stone',
      reward: { type: 'coin', id: 8, name: 'Intelligence Skin Stone', amount: 150 }
    },
    {
      choiceIndex: 1,
      label: 'Strength Skin Stone',
      reward: { type: 'coin', id: 9, name: 'Strength Skin Stone', amount: 150 }
    },
    {
      choiceIndex: 2,
      label: 'Agility Skin Stone',
      reward: { type: 'coin', id: 10, name: 'Agility Skin Stone', amount: 150 }
    },
  ],

  // 57: Spring Casket
  '57': [
    {
      choiceIndex: 0,
      label: 'Lian fragment',
      reward: { type: 'fragmentHero', id: 23, name: 'Lian fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Maya fragment',
      reward: { type: 'fragmentHero', id: 36, name: 'Maya fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Nebula fragment',
      reward: { type: 'fragmentHero', id: 40, name: 'Nebula fragment', amount: 5 }
    },
  ],

  // 62: Artifact Essence Chest
  '62': [
    {
      choiceIndex: 0,
      label: 'Artifact Essence (White)',
      reward: { type: 'consumable', id: 29, name: 'Artifact Essence', amount: 12 }
    },
    {
      choiceIndex: 1,
      label: 'Uncommon Artifact Essence (Green)',
      reward: { type: 'consumable', id: 30, name: 'Uncommon Artifact Essence', amount: 7 }
    },
    {
      choiceIndex: 2,
      label: 'Rare Artifact Essence (Blue)',
      reward: { type: 'consumable', id: 31, name: 'Rare Artifact Essence', amount: 4 }
    },
    {
      choiceIndex: 3,
      label: 'Superior Artifact Essence (Purple)',
      reward: { type: 'consumable', id: 32, name: 'Superior Artifact Essence', amount: 2 }
    },
    {
      choiceIndex: 4,
      label: 'Flawless Artifact Essence (Orange)',
      reward: { type: 'consumable', id: 33, name: 'Flawless Artifact Essence', amount: 1 }
    },
  ],

  // 63: Artifact Scroll Chest
  '63': [
    {
      choiceIndex: 0,
      label: 'Artifact Scroll (White)',
      reward: { type: 'consumable', id: 34, name: 'Artifact Scroll', amount: 12 }
    },
    {
      choiceIndex: 1,
      label: 'Uncommon Artifact Scroll (Green)',
      reward: { type: 'consumable', id: 35, name: 'Uncommon Artifact Scroll', amount: 7 }
    },
    {
      choiceIndex: 2,
      label: 'Rare Artifact Scroll (Blue)',
      reward: { type: 'consumable', id: 36, name: 'Rare Artifact Scroll', amount: 4 }
    },
    {
      choiceIndex: 3,
      label: 'Superior Artifact Scroll (Purple)',
      reward: { type: 'consumable', id: 37, name: 'Superior Artifact Scroll', amount: 2 }
    },
    {
      choiceIndex: 4,
      label: 'Flawless Artifact Scroll (Orange)',
      reward: { type: 'consumable', id: 38, name: 'Flawless Artifact Scroll', amount: 1 }
    },
  ],

  // 64: Artifact Metal Chest
  '64': [
    {
      choiceIndex: 0,
      label: 'Artifact Metal (White)',
      reward: { type: 'consumable', id: 39, name: 'Artifact Metal', amount: 12 }
    },
    {
      choiceIndex: 1,
      label: 'Uncommon Artifact Metal (Green)',
      reward: { type: 'consumable', id: 40, name: 'Uncommon Artifact Metal', amount: 7 }
    },
    {
      choiceIndex: 2,
      label: 'Rare Artifact Metal (Blue)',
      reward: { type: 'consumable', id: 41, name: 'Rare Artifact Metal', amount: 4 }
    },
    {
      choiceIndex: 3,
      label: 'Superior Artifact Metal (Purple)',
      reward: { type: 'consumable', id: 42, name: 'Superior Artifact Metal', amount: 2 }
    },
    {
      choiceIndex: 4,
      label: 'Flawless Artifact Metal (Orange)',
      reward: { type: 'consumable', id: 43, name: 'Flawless Artifact Metal', amount: 1 }
    },
  ],

  // 65: Large Skin Stone Chest
  '65': [
    {
      choiceIndex: 0,
      label: 'Intelligence Skin Stone',
      reward: { type: 'coin', id: 8, name: 'Intelligence Skin Stone', amount: 150 }
    },
    {
      choiceIndex: 1,
      label: 'Strength Skin Stone',
      reward: { type: 'coin', id: 9, name: 'Strength Skin Stone', amount: 150 }
    },
    {
      choiceIndex: 2,
      label: 'Agility Skin Stone',
      reward: { type: 'coin', id: 10, name: 'Agility Skin Stone', amount: 150 }
    },
  ],

  // 273: Water Titan Artifact Chest
  '273': [
    {
      choiceIndex: 0,
      label: 'Siungur\'s Aegis fragment',
      reward: { type: 'fragmentArtifact', id: 11001, name: 'Siungur\'s Aegis fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Siungur\'s Maelstrom fragment',
      reward: { type: 'fragmentArtifact', id: 11002, name: 'Siungur\'s Maelstrom fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Siungur\'s Bands fragment',
      reward: { type: 'fragmentArtifact', id: 11003, name: 'Siungur\'s Bands fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Siungur\'s Staff fragment',
      reward: { type: 'fragmentArtifact', id: 11004, name: 'Siungur\'s Staff fragment', amount: 25 }
    },
    {
      choiceIndex: 4,
      label: 'Water Crown fragment',
      reward: { type: 'fragmentArtifact', id: 12003, name: 'Water Crown fragment', amount: 25 }
    },
  ],

  // 274: Fire Titan Artifact Chest
  '274': [
    {
      choiceIndex: 0,
      label: 'Ragni\'s Hammer fragment',
      reward: { type: 'fragmentArtifact', id: 11005, name: 'Ragni\'s Hammer fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Ragni\'s Horn fragment',
      reward: { type: 'fragmentArtifact', id: 11006, name: 'Ragni\'s Horn fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Ragni\'s Spark fragment',
      reward: { type: 'fragmentArtifact', id: 11007, name: 'Ragni\'s Spark fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Ragni\'s Beast fragment',
      reward: { type: 'fragmentArtifact', id: 11008, name: 'Ragni\'s Beast fragment', amount: 25 }
    },
    {
      choiceIndex: 4,
      label: 'Fire Crown fragment',
      reward: { type: 'fragmentArtifact', id: 12001, name: 'Fire Crown fragment', amount: 25 }
    },
  ],

  // 275: Earth Titan Artifact Chest
  '275': [
    {
      choiceIndex: 0,
      label: 'Andvari\'s Fists fragment',
      reward: { type: 'fragmentArtifact', id: 11009, name: 'Andvari\'s Fists fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Andvari\'s Arrowslinger fragment',
      reward: { type: 'fragmentArtifact', id: 11010, name: 'Andvari\'s Arrowslinger fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Andvari\'s Bulwark fragment',
      reward: { type: 'fragmentArtifact', id: 11011, name: 'Andvari\'s Bulwark fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Andvari\'s Soul fragment',
      reward: { type: 'fragmentArtifact', id: 11012, name: 'Andvari\'s Soul fragment', amount: 25 }
    },
    {
      choiceIndex: 4,
      label: 'Earth Crown fragment',
      reward: { type: 'fragmentArtifact', id: 12002, name: 'Earth Crown fragment', amount: 25 }
    },
  ],

  // 276: Chest of Seals
  '276': [
    {
      choiceIndex: 0,
      label: 'Attack Seal fragment',
      reward: { type: 'fragmentArtifact', id: 13001, name: 'Attack Seal fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Balance Seal fragment',
      reward: { type: 'fragmentArtifact', id: 13002, name: 'Balance Seal fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Defense Seal fragment',
      reward: { type: 'fragmentArtifact', id: 13003, name: 'Defense Seal fragment', amount: 25 }
    },
  ],

  // 318: Matter Transfigurator
  '318': [
    {
      choiceIndex: 0,
      label: 'Evil Genius Cuirass',
      reward: { type: 'gear', id: 211, name: 'Evil Genius Cuirass', amount: 1 }
    },
    {
      choiceIndex: 1,
      label: 'Key to All Doors',
      reward: { type: 'gear', id: 212, name: 'Key to All Doors', amount: 1 }
    },
    {
      choiceIndex: 2,
      label: 'Song of the Valkyries',
      reward: { type: 'gear', id: 213, name: 'Song of the Valkyries', amount: 1 }
    },
  ],

  // 365: Wishtree Seed
  '365': [
    {
      choiceIndex: 0,
      label: 'Titan Potion',
      reward: { type: 'consumable', id: 20, name: 'Titan Potion', amount: 1250 }
    },
    {
      choiceIndex: 1,
      label: 'Artifact Coin',
      reward: { type: 'coin', id: 14, name: 'Artifact Coin', amount: 1000 }
    },
    {
      choiceIndex: 2,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 1 }
    },
    {
      choiceIndex: 3,
      label: 'Huge EXP potion',
      reward: { type: 'consumable', id: 12, name: 'Huge EXP potion', amount: 12 }
    },
    {
      choiceIndex: 4,
      label: 'Skin Stone Chest',
      reward: { type: 'consumable', id: 51, name: 'Skin Stone Chest', amount: 16 }
    },
  ],

  // 367: Wish Seed
  '367': [
    {
      choiceIndex: 0,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 1 }
    },
    {
      choiceIndex: 1,
      label: 'Bottled Energy',
      reward: { type: 'consumable', id: 16, name: 'Bottled Energy', amount: 1 }
    },
    {
      choiceIndex: 2,
      label: 'Orange Artifact Box',
      reward: { type: 'consumable', id: 234, name: 'Orange Artifact Box', amount: 3 }
    },
    {
      choiceIndex: 3,
      label: 'Violet Artifact Box',
      reward: { type: 'consumable', id: 233, name: 'Violet Artifact Box', amount: 5 }
    },
    {
      choiceIndex: 4,
      label: 'Blue Artifact Box',
      reward: { type: 'consumable', id: 232, name: 'Blue Artifact Box', amount: 7 }
    },
  ],

  // 387: Magic Chest
  '387': [
    {
      choiceIndex: 0,
      label: 'Titan Potion',
      reward: { type: 'consumable', id: 20, name: 'Titan Potion', amount: 2500 }
    },
    {
      choiceIndex: 1,
      label: 'Huge EXP potion',
      reward: { type: 'consumable', id: 12, name: 'Huge EXP potion', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Large Skin Stone Chest',
      reward: { type: 'consumable', id: 65, name: 'Large Skin Stone Chest', amount: 2 }
    },
    {
      choiceIndex: 3,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 2 }
    },
    {
      choiceIndex: 4,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1500 }
    },
  ],

  // 391: Light & Dark Titan Chest
  '391': [
    {
      choiceIndex: 0,
      label: 'Amon fragment',
      reward: { type: 'fragmentTitan', id: 4041, name: 'Amon fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Keros fragment',
      reward: { type: 'fragmentTitan', id: 4031, name: 'Keros fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Iyari fragment',
      reward: { type: 'fragmentTitan', id: 4042, name: 'Iyari fragment', amount: 5 }
    },
  ],

  // 392: Light & Dark Artifact Chest
  '392': [
    {
      choiceIndex: 0,
      label: 'The Dark Star of Nephtis fragment',
      reward: { type: 'fragmentArtifact', id: 11013, name: 'The Dark Star of Nephtis fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Crown of Darkness fragment',
      reward: { type: 'fragmentArtifact', id: 12004, name: 'Crown of Darkness fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Belav\'s Crown fragment',
      reward: { type: 'fragmentArtifact', id: 11018, name: 'Belav\'s Crown fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Belav\'s Face fragment',
      reward: { type: 'fragmentArtifact', id: 11019, name: 'Belav\'s Face fragment', amount: 25 }
    },
    {
      choiceIndex: 4,
      label: 'Crown of Light fragment',
      reward: { type: 'fragmentArtifact', id: 12005, name: 'Crown of Light fragment', amount: 25 }
    },
  ],

  // 393: Magic Chest
  '393': [
    {
      choiceIndex: 0,
      label: 'Large Skin Stone Chest',
      reward: { type: 'consumable', id: 65, name: 'Large Skin Stone Chest', amount: 2 }
    },
    {
      choiceIndex: 1,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 2 }
    },
    {
      choiceIndex: 2,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1500 }
    },
    {
      choiceIndex: 3,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 500 }
    },
    {
      choiceIndex: 4,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 1000 }
    },
  ],

  // 399: Light & Dark Titan Chest
  '399': [
    {
      choiceIndex: 0,
      label: 'Amon fragment',
      reward: { type: 'fragmentTitan', id: 4041, name: 'Amon fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Keros fragment',
      reward: { type: 'fragmentTitan', id: 4031, name: 'Keros fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Iyari fragment',
      reward: { type: 'fragmentTitan', id: 4042, name: 'Iyari fragment', amount: 5 }
    },
    {
      choiceIndex: 3,
      label: 'Mort fragment',
      reward: { type: 'fragmentTitan', id: 4032, name: 'Mort fragment', amount: 5 }
    },
  ],

  // 400: Light & Dark Artifact Chest
  '400': [
    {
      choiceIndex: 0,
      label: 'The Dark Star of Nephtis fragment',
      reward: { type: 'fragmentArtifact', id: 11013, name: 'The Dark Star of Nephtis fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Nephtis\'s Vambraces fragment',
      reward: { type: 'fragmentArtifact', id: 11015, name: 'Nephtis\'s Vambraces fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Crown of Darkness fragment',
      reward: { type: 'fragmentArtifact', id: 12004, name: 'Crown of Darkness fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Belav\'s Crown fragment',
      reward: { type: 'fragmentArtifact', id: 11018, name: 'Belav\'s Crown fragment', amount: 25 }
    },
    {
      choiceIndex: 4,
      label: 'Belav\'s Face fragment',
      reward: { type: 'fragmentArtifact', id: 11019, name: 'Belav\'s Face fragment', amount: 25 }
    },
    {
      choiceIndex: 5,
      label: 'Crown of Light fragment',
      reward: { type: 'fragmentArtifact', id: 12005, name: 'Crown of Light fragment', amount: 25 }
    },
  ],

  // 407: Light & Dark Titan Chest
  '407': [
    {
      choiceIndex: 0,
      label: 'Amon fragment',
      reward: { type: 'fragmentTitan', id: 4041, name: 'Amon fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Keros fragment',
      reward: { type: 'fragmentTitan', id: 4031, name: 'Keros fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Iyari fragment',
      reward: { type: 'fragmentTitan', id: 4042, name: 'Iyari fragment', amount: 5 }
    },
    {
      choiceIndex: 3,
      label: 'Mort fragment',
      reward: { type: 'fragmentTitan', id: 4032, name: 'Mort fragment', amount: 5 }
    },
    {
      choiceIndex: 4,
      label: 'Brustar fragment',
      reward: { type: 'fragmentTitan', id: 4030, name: 'Brustar fragment', amount: 5 }
    },
  ],

  // 408: Light & Dark Artifact Chest
  '408': [
    {
      choiceIndex: 0,
      label: 'The Dark Star of Nephtis fragment',
      reward: { type: 'fragmentArtifact', id: 11013, name: 'The Dark Star of Nephtis fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Nephtis\'s Vambraces fragment',
      reward: { type: 'fragmentArtifact', id: 11015, name: 'Nephtis\'s Vambraces fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Crown of Darkness fragment',
      reward: { type: 'fragmentArtifact', id: 12004, name: 'Crown of Darkness fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Belav\'s Crown fragment',
      reward: { type: 'fragmentArtifact', id: 11018, name: 'Belav\'s Crown fragment', amount: 25 }
    },
    {
      choiceIndex: 4,
      label: 'Belav\'s Face fragment',
      reward: { type: 'fragmentArtifact', id: 11019, name: 'Belav\'s Face fragment', amount: 25 }
    },
    {
      choiceIndex: 5,
      label: 'Crown of Light fragment',
      reward: { type: 'fragmentArtifact', id: 12005, name: 'Crown of Light fragment', amount: 25 }
    },
    {
      choiceIndex: 6,
      label: 'Nephtis\'s Destroyers fragment',
      reward: { type: 'fragmentArtifact', id: 11014, name: 'Nephtis\'s Destroyers fragment', amount: 25 }
    },
  ],

  // 409: Mastery Chest
  '409': [
    {
      choiceIndex: 0,
      label: 'Mastery Crystal',
      reward: { type: 'coin', id: 40067, name: 'Mastery Crystal', amount: 500 }
    },
    {
      choiceIndex: 1,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 900 }
    },
  ],

  // 410: Meta Chest
  '410': [
    {
      choiceIndex: 0,
      label: 'Meta Cube',
      reward: { type: 'coin', id: 40065, name: 'Meta Cube', amount: 500 }
    },
    {
      choiceIndex: 1,
      label: 'Artifact Chest Key',
      reward: { type: 'consumable', id: 45, name: 'Artifact Chest Key', amount: 4 }
    },
  ],

  // 412: Light & Dark Titan Chest
  '412': [
    {
      choiceIndex: 0,
      label: 'Amon fragment',
      reward: { type: 'fragmentTitan', id: 4041, name: 'Amon fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Keros fragment',
      reward: { type: 'fragmentTitan', id: 4031, name: 'Keros fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Iyari fragment',
      reward: { type: 'fragmentTitan', id: 4042, name: 'Iyari fragment', amount: 5 }
    },
    {
      choiceIndex: 3,
      label: 'Mort fragment',
      reward: { type: 'fragmentTitan', id: 4032, name: 'Mort fragment', amount: 5 }
    },
    {
      choiceIndex: 4,
      label: 'Brustar fragment',
      reward: { type: 'fragmentTitan', id: 4030, name: 'Brustar fragment', amount: 5 }
    },
    {
      choiceIndex: 5,
      label: 'Rigel fragment',
      reward: { type: 'fragmentTitan', id: 4040, name: 'Rigel fragment', amount: 5 }
    },
  ],

  // 413: Light & Dark Artifact Chest
  '413': [
    {
      choiceIndex: 0,
      label: 'The Dark Star of Nephtis fragment',
      reward: { type: 'fragmentArtifact', id: 11013, name: 'The Dark Star of Nephtis fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Nephtis\'s Vambraces fragment',
      reward: { type: 'fragmentArtifact', id: 11015, name: 'Nephtis\'s Vambraces fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Crown of Darkness fragment',
      reward: { type: 'fragmentArtifact', id: 12004, name: 'Crown of Darkness fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Belav\'s Crown fragment',
      reward: { type: 'fragmentArtifact', id: 11018, name: 'Belav\'s Crown fragment', amount: 25 }
    },
    {
      choiceIndex: 4,
      label: 'Belav\'s Face fragment',
      reward: { type: 'fragmentArtifact', id: 11019, name: 'Belav\'s Face fragment', amount: 25 }
    },
    {
      choiceIndex: 5,
      label: 'Crown of Light fragment',
      reward: { type: 'fragmentArtifact', id: 12005, name: 'Crown of Light fragment', amount: 25 }
    },
    {
      choiceIndex: 6,
      label: 'Nephtis\'s Destroyers fragment',
      reward: { type: 'fragmentArtifact', id: 11014, name: 'Nephtis\'s Destroyers fragment', amount: 25 }
    },
    {
      choiceIndex: 7,
      label: 'Belav\'s Elytra fragment',
      reward: { type: 'fragmentArtifact', id: 11017, name: 'Belav\'s Elytra fragment', amount: 25 }
    },
  ],

  // 40009: Light & Dark Titan Chest
  '40009': [
    {
      choiceIndex: 0,
      label: 'Amon fragment',
      reward: { type: 'fragmentTitan', id: 4041, name: 'Amon fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Keros fragment',
      reward: { type: 'fragmentTitan', id: 4031, name: 'Keros fragment', amount: 5 }
    },
  ],

  // 40010: Light & Dark Artifact Chest
  '40010': [
    {
      choiceIndex: 0,
      label: 'The Dark Star of Nephtis fragment',
      reward: { type: 'fragmentArtifact', id: 11013, name: 'The Dark Star of Nephtis fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Crown of Darkness fragment',
      reward: { type: 'fragmentArtifact', id: 12004, name: 'Crown of Darkness fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Belav\'s Crown fragment',
      reward: { type: 'fragmentArtifact', id: 11018, name: 'Belav\'s Crown fragment', amount: 25 }
    },
    {
      choiceIndex: 3,
      label: 'Crown of Light fragment',
      reward: { type: 'fragmentArtifact', id: 12005, name: 'Crown of Light fragment', amount: 25 }
    },
  ],

  // 40113: Gingerbread Chest
  '40113': [
    {
      choiceIndex: 0,
      label: 'Large Skin Stone Chest',
      reward: { type: 'consumable', id: 65, name: 'Large Skin Stone Chest', amount: 2 }
    },
    {
      choiceIndex: 1,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 2 }
    },
    {
      choiceIndex: 2,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1500 }
    },
    {
      choiceIndex: 3,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 500 }
    },
    {
      choiceIndex: 4,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 1000 }
    },
  ],

  // 40150: Magic Chest
  '40150': [
    {
      choiceIndex: 0,
      label: 'Large Skin Stone Chest',
      reward: { type: 'consumable', id: 65, name: 'Large Skin Stone Chest', amount: 2 }
    },
    {
      choiceIndex: 1,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 2 }
    },
    {
      choiceIndex: 2,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1500 }
    },
    {
      choiceIndex: 3,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 500 }
    },
    {
      choiceIndex: 4,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 1000 }
    },
  ],

  // 40160: Light Titan Artifact Chest
  '40160': [
    {
      choiceIndex: 0,
      label: 'Belav\'s Elytra fragment',
      reward: { type: 'fragmentArtifact', id: 11017, name: 'Belav\'s Elytra fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'Belav\'s Crown fragment',
      reward: { type: 'fragmentArtifact', id: 11018, name: 'Belav\'s Crown fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Belav\'s Face fragment',
      reward: { type: 'fragmentArtifact', id: 11019, name: 'Belav\'s Face fragment', amount: 25 }
    },
  ],

  // 40161: Dark Titan Artifact Chest
  '40161': [
    {
      choiceIndex: 0,
      label: 'Nephtis\'s Destroyers fragment',
      reward: { type: 'fragmentArtifact', id: 11014, name: 'Nephtis\'s Destroyers fragment', amount: 25 }
    },
    {
      choiceIndex: 1,
      label: 'The Dark Star of Nephtis fragment',
      reward: { type: 'fragmentArtifact', id: 11013, name: 'The Dark Star of Nephtis fragment', amount: 25 }
    },
    {
      choiceIndex: 2,
      label: 'Nephtis\'s Vambraces fragment',
      reward: { type: 'fragmentArtifact', id: 11015, name: 'Nephtis\'s Vambraces fragment', amount: 25 }
    },
  ],

  // 40162: Gingerbread Chest
  '40162': [
    {
      choiceIndex: 0,
      label: 'Large Skin Stone Chest',
      reward: { type: 'consumable', id: 65, name: 'Large Skin Stone Chest', amount: 2 }
    },
    {
      choiceIndex: 1,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 2 }
    },
    {
      choiceIndex: 2,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1500 }
    },
    {
      choiceIndex: 3,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 500 }
    },
    {
      choiceIndex: 4,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 1000 }
    },
  ],

  // 40175: Legendary Recipe Chest
  '40175': [
    {
      choiceIndex: 0,
      label: 'Tiara of Wisdom - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 221, name: 'Tiara of Wisdom - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 1,
      label: 'Shield Breaker - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 222, name: 'Shield Breaker - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 2,
      label: 'Amulet of Hatred - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 223, name: 'Amulet of Hatred - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 3,
      label: 'Arcane Destabilizer - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 224, name: 'Arcane Destabilizer - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 4,
      label: 'Spell Fury - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 225, name: 'Spell Fury - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 5,
      label: 'Last Stand Brooch - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 226, name: 'Last Stand Brooch - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 6,
      label: 'Primordial Life - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 227, name: 'Primordial Life - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 7,
      label: 'Mask of the Slayer - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 228, name: 'Mask of the Slayer - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 8,
      label: 'Titan\'s Strength Helmet - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 229, name: 'Titan\'s Strength Helmet - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 9,
      label: 'Undying Gladiator\'s Armor - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 230, name: 'Undying Gladiator\'s Armor - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 10,
      label: 'Cuirass of Spell Protection - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 231, name: 'Cuirass of Spell Protection - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 11,
      label: 'Retribution Chestplate - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 232, name: 'Retribution Chestplate - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 12,
      label: 'Platemail of Vitality - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 233, name: 'Platemail of Vitality - Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 13,
      label: 'Recurve Bow—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 243, name: 'Recurve Bow—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 14,
      label: 'Explorer Backpack — Recipe fragment',
      reward: { type: 'fragmentScroll', id: 244, name: 'Explorer Backpack — Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 15,
      label: 'Mind Ring—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 247, name: 'Mind Ring—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 16,
      label: 'Whisper Ring—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 248, name: 'Whisper Ring—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 17,
      label: 'Might Ring—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 249, name: 'Might Ring—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 18,
      label: 'Soul Reaper —Recipe fragment',
      reward: { type: 'fragmentScroll', id: 250, name: 'Soul Reaper —Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 19,
      label: 'Viper Kiss—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 251, name: 'Viper Kiss—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 20,
      label: 'Sacred Guard—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 252, name: 'Sacred Guard—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 21,
      label: 'Stormfang—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 253, name: 'Stormfang—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 22,
      label: 'Emerald Wrath—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 254, name: 'Emerald Wrath—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 23,
      label: 'Fairy Spark—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 255, name: 'Fairy Spark—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 24,
      label: 'Runic Mantle—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 256, name: 'Runic Mantle—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 25,
      label: 'Serpent Wand—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 257, name: 'Serpent Wand—Recipe fragment', amount: 60 }
    },
    {
      choiceIndex: 26,
      label: 'Wyvern Scale—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 258, name: 'Wyvern Scale—Recipe fragment', amount: 60 }
    },
  ],

  // 40176: Large Legendary Recipe Chest
  '40176': [
    {
      choiceIndex: 0,
      label: 'Tiara of Wisdom - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 221, name: 'Tiara of Wisdom - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 1,
      label: 'Shield Breaker - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 222, name: 'Shield Breaker - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 2,
      label: 'Amulet of Hatred - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 223, name: 'Amulet of Hatred - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 3,
      label: 'Arcane Destabilizer - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 224, name: 'Arcane Destabilizer - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 4,
      label: 'Spell Fury - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 225, name: 'Spell Fury - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 5,
      label: 'Last Stand Brooch - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 226, name: 'Last Stand Brooch - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 6,
      label: 'Primordial Life - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 227, name: 'Primordial Life - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 7,
      label: 'Mask of the Slayer - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 228, name: 'Mask of the Slayer - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 8,
      label: 'Titan\'s Strength Helmet - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 229, name: 'Titan\'s Strength Helmet - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 9,
      label: 'Undying Gladiator\'s Armor - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 230, name: 'Undying Gladiator\'s Armor - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 10,
      label: 'Cuirass of Spell Protection - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 231, name: 'Cuirass of Spell Protection - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 11,
      label: 'Retribution Chestplate - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 232, name: 'Retribution Chestplate - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 12,
      label: 'Platemail of Vitality - Recipe fragment',
      reward: { type: 'fragmentScroll', id: 233, name: 'Platemail of Vitality - Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 13,
      label: 'Recurve Bow—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 243, name: 'Recurve Bow—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 14,
      label: 'Explorer Backpack — Recipe fragment',
      reward: { type: 'fragmentScroll', id: 244, name: 'Explorer Backpack — Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 15,
      label: 'Mind Ring—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 247, name: 'Mind Ring—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 16,
      label: 'Whisper Ring—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 248, name: 'Whisper Ring—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 17,
      label: 'Might Ring—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 249, name: 'Might Ring—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 18,
      label: 'Soul Reaper —Recipe fragment',
      reward: { type: 'fragmentScroll', id: 250, name: 'Soul Reaper —Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 19,
      label: 'Viper Kiss—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 251, name: 'Viper Kiss—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 20,
      label: 'Sacred Guard—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 252, name: 'Sacred Guard—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 21,
      label: 'Stormfang—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 253, name: 'Stormfang—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 22,
      label: 'Emerald Wrath—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 254, name: 'Emerald Wrath—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 23,
      label: 'Fairy Spark—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 255, name: 'Fairy Spark—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 24,
      label: 'Runic Mantle—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 256, name: 'Runic Mantle—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 25,
      label: 'Serpent Wand—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 257, name: 'Serpent Wand—Recipe fragment', amount: 300 }
    },
    {
      choiceIndex: 26,
      label: 'Wyvern Scale—Recipe fragment',
      reward: { type: 'fragmentScroll', id: 258, name: 'Wyvern Scale—Recipe fragment', amount: 300 }
    },
  ],

  // 40180: Magic Chest
  '40180': [
    {
      choiceIndex: 0,
      label: 'Large Skin Stone Chest',
      reward: { type: 'consumable', id: 65, name: 'Large Skin Stone Chest', amount: 2 }
    },
    {
      choiceIndex: 1,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 2 }
    },
    {
      choiceIndex: 2,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1500 }
    },
    {
      choiceIndex: 3,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 500 }
    },
    {
      choiceIndex: 4,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 1000 }
    },
  ],

  // 40228: Heroes Trove
  '40228': [
    {
      choiceIndex: 0,
      label: 'Artifact Essence Chest',
      reward: { type: 'consumable', id: 62, name: 'Artifact Essence Chest', amount: 3 }
    },
    {
      choiceIndex: 1,
      label: 'Artifact Scroll Chest',
      reward: { type: 'consumable', id: 63, name: 'Artifact Scroll Chest', amount: 3 }
    },
    {
      choiceIndex: 2,
      label: 'Artifact Metal Chest',
      reward: { type: 'consumable', id: 64, name: 'Artifact Metal Chest', amount: 3 }
    },
    {
      choiceIndex: 3,
      label: 'Meta Cube',
      reward: { type: 'coin', id: 40065, name: 'Meta Cube', amount: 150 }
    },
    {
      choiceIndex: 4,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 200 }
    },
    {
      choiceIndex: 5,
      label: 'Big EXP potion',
      reward: { type: 'consumable', id: 11, name: 'Big EXP potion', amount: 25 }
    },
  ],

  // 40229: Rare Heroes Trove
  '40229': [
    {
      choiceIndex: 0,
      label: 'Violet Artifact Box',
      reward: { type: 'consumable', id: 233, name: 'Violet Artifact Box', amount: 8 }
    },
    {
      choiceIndex: 1,
      label: 'Blue Artifact Box',
      reward: { type: 'consumable', id: 232, name: 'Blue Artifact Box', amount: 10 }
    },
    {
      choiceIndex: 2,
      label: 'Green Artifact Box',
      reward: { type: 'consumable', id: 231, name: 'Green Artifact Box', amount: 12 }
    },
    {
      choiceIndex: 3,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1200 }
    },
    {
      choiceIndex: 4,
      label: 'Artifact Coin',
      reward: { type: 'coin', id: 14, name: 'Artifact Coin', amount: 1500 }
    },
    {
      choiceIndex: 5,
      label: 'Mastery Crystal',
      reward: { type: 'coin', id: 40067, name: 'Mastery Crystal', amount: 650 }
    },
    {
      choiceIndex: 6,
      label: 'Meta Cube',
      reward: { type: 'coin', id: 40065, name: 'Meta Cube', amount: 650 }
    },
    {
      choiceIndex: 7,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 800 }
    },
    {
      choiceIndex: 8,
      label: 'Huge EXP potion',
      reward: { type: 'consumable', id: 12, name: 'Huge EXP potion', amount: 20 }
    },
  ],

  // 40230: Titans Trove
  '40230': [
    {
      choiceIndex: 0,
      label: 'Titan Artifact Chest',
      reward: { type: 'consumable', id: 259, name: 'Titan Artifact Chest', amount: 2 }
    },
    {
      choiceIndex: 1,
      label: 'Water Titan Artifact Chest',
      reward: { type: 'consumable', id: 273, name: 'Water Titan Artifact Chest', amount: 2 }
    },
    {
      choiceIndex: 2,
      label: 'Fire Titan Artifact Chest',
      reward: { type: 'consumable', id: 274, name: 'Fire Titan Artifact Chest', amount: 2 }
    },
    {
      choiceIndex: 3,
      label: 'Earth Titan Artifact Chest',
      reward: { type: 'consumable', id: 275, name: 'Earth Titan Artifact Chest', amount: 2 }
    },
    {
      choiceIndex: 4,
      label: 'Titan Skin Stone',
      reward: { type: 'coin', id: 20, name: 'Titan Skin Stone', amount: 300 }
    },
    {
      choiceIndex: 5,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 100 }
    },
  ],

  // 40231: Rare Titans Trove
  '40231': [
    {
      choiceIndex: 0,
      label: 'Titan Artifact Chest',
      reward: { type: 'consumable', id: 259, name: 'Titan Artifact Chest', amount: 8 }
    },
    {
      choiceIndex: 1,
      label: 'Light & Dark Artifact Chest',
      reward: { type: 'consumable', id: 413, name: 'Light & Dark Artifact Chest', amount: 8 }
    },
    {
      choiceIndex: 2,
      label: 'Titan Potion',
      reward: { type: 'consumable', id: 20, name: 'Titan Potion', amount: 2000 }
    },
    {
      choiceIndex: 3,
      label: 'Titan Skin Stone',
      reward: { type: 'coin', id: 20, name: 'Titan Skin Stone', amount: 1300 }
    },
    {
      choiceIndex: 4,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 450 }
    },
  ],

  // 40246: Red Recipe Box
  '40246': [
    {
      choiceIndex: 0,
      label: 'Demoness\' Helm — Recipe',
      reward: { type: 'scroll', id: 267, name: 'Demoness\' Helm — Recipe', amount: 1 }
    },
    {
      choiceIndex: 1,
      label: 'Torturer\'s Gloves — Recipe',
      reward: { type: 'scroll', id: 268, name: 'Torturer\'s Gloves — Recipe', amount: 1 }
    },
    {
      choiceIndex: 2,
      label: 'Star Tiara — Recipe',
      reward: { type: 'scroll', id: 235, name: 'Star Tiara — Recipe', amount: 1 }
    },
    {
      choiceIndex: 3,
      label: 'Cyborg Gloves — Recipe',
      reward: { type: 'scroll', id: 246, name: 'Cyborg Gloves — Recipe', amount: 1 }
    },
    {
      choiceIndex: 4,
      label: 'Titan\'s Strength Helmet - Recipe',
      reward: { type: 'scroll', id: 229, name: 'Titan\'s Strength Helmet - Recipe', amount: 1 }
    },
    {
      choiceIndex: 5,
      label: '5000 starmoney',
      reward: { type: 'starmoney', id: 'starmoney', name: 'Starmoney', amount: 5000 }
    },
  ],

  // 40248: Sweet Treat
  '40248': [
    {
      choiceIndex: 0,
      label: 'Large Skin Stone Chest',
      reward: { type: 'consumable', id: 65, name: 'Large Skin Stone Chest', amount: 2 }
    },
    {
      choiceIndex: 1,
      label: 'Chaos Core',
      reward: { type: 'consumable', id: 44, name: 'Chaos Core', amount: 2 }
    },
    {
      choiceIndex: 2,
      label: 'Rune Stone',
      reward: { type: 'coin', id: 40077, name: 'Rune Stone', amount: 1500 }
    },
    {
      choiceIndex: 3,
      label: 'Fairy Dust',
      reward: { type: 'coin', id: 18, name: 'Fairy Dust', amount: 500 }
    },
    {
      choiceIndex: 4,
      label: 'Spark of Power',
      reward: { type: 'consumable', id: 24, name: 'Spark of Power', amount: 1000 }
    },
  ],

  // 40249: Red Recipe Box
  '40249': [
    {
      choiceIndex: 0,
      label: 'King Honk — Recipe',
      reward: { type: 'scroll', id: 236, name: 'King Honk — Recipe', amount: 1 }
    },
    {
      choiceIndex: 1,
      label: 'Retribution Chestplate - Recipe',
      reward: { type: 'scroll', id: 232, name: 'Retribution Chestplate - Recipe', amount: 1 }
    },
    {
      choiceIndex: 2,
      label: 'Might Ring—Recipe',
      reward: { type: 'scroll', id: 249, name: 'Might Ring—Recipe', amount: 1 }
    },
    {
      choiceIndex: 3,
      label: 'Platemail of Vitality - Recipe',
      reward: { type: 'scroll', id: 233, name: 'Platemail of Vitality - Recipe', amount: 1 }
    },
    {
      choiceIndex: 4,
      label: 'Primordial Life - Recipe',
      reward: { type: 'scroll', id: 227, name: 'Primordial Life - Recipe', amount: 1 }
    },
    {
      choiceIndex: 5,
      label: '5000 starmoney',
      reward: { type: 'starmoney', id: 'starmoney', name: 'Starmoney', amount: 5000 }
    },
  ],

  // 40253: Red Recipe Box
  '40253': [
    {
      choiceIndex: 0,
      label: 'Magistrate\'s Hood — Recipe',
      reward: { type: 'scroll', id: 269, name: 'Magistrate\'s Hood — Recipe', amount: 1 }
    },
    {
      choiceIndex: 1,
      label: 'Emerald Wrath—Recipe',
      reward: { type: 'scroll', id: 254, name: 'Emerald Wrath—Recipe', amount: 1 }
    },
    {
      choiceIndex: 2,
      label: 'Soul Reaper —Recipe',
      reward: { type: 'scroll', id: 250, name: 'Soul Reaper —Recipe', amount: 1 }
    },
    {
      choiceIndex: 3,
      label: 'Last Stand Brooch - Recipe',
      reward: { type: 'scroll', id: 226, name: 'Last Stand Brooch - Recipe', amount: 1 }
    },
    {
      choiceIndex: 4,
      label: 'Runic Mantle—Recipe',
      reward: { type: 'scroll', id: 256, name: 'Runic Mantle—Recipe', amount: 1 }
    },
    {
      choiceIndex: 5,
      label: '5000 starmoney',
      reward: { type: 'starmoney', id: 'starmoney', name: 'Starmoney', amount: 5000 }
    },
  ],

};

// Categories that must NEVER be treated as openable chests
export const NON_CHEST_CATEGORIES = new Set<string>([
  'gear',
  'fragmentGear',
  'artifact',
  'fragmentArtifact',
  'scroll',
  'fragmentScroll',
  'coin',
  'fragmentHero',
  'fragmentTitan',
  'fragmentSkin',
  'patron',
  'speedUp',
  'speedUpBuilding',
  'speedUpResearch',
  'teleporter',
  'material',
  'energy',
  'stamina',
  'experience',
  'gold',
  'starmoney'
]);

// Categories that can legitimately contain openable chests / caskets / boxes
export const VALID_CHEST_CATEGORIES = new Set<string>([
  'consumable',
  'lootboxChanced',
  'lootboxChoiced',
  'refillable'
]);

// Known IDs of openable chests / caskets / boxes
export const KNOWN_CHEST_IDS = new Set<string | number>([
  15, 18, 19, 21, 22, 23, 26, 27, 28, 47, 48, 49, 50, 51, 56, 57, 60, 62, 63, 64, 65, 78, 100, 101, 102, 103, 105, 200, 201, 273, 274, 275, 276, 318, 365, 367, 387, 391, 392, 393, 399, 400, 407, 408, 409, 410, 412, 413, 40009, 40010, 40113, 40142, 40150, 40160, 40161, 40162, 40175, 40176, 40180, 40228, 40229, 40230, 40231, 40246, 40248, 40249, 40253,
  '15', '18', '19', '21', '22', '23', '26', '27', '28', '47', '48', '49', '50', '51', '56', '57', '60', '62', '63', '64', '65', '78', '100', '101', '102', '103', '105', '200', '201', '273', '274', '275', '276', '318', '365', '367', '387', '391', '392', '393', '399', '400', '407', '408', '409', '410', '412', '413', '40009', '40010', '40113', '40142', '40150', '40160', '40161', '40162', '40175', '40176', '40180', '40228', '40229', '40230', '40231', '40246', '40248', '40249', '40253'
]);

/**
 * Checks whether an inventory item is an openable chest or casket.
 */
export function isOpenableChest(item: {
  id: string | number;
  category?: string;
  rawCategory?: string;
  name?: string;
}): boolean {
  if (!item || item.id == null) return false;

  const cat = item.rawCategory || item.category;
  if (cat) {
    if (NON_CHEST_CATEGORIES.has(cat) || (item.category && NON_CHEST_CATEGORIES.has(item.category))) {
      return false;
    }
    if (!VALID_CHEST_CATEGORIES.has(cat) && (!item.category || !VALID_CHEST_CATEGORIES.has(item.category))) {
      return false;
    }
  }

  const strId = String(item.id);

  if (item.category === 'lootboxChanced' || item.rawCategory === 'lootboxChanced') return true;
  if (item.category === 'lootboxChoiced' || item.rawCategory === 'lootboxChoiced') return true;

  if (KNOWN_CHEST_IDS.has(strId) || KNOWN_CHEST_IDS.has(Number(strId))) return true;

  const name = (item.name || '').toLowerCase();
  if (
    name.includes('chest') ||
    name.includes('casket') ||
    name.includes('trove') ||
    name.includes('gift') ||
    name.includes('transfigurator') ||
    name.includes('seed')
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether a chest has configurable reward choices.
 */
export function isChoiceChest(
  chestId: number | string,
  item?: { rawCategory?: string; category?: string } | null
): boolean {
  const strId = String(chestId);
  if (Object.hasOwn(CHOICE_CHEST_DEFINITIONS, strId)) return true;
  if (item?.rawCategory === 'lootboxChoiced' || item?.category === 'lootboxChoiced') return true;
  return false;
}

/**
 * Returns the list of choice options for a chest, or empty array if random.
 */
export function getChestChoices(chestId: number | string): ChestChoiceOption[] {
  const strId = String(chestId);
  const choices = CHOICE_CHEST_DEFINITIONS[strId];
  if (!choices) return [];

  return choices.map((c) => ({
    ...c,
    reward: {
      ...c.reward,
      name: c.reward.name || getItemName(c.reward.type, c.reward.id) || `${c.reward.type} #${c.reward.id}`,
      icon: getItemIcon(c.reward.type, c.reward.id)
    }
  }));
}

export interface AggregatedReward {
  type: string;
  id: string | number;
  name: string;
  amount: number;
  icon?: string | null;
}

/**
 * Aggregates results from inventory_use RPC responses into a clean list of rewards.
 * Response structure: Array of objects, each containing category keys mapping to subId: amount.
 */
export function aggregateChestRewards(responseList: any): AggregatedReward[] {
  if (!responseList) return [];
  const list = Array.isArray(responseList) ? responseList : [responseList];
  const rewardMap = new Map<string, AggregatedReward>();

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    for (const [cat, subMap] of Object.entries(entry)) {
      if (subMap && typeof subMap === 'object') {
        for (const [subId, amt] of Object.entries(subMap)) {
          const num = Number(amt) || 0;
          if (num <= 0) continue;
          const key = `${cat}:${subId}`;
          const existing = rewardMap.get(key);
          if (existing) {
            existing.amount += num;
          } else {
            const name = getItemName(cat, subId) || `${cat} #${subId}`;
            const icon = getItemIcon(cat, subId);
            rewardMap.set(key, {
              type: cat,
              id: subId,
              name,
              amount: num,
              icon
            });
          }
        }
      }
    }
  }

  return Array.from(rewardMap.values());
}
