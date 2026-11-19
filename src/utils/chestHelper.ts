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
  // 62: Artifact Essence Chest (from live game tracking log hwa-game-record-202611200058_chest_opening.json)
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
    }
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
    }
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
    }
  ],

  // 51: Skin Stone Chest
  '51': [
    {
      choiceIndex: 0,
      label: 'Strength Skin Stone',
      reward: { type: 'coin', id: 9, name: 'Strength Skin Stone', amount: 150 }
    },
    {
      choiceIndex: 1,
      label: 'Agility Skin Stone',
      reward: { type: 'coin', id: 10, name: 'Agility Skin Stone', amount: 150 }
    },
    {
      choiceIndex: 2,
      label: 'Intelligence Skin Stone',
      reward: { type: 'coin', id: 8, name: 'Intelligence Skin Stone', amount: 150 }
    }
  ],

  // 65: Large Skin Stone Chest
  '65': [
    {
      choiceIndex: 0,
      label: 'Strength Skin Stone',
      reward: { type: 'coin', id: 9, name: 'Strength Skin Stone', amount: 350 }
    },
    {
      choiceIndex: 1,
      label: 'Agility Skin Stone',
      reward: { type: 'coin', id: 10, name: 'Agility Skin Stone', amount: 350 }
    },
    {
      choiceIndex: 2,
      label: 'Intelligence Skin Stone',
      reward: { type: 'coin', id: 8, name: 'Intelligence Skin Stone', amount: 350 }
    }
  ],

  // 47: Chest of Defender Titans
  '47': [
    {
      choiceIndex: 0,
      label: 'Angus Soul Stones',
      reward: { type: 'fragmentTitan', id: 4020, name: 'Angus fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Sigurd Soul Stones',
      reward: { type: 'fragmentTitan', id: 4000, name: 'Sigurd fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Moloch Soul Stones',
      reward: { type: 'fragmentTitan', id: 4010, name: 'Moloch fragment', amount: 5 }
    }
  ],

  // 48: Chest of Marksman Titans
  '48': [
    {
      choiceIndex: 0,
      label: 'Sylva Soul Stones',
      reward: { type: 'fragmentTitan', id: 4021, name: 'Sylva fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Vulcan Soul Stones',
      reward: { type: 'fragmentTitan', id: 4011, name: 'Vulcan fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Nova Soul Stones',
      reward: { type: 'fragmentTitan', id: 4001, name: 'Nova fragment', amount: 5 }
    }
  ],

  // 49: Chest of Support Titans
  '49': [
    {
      choiceIndex: 0,
      label: 'Avalon Soul Stones',
      reward: { type: 'fragmentTitan', id: 4022, name: 'Avalon fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Ignis Soul Stones',
      reward: { type: 'fragmentTitan', id: 4012, name: 'Ignis fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Mairi Soul Stones',
      reward: { type: 'fragmentTitan', id: 4002, name: 'Mairi fragment', amount: 5 }
    }
  ],

  // 50: Chest of Supertitans
  '50': [
    {
      choiceIndex: 0,
      label: 'Eden Soul Stones',
      reward: { type: 'fragmentTitan', id: 4023, name: 'Eden fragment', amount: 5 }
    },
    {
      choiceIndex: 1,
      label: 'Araji Soul Stones',
      reward: { type: 'fragmentTitan', id: 4013, name: 'Araji fragment', amount: 5 }
    },
    {
      choiceIndex: 2,
      label: 'Hyperion Soul Stones',
      reward: { type: 'fragmentTitan', id: 4003, name: 'Hyperion fragment', amount: 5 }
    }
  ]
};

// Known IDs of openable chests / caskets / boxes
export const KNOWN_CHEST_IDS = new Set<string | number>([
  15, 18, 19, 21, 22, 23, 26, 27, 28, 47, 48, 49, 50, 51, 56, 57, 60, 62, 63, 64, 65, 78,
  100, 101, 102, 103, 105, 200, 201, 318, 365, 367, 391, 392, 399, 400, 407, 408, 409, 410, 412, 413,
  40009, 40010, 40142, 40160, 40161, 40162, 40175, 40228, 40230, 40246, 40248, 40249,
  '15', '18', '19', '21', '22', '23', '26', '27', '28', '47', '48', '49', '50', '51', '56', '57', '60', '62', '63', '64', '65', '78',
  '100', '101', '102', '103', '105', '200', '201', '318', '365', '367', '391', '392', '399', '400', '407', '408', '409', '410', '412', '413',
  '40009', '40010', '40142', '40160', '40161', '40162', '40175', '40228', '40230', '40246', '40248', '40249'
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
export function isChoiceChest(chestId: number | string): boolean {
  const strId = String(chestId);
  return Object.hasOwn(CHOICE_CHEST_DEFINITIONS, strId);
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
