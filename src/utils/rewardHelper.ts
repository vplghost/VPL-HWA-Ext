import { getItemName } from '../data/nameData.ts';
import { getItemIcon } from '../data/itemData.ts';

export interface FormattedReward {
  type: string;
  id?: string | number;
  label: string;
  amount: number;
  icon?: string | null;
  badgeClass?: string;
}

const standardLabels: Record<string, { label: string; badge: string }> = {
  gold: { label: 'Gold', badge: 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700/60' },
  starmoney: { label: 'Emeralds', badge: 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700/60' },
  stamina: { label: 'Energy', badge: 'bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-700/60' },
  experience: { label: 'XP', badge: 'bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-950/80 dark:text-purple-200 dark:border-purple-700/60' },
  drafts_chip: { label: 'Draft Chips', badge: 'bg-indigo-100 text-indigo-900 border border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-200 dark:border-indigo-700/60' },
  vipPoints: { label: 'VIP Points', badge: 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700/60' },
};

const coinNames: Record<number | string, string> = {
  1: 'Arena Coins',
  2: 'Grand Arena Coins',
  3: 'Tower Coins',
  4: 'Outland Coins',
  5: 'Guild War Trophy',
  6: 'Highway Coins',
  7: 'Pet Potions',
  8: 'Friendship Chips',
  18: 'Fairy Dust',
};

const consumableNames: Record<number | string, string> = {
  20: 'Titan Potion',
  21: 'Soul Stone Chest',
  22: 'Skin Stone Chest',
  23: 'Chaos Particle',
  24: 'Artifact Chest Key',
};

export function parseRewards(reward: any): FormattedReward[] {
  if (!reward) return [];
  const results: FormattedReward[] = [];

  // Array format: [{ type: 'gold', amount: 100, id: 0 }]
  if (Array.isArray(reward)) {
    for (const item of reward) {
      if (!item) continue;
      const type = item.type || 'item';
      const id = item.id != null ? String(item.id) : undefined;
      const amount = Number(item.amount) || 1;

      let label = standardLabels[type]?.label;
      let badge = standardLabels[type]?.badge || 'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';
      let icon: string | null = null;

      if (!label) {
        if (type === 'coin' && id && coinNames[id]) {
          label = coinNames[id];
        } else if (type === 'consumable' && id && consumableNames[id]) {
          label = consumableNames[id];
        } else if (id) {
          label = getItemName(type, id) || `${type} #${id}`;
        } else {
          label = type;
        }
      }

      if (id) {
        icon = getItemIcon(type, id);
      }

      results.push({ type, id, label, amount, icon, badgeClass: badge });
    }
    return results;
  }

  // Object format: { gold: 1000, coin: { "18": 50 }, consumable: { "20": 100 } }
  if (typeof reward === 'object') {
    for (const [key, val] of Object.entries(reward)) {
      if (typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && Number.isFinite(Number(val)))) {
        const amount = Number(val);
        const meta = standardLabels[key];
        const label = meta?.label || key;
        const badge = meta?.badge || 'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600';
        results.push({ type: key, label, amount, badgeClass: badge });
      } else if (val && typeof val === 'object') {
        for (const [subId, subAmount] of Object.entries(val)) {
          const amount = Number(subAmount) || 1;
          let label = '';
          if (key === 'coin' && coinNames[subId]) {
            label = coinNames[subId];
          } else if (key === 'consumable' && consumableNames[subId]) {
            label = consumableNames[subId];
          } else {
            label = getItemName(key, subId) || `${key} #${subId}`;
          }
          const icon = getItemIcon(key, subId);
          results.push({
            type: key,
            id: subId,
            label,
            amount,
            icon,
            badgeClass: 'bg-indigo-50 text-indigo-900 border border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-200 dark:border-indigo-700/60'
          });
        }
      }
    }
  }

  return results;
}

export function formatRewardsSummary(reward: any): string {
  const list = parseRewards(reward);
  if (list.length === 0) return '—';
  return list.map(r => `${r.amount.toLocaleString()} × ${r.label}`).join(', ');
}
