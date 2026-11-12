<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import {
  getHeroMetadata,
  getHeroName,
  getHeroEquipmentRank,
  getHeroSoulProgress,
  getItemName,
  getGearCraftData,
  starGlowClass,
} from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
  hero?: any | null;
  heroId?: number | string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'openCampaign', gearId: number | string | null): void;
}>();

const { cache, dispatchRpc } = useRpcCache();
const { openModal } = useModals();

const internalHeroId = ref<string>('');

watch(
  [() => props.hero, () => props.heroId, () => props.modelValue],
  () => {
    if (props.hero?.id) {
      internalHeroId.value = String(props.hero.id);
    } else if (props.heroId) {
      internalHeroId.value = String(props.heroId);
    } else if (!internalHeroId.value) {
      const heroesData = cache.value?.heroGetAll?.data || {};
      const firstId = Object.keys(heroesData)[0];
      if (firstId) internalHeroId.value = firstId;
    }
  },
  { immediate: true }
);

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

// All heroes from cache for switcher
const availableHeroes = computed(() => {
  const heroesData = cache.value?.heroGetAll?.data || {};
  return Object.entries(heroesData)
    .map(([id, h]: [string, any]) => ({
      id,
      name: getHeroName(id),
      power: Number(h?.power) || 0,
    }))
    .sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));
});

function handleHeroSwitch(e: Event) {
  const target = e.target as HTMLSelectElement;
  internalHeroId.value = target.value;
}

// Current active hero object
const activeHero = computed(() => {
  const heroesData = cache.value?.heroGetAll?.data || {};
  const idStr = internalHeroId.value;
  const numId = Number(idStr);
  return heroesData[idStr] || heroesData[numId] || (props.hero?.id === numId ? props.hero : null);
});

const currentHeroId = computed(() => internalHeroId.value || String(props.hero?.id || ''));

const meta = computed(() => {
  if (!currentHeroId.value) return undefined;
  return getHeroMetadata(currentHeroId.value);
});

const activeHeroName = computed(() => {
  return meta.value?.name || getHeroName(currentHeroId.value) || `Hero #${currentHeroId.value}`;
});

const starCount = computed(() => Number(activeHero.value?.star) || 1);
const largeGlow = computed(() => starGlowClass(starCount.value, true));

const equipmentRank = computed(() => {
  if (!activeHero.value?.color) return null;
  return getHeroEquipmentRank(activeHero.value.color);
});

const soulProgress = computed(() => {
  if (!activeHero.value) return null;
  return getHeroSoulProgress(currentHeroId.value, activeHero.value, cache.value?.inventoryGet?.data);
});

// Skills
const heroLevel = computed(() => Number(activeHero.value?.level) || 1);
const heroColor = computed(() => Number(activeHero.value?.color) || 1);
const skillKeys = computed(() => {
  const skills = activeHero.value?.skills || {};
  return Object.keys(skills).sort((a, b) => Number(a) - Number(b));
});

interface SkillSlotConfig {
  slot: number;
  label: string;
  tier: string;
  rankReq: number;
  rankName: string;
  bg: string;
  badge: string;
  maxLvl: number;
}

const skillSlots = computed<SkillSlotConfig[]>(() => [
  {
    slot: 1,
    label: 'Skill 1',
    tier: 'White',
    rankReq: 1,
    rankName: 'White',
    bg: 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40',
    badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    maxLvl: heroLevel.value,
  },
  {
    slot: 2,
    label: 'Skill 2',
    tier: 'Green',
    rankReq: 2,
    rankName: 'Green',
    bg: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    maxLvl: heroLevel.value,
  },
  {
    slot: 3,
    label: 'Skill 3',
    tier: 'Blue',
    rankReq: 4,
    rankName: 'Blue',
    bg: 'border-sky-200 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/20',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
    maxLvl: Math.max(0, heroLevel.value - 20),
  },
  {
    slot: 4,
    label: 'Skill 4',
    tier: 'Violet',
    rankReq: 7,
    rankName: 'Violet',
    bg: 'border-purple-200 bg-purple-50/60 dark:border-purple-900/40 dark:bg-purple-950/20',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
    maxLvl: Math.max(0, heroLevel.value - 40),
  },
]);

const upgradingSkills = ref<Record<number, boolean>>({});

async function upgradeSkill(s: SkillSlotConfig) {
  if (!activeHero.value) return;
  const numId = Number(currentHeroId.value);
  upgradingSkills.value[s.slot] = true;

  // Optimistic update
  const skillKey = skillKeys.value[s.slot - 1];
  if (activeHero.value.skills && skillKey) {
    activeHero.value.skills[skillKey] = (Number(activeHero.value.skills[skillKey]) || 0) + 1;
  } else if (activeHero.value.skills) {
    activeHero.value.skills[s.slot] = (Number(activeHero.value.skills[s.slot]) || 0) + 1;
  }

  try {
    await dispatchRpc([
      {
        name: 'heroUpgradeSkill',
        args: { heroId: numId, skill: s.slot },
      },
      { name: 'heroGetAll' },
    ]);
  } finally {
    upgradingSkills.value[s.slot] = false;
  }
}

// Artifacts
const heroArtifacts = computed(() => {
  return Array.isArray(activeHero.value?.artifacts) ? activeHero.value.artifacts : [];
});

// Equipment Slots
const heroColorStr = computed(() => String(activeHero.value?.color || 1));
const colorEquipmentItems = computed(() => {
  return meta.value?.equipment?.[heroColorStr.value] || [];
});

interface EquipmentSlotStatus {
  slotNum: number;
  itemId: number | null;
  itemName: string;
  isEquipped: boolean;
  ownedGear: number;
  fragReq: number;
  ownedFrags: number;
  hasRecipe: boolean;
  canCraftNow: boolean;
  statusKind: 'equipped' | 'inventory' | 'readyToCraft' | 'incomplete' | 'recipe' | 'missing';
  badgeHtml: string;
  subText: string;
}

const equipmentSlots = computed<EquipmentSlotStatus[]>(() => {
  const hero = activeHero.value;
  const items = colorEquipmentItems.value;
  const inv = cache.value?.inventoryGet?.data;

  const result: EquipmentSlotStatus[] = [];
  for (let sIdx = 0; sIdx < 6; sIdx++) {
    const slotNum = sIdx + 1;
    const itemId = items[sIdx] || null;
    const itemName = itemId ? getItemName('gear', itemId) : `Slot ${slotNum}`;

    let isEquipped = false;
    if (hero?.slots) {
      if (Array.isArray(hero.slots)) {
        isEquipped = sIdx < hero.slots.length && hero.slots[sIdx] !== undefined && hero.slots[sIdx] !== null;
      } else if (typeof hero.slots === 'object') {
        isEquipped = Object.hasOwn(hero.slots, String(sIdx)) || Object.hasOwn(hero.slots, sIdx);
      }
    }

    const ownedGear = itemId ? Number(inv?.gear?.[itemId] || 0) : 0;
    const craftInfo = itemId ? getGearCraftData(itemId) : null;
    const fragReq = craftInfo?.fragmentCount || 0;
    const ownedFrags = itemId ? Number(inv?.fragmentGear?.[itemId] || 0) : 0;
    const hasRecipe = !!craftInfo?.recipe;

    let statusKind: EquipmentSlotStatus['statusKind'] = 'missing';
    let canCraftNow = false;
    let badgeHtml = '';
    let subText = '';

    if (isEquipped) {
      statusKind = 'equipped';
      badgeHtml = '✓ Equipped';
      subText = `Slot ${slotNum} • Stats active`;
    } else if (ownedGear > 0) {
      statusKind = 'inventory';
      badgeHtml = `📦 In Inventory (${ownedGear})`;
      subText = `Slot ${slotNum} • In Inventory (not equipped)`;
    } else if (fragReq > 0 && ownedFrags >= fragReq) {
      statusKind = 'readyToCraft';
      canCraftNow = true;
      badgeHtml = `🧩 Ready to craft (${ownedFrags}/${fragReq})`;
      subText = `Slot ${slotNum} • Not crafted • Fragments ready`;
    } else if (fragReq > 0 && ownedFrags > 0) {
      statusKind = 'incomplete';
      badgeHtml = `🧩 Incomplete (${ownedFrags}/${fragReq})`;
      subText = `Slot ${slotNum} • Missing ${fragReq - ownedFrags} fragments`;
    } else if (hasRecipe) {
      statusKind = 'recipe';
      badgeHtml = '🛠️ Recipe';
      subText = `Slot ${slotNum} • Uncrafted (assembled from Recipe)`;
    } else {
      statusKind = 'missing';
      badgeHtml = `Missing${fragReq > 0 ? ` (0/${fragReq})` : ''}`;
      subText = `Slot ${slotNum} • Click to open Campaign Farm`;
    }

    result.push({
      slotNum,
      itemId,
      itemName,
      isEquipped,
      ownedGear,
      fragReq,
      ownedFrags,
      hasRecipe,
      canCraftNow,
      statusKind,
      badgeHtml,
      subText,
    });
  }
  return result;
});

const isCrafting = ref<Record<number, boolean>>({});
const isEquipping = ref<Record<number, boolean>>({});

async function handleEquip(slot: EquipmentSlotStatus) {
  if (!activeHero.value || slot.isEquipped) return;
  const numId = Number(activeHero.value.id);
  const slotIdx = slot.slotNum - 1;
  isEquipping.value[slot.slotNum] = true;
  try {
    await dispatchRpc([
      {
        name: 'heroInsertItem',
        args: { heroId: numId, slot: slotIdx },
      },
      { name: 'inventoryGet' },
      { name: 'heroGetAll' },
    ]);
  } catch (err) {
    console.error('Failed to equip item:', err);
  } finally {
    isEquipping.value[slot.slotNum] = false;
  }
}

async function handleCraft(slot: EquipmentSlotStatus) {
  if (!slot.itemId) return;
  isCrafting.value[slot.slotNum] = true;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { kind: 'craft-fragment', type: 'gear', libId: slot.itemId, amount: 1 },
        () => {
          setTimeout(() => {
            dispatchRpc([{ name: 'inventoryGet' }]);
            isCrafting.value[slot.slotNum] = false;
          }, 500);
        }
      );
    } else {
      await dispatchRpc([
        {
          name: 'inventoryCraftFragments',
          args: { libId: slot.itemId, amount: 1 },
        },
        { name: 'inventoryGet' },
      ]);
      isCrafting.value[slot.slotNum] = false;
    }
  } catch (_) {
    isCrafting.value[slot.slotNum] = false;
  }
}

function openFarmForSlot(slot: EquipmentSlotStatus) {
  if (slot.isEquipped) return;
  const gearId = slot.itemId;
  emit('openCampaign', gearId);
  openModal('campaign', { selectedCampaignGearId: gearId });
}

function handleFarmQuick() {
  const firstMissing = equipmentSlots.value.find((s) => !s.isEquipped && s.itemId);
  const gearId = firstMissing?.itemId || colorEquipmentItems.value[0] || null;
  emit('openCampaign', gearId);
  openModal('campaign', { selectedCampaignGearId: gearId });
}

const JUSTICE_STAR_SVG_PATH =
  'm256.438 25.78-41.75 127.19 41.625 30 42.093-30.22-41.97-126.97zm-90.157 91.064c-16.33 0-29.374 13.043-29.374 29.375 0 16.33 13.044 29.374 29.375 29.374 16.333 0 29.345-13.044 29.345-29.375 0-16.333-13.012-29.376-29.344-29.376zm179.97.375c-16.332 0-29.375 13.042-29.375 29.374 0 16.33 13.043 29.344 29.375 29.344s29.375-13.013 29.375-29.344c0-16.332-13.043-29.375-29.375-29.375zM207.5 170.843c-5.795 9.65-14.895 17.124-25.688 20.844L197.595 241l2.062 6.438-5.47 3.968-49.06 35.813c5.772 7.404 9.438 16.525 10.06 26.436l59.658.28 6.75.033 2.094 6.405L243 379.188a47.585 47.585 0 0 1 13.78-2.032c4.652 0 9.145.69 13.408 1.938l19.5-58.97 2.093-6.405 6.75-.033 56.72-.156c.83-10.39 5.006-19.848 11.438-27.342l-48.032-35.22L313.22 247l2.092-6.406 15.625-48.5a48.443 48.443 0 0 1-26-21.03l-43.187 31.03-5.47 3.906-5.467-3.906-43.313-31.25zm-44.375 23.78-140.188.657 108.157 79 46.625-34-14.595-45.655zm186.53.25-14.5 45.032 46.876 34.344c.24-.117.48-.23.72-.344l107.188-78.625-140.282-.405zm-242.405 92.44c-16.332-.002-29.375 13.042-29.375 29.373 0 16.332 13.043 29.375 29.375 29.375s29.375-13.043 29.375-29.375c0-16.33-13.043-29.375-29.375-29.375zm295.875.686c-16.332 0-29.375 13.043-29.375 29.375s13.043 29.375 29.375 29.375 29.375-13.043 29.375-29.375S419.457 288 403.125 288zm-46.594 44.22-51.217.124-18.344 55.47 113.78 81.78-44.22-137.375zm-200.5.124-43.905 137.25 113.906-82.188-18-54.812-52-.25zm100.75 63.5c-16.33 0-29.374 13.043-29.374 29.375 0 16.33 13.044 29.374 29.375 29.374 16.333 0 29.376-13.044 29.376-29.375 0-16.333-13.043-29.376-29.375-29.376z';
</script>

<template>
  <div
    v-if="modelValue"
    id="hero-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="hero-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    @click.self="close"
  >
    <div
      class="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-xl dark:bg-slate-900 dark:border-slate-800 overflow-hidden"
    >
      <!-- Dialog Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 shrink-0"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="text-xl shrink-0" aria-hidden="true">🦸</span>
          <h2 id="hero-dialog-title" class="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
            {{ activeHeroName }}
          </h2>
          <div id="hero-dialog-status" class="flex items-center gap-2 truncate">
            <!-- ID Pill -->
            <span
              v-if="currentHeroId"
              class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0"
            >
              #{{ currentHeroId }}
            </span>

            <!-- Power Badge -->
            <span
              v-if="activeHero?.power"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"
            >
              ⚔️ {{ formatNumber(activeHero.power) }}
            </span>

            <!-- Hero Switcher -->
            <select
              v-if="availableHeroes.length > 1"
              id="hero-dialog-switcher"
              :value="currentHeroId"
              class="h-6 rounded border border-slate-300 bg-white px-1.5 text-2xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-hidden"
              @change="handleHeroSwitch($event)"
            >
              <option v-for="h in availableHeroes" :key="h.id" :value="h.id">
                {{ h.name }} ({{ formatNumber(h.power) }})
              </option>
            </select>
          </div>
        </div>

        <button
          type="button"
          autofocus
          aria-label="Close Hero dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="hero-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
        <!-- Hero Not Found -->
        <div
          v-if="!activeHero"
          class="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400"
        >
          <span class="text-xl">⚠️</span>
          <div>
            <div class="font-semibold text-slate-700 dark:text-slate-300">Hero not found</div>
            <div>This hero data has not been captured yet. Use "Refresh Heroes" to update snapshots.</div>
          </div>
        </div>

        <template v-else>
          <!-- 1. Hero Overview Header Card -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
            <div class="flex items-start gap-4 flex-wrap sm:flex-nowrap">
              <!-- Avatar block -->
              <div class="flex flex-col items-center gap-1.5 shrink-0">
                <img
                  v-if="meta?.avatarFile || (meta?.hasAvatar && currentHeroId)"
                  :src="meta?.avatarFile || `assets/heroes/${currentHeroId}.png`"
                  :alt="activeHeroName"
                  class="size-16 rounded-xl object-cover shrink-0"
                  :class="largeGlow"
                />
                <span
                  v-else
                  class="inline-flex size-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold text-white"
                  :class="largeGlow"
                >
                  {{ activeHeroName.charAt(0).toUpperCase() }}
                </span>

                <!-- Star Icons -->
                <div class="inline-flex items-center gap-0.5 text-xs text-amber-400" :title="`${starCount} stars`">
                  <span
                    v-if="starCount >= 6"
                    class="justice-star inline-flex items-center text-amber-400 leading-none drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)]"
                  >
                    <svg class="size-4 inline-block fill-current align-middle" viewBox="0 0 512 512" aria-hidden="true">
                      <path fill="currentColor" :d="JUSTICE_STAR_SVG_PATH" />
                    </svg>
                  </span>
                  <template v-else>
                    <span v-for="s in starCount" :key="s">★</span>
                  </template>
                </div>
              </div>

              <!-- Info details block -->
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
                    {{ activeHeroName }}
                  </h3>
                  <span
                    v-if="meta?.role"
                    class="px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  >
                    {{ meta.role }}
                  </span>
                  <span
                    v-if="meta?.class"
                    class="px-1.5 py-0.5 rounded text-2xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    {{ meta.class }}
                  </span>
                  <span
                    v-if="meta?.faction"
                    class="px-1.5 py-0.5 rounded text-2xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                  >
                    {{ meta.faction }}
                  </span>
                </div>

                <!-- Key stats chips -->
                <div class="flex items-center gap-2 flex-wrap text-xs">
                  <span class="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                    <span class="text-slate-400 font-normal">Level:</span> {{ activeHero.level || 1 }}
                  </span>
                  <span v-if="equipmentRank" class="inline-flex items-center gap-1 font-semibold">
                    <span class="text-slate-400 font-normal">Rank:</span>
                    <span :style="{ color: equipmentRank.color, textShadow: equipmentRank.textShadow }">
                      {{ equipmentRank.label }}
                    </span>
                  </span>
                  <span class="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400">
                    <span class="text-slate-400 font-normal">Power:</span> ⚔️ {{ formatNumber(activeHero.power || 0) }}
                  </span>
                </div>

                <!-- Soul Stones Progress -->
                <div v-if="soulProgress" class="pt-1">
                  <div class="flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>Soul Stones:</span>
                    <span
                      class="font-medium"
                      :class="{
                        'text-emerald-600 font-bold':
                          soulProgress.needed !== 'Max' &&
                          Number(soulProgress.owned) >= Number(soulProgress.needed),
                      }"
                    >
                      {{
                        starCount >= 6 || soulProgress.needed === 'Max'
                          ? 'Maximum Evolution'
                          : `${soulProgress.owned} / ${soulProgress.needed}`
                      }}
                    </span>
                  </div>
                  <div class="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="
                        starCount >= 6 || soulProgress.needed === 'Max'
                          ? 'bg-amber-400'
                          : Number(soulProgress.owned) >= Number(soulProgress.needed)
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                      "
                      :style="{
                        width: `${
                          starCount >= 6 || soulProgress.needed === 'Max'
                            ? 100
                            : Math.min(100, Math.round(((Number(soulProgress.owned) || 0) / (Number(soulProgress.needed) || 1)) * 100))
                        }%`,
                      }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Hero Skills Section with + Upgrade Button -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>⚡</span> Hero Skills
                </h4>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  Upgrade hero skills using skill points and gold
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div
                v-for="s in skillSlots"
                :key="s.slot"
                class="flex flex-col justify-between p-2.5 rounded-lg border transition-all"
                :class="
                  heroColor >= s.rankReq || s.slot <= skillKeys.length
                    ? s.bg
                    : 'border-dashed border-slate-200 bg-slate-50/30 text-slate-400 dark:border-slate-800 dark:bg-slate-900/30'
                "
              >
                <!-- Top Row: tier badge, name, action button/badge -->
                <div class="flex items-center justify-between gap-1.5 min-w-0">
                  <div class="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                    <span
                      class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold uppercase tracking-wider shrink-0"
                      :class="s.badge"
                    >
                      {{ s.tier }}
                    </span>
                    <span
                      class="font-bold text-xs truncate"
                      :class="
                        heroColor >= s.rankReq || s.slot <= skillKeys.length
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-slate-400 dark:text-slate-500'
                      "
                      :title="meta?.skills?.[s.slot - 1] || s.label"
                    >
                      {{ meta?.skills?.[s.slot - 1] || s.label }}
                    </span>
                  </div>

                  <!-- Right Action Wrap -->
                  <div class="shrink-0 flex items-center">
                    <span
                      v-if="!(heroColor >= s.rankReq || s.slot <= skillKeys.length)"
                      class="px-1.5 py-0.5 rounded text-3xs text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500"
                    >
                      Locked
                    </span>
                    <span
                      v-else-if="
                        Number(activeHero?.skills?.[skillKeys[s.slot - 1]] ?? activeHero?.skills?.[s.slot] ?? 1) >= s.maxLvl &&
                        s.maxLvl > 0
                      "
                      class="px-2 py-0.5 rounded text-3xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      MAX
                    </span>
                    <button
                      v-else
                      type="button"
                      :disabled="upgradingSkills[s.slot]"
                      class="btn-upgrade-skill inline-flex items-center justify-center size-6 rounded-md font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                      :title="`Upgrade ${meta?.skills?.[s.slot - 1] || s.label} to Lv. ${(Number(activeHero?.skills?.[skillKeys[s.slot - 1]] ?? activeHero?.skills?.[s.slot] ?? 1)) + 1}`"
                      :aria-label="`Upgrade ${meta?.skills?.[s.slot - 1] || s.label}`"
                      @click="upgradeSkill(s)"
                    >
                      <span v-if="upgradingSkills[s.slot]" class="text-3xs">⏳</span>
                      <svg v-else class="size-3.5 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Bottom Area -->
                <div class="mt-2 space-y-1">
                  <template v-if="heroColor >= s.rankReq || s.slot <= skillKeys.length">
                    <div class="flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400">
                      <span>
                        Level:
                        <span class="font-bold text-slate-700 dark:text-slate-200">
                          {{ Number(activeHero?.skills?.[skillKeys[s.slot - 1]] ?? activeHero?.skills?.[s.slot] ?? 1) }}
                        </span>
                        / {{ s.maxLvl }}
                      </span>
                      <span>
                        {{
                          s.maxLvl > 0
                            ? Math.min(100, Math.round(((Number(activeHero?.skills?.[skillKeys[s.slot - 1]] ?? activeHero?.skills?.[s.slot] ?? 1)) / s.maxLvl) * 100))
                            : 0
                        }}%
                      </span>
                    </div>
                    <div class="w-full bg-slate-200/80 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all"
                        :class="
                          Number(activeHero?.skills?.[skillKeys[s.slot - 1]] ?? activeHero?.skills?.[s.slot] ?? 1) >= s.maxLvl
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        "
                        :style="{
                          width: `${
                            s.maxLvl > 0
                              ? Math.min(100, Math.round(((Number(activeHero?.skills?.[skillKeys[s.slot - 1]] ?? activeHero?.skills?.[s.slot] ?? 1)) / s.maxLvl) * 100))
                              : 0
                          }%`,
                        }"
                      ></div>
                    </div>
                  </template>
                  <div v-else class="text-2xs text-slate-400 italic">
                    🔒 Unlocks at rank {{ s.rankName }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Artifacts Section (if any) -->
          <div
            v-if="heroArtifacts.length > 0"
            class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-2"
          >
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>🛡️</span> Artifacts
            </h4>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div
                v-for="(art, aIdx) in heroArtifacts"
                :key="aIdx"
                class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
              >
                <div class="text-2xs text-slate-400 capitalize">
                  {{ art.artifactType ? art.artifactType.charAt(0).toUpperCase() + art.artifactType.slice(1) : 'Artifact' }}
                </div>
                <div class="font-bold text-slate-800 dark:text-slate-200">
                  Lv. {{ art.level || 1 }}
                </div>
                <div class="text-2xs text-amber-500">
                  {{ '★'.repeat(art.star || 1) }}
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Equipment Slots & Campaign Farm Section -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>🛡️</span> Equipment Slots
                </h4>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  6 equipment slots to advance Hero Rank/Color
                </div>
              </div>

              <button
                type="button"
                class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
                @click="handleFarmQuick"
              >
                <span>⚔️</span> Farm Equipment
              </button>
            </div>

            <!-- 6 Slots Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <div
                v-for="slot in equipmentSlots"
                :key="slot.slotNum"
                class="p-2.5 rounded-lg border text-xs flex flex-col justify-between gap-1.5 transition-all"
                :class="[
                  slot.isEquipped
                    ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                    : slot.statusKind === 'inventory'
                    ? 'border-sky-300 bg-sky-50/70 dark:border-sky-800 dark:bg-sky-950/30 hover:border-sky-400 cursor-pointer'
                    : slot.statusKind === 'readyToCraft'
                    ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30 hover:border-amber-400 cursor-pointer'
                    : slot.statusKind === 'incomplete'
                    ? 'border-dashed border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 hover:border-indigo-400 cursor-pointer'
                    : slot.statusKind === 'recipe'
                    ? 'border-dashed border-purple-200 bg-purple-50/30 dark:border-purple-900/30 dark:bg-purple-950/10 hover:border-indigo-400 cursor-pointer'
                    : 'border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer',
                ]"
                @click="openFarmForSlot(slot)"
              >
                <!-- Top Row: Slot #, Item Name, Status Badge -->
                <div class="flex items-center justify-between gap-1.5 min-w-0">
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      class="size-5 rounded-full flex items-center justify-center font-bold text-2xs shrink-0"
                      :class="
                        slot.isEquipped
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      "
                    >
                      {{ slot.slotNum }}
                    </span>
                    <span
                      class="font-bold truncate text-xs text-slate-800 dark:text-slate-100"
                      :title="slot.itemName"
                    >
                      {{ slot.itemName }}
                    </span>
                  </div>

                  <span
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-bold shrink-0"
                    :class="
                      slot.isEquipped
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                        : slot.statusKind === 'inventory'
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300'
                        : slot.statusKind === 'readyToCraft'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                        : slot.statusKind === 'incomplete'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : slot.statusKind === 'recipe'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    "
                  >
                    {{ slot.badgeHtml }}
                  </span>
                </div>

                <!-- SubText & Craft button if ready -->
                <div class="flex items-center justify-between gap-1 text-3xs">
                  <div
                    :class="{
                      'text-emerald-600 dark:text-emerald-400 font-medium': slot.isEquipped,
                      'text-sky-700 dark:text-sky-300 font-semibold': slot.statusKind === 'inventory',
                      'text-amber-700 dark:text-amber-300 font-semibold': slot.statusKind === 'readyToCraft',
                      'text-slate-500 dark:text-slate-400': slot.statusKind === 'incomplete',
                      'text-purple-600 dark:text-purple-400': slot.statusKind === 'recipe',
                      'text-slate-400 italic': slot.statusKind === 'missing',
                    }"
                  >
                    {{ slot.subText }}
                  </div>

                  <button
                    v-if="slot.canCraftNow"
                    type="button"
                    :disabled="isCrafting[slot.slotNum]"
                    class="px-2 py-0.5 rounded text-3xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                    @click.stop="handleCraft(slot)"
                  >
                    {{ isCrafting[slot.slotNum] ? '...' : 'Craft' }}
                  </button>
                  <button
                    v-else-if="slot.statusKind === 'inventory'"
                    type="button"
                    :disabled="isEquipping[slot.slotNum]"
                    class="px-2 py-0.5 rounded text-3xs font-bold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                    @click.stop="handleEquip(slot)"
                  >
                    {{ isEquipping[slot.slotNum] ? '...' : 'Equip' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
