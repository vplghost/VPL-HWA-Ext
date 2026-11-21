<script setup lang="ts">
import UnitStars from '@/src/components/common/UnitStars.vue';
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  isTopModal,
  registerModalOpen,
  registerModalClose,
  getModalStackLevel,
} from '@/src/composables/useModals';
import {
  getTitanMetadata,
  getTitanSoulProgress,
  starGlowClass,
  type TitanMeta,
} from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import { getGold } from '@/src/utils/resourceData';
import { getItemIcon } from '@/src/utils/itemResources';
import {
  calculateTitanArtifactEvolvePlan,
  type TitanArtifactChestOption,
} from '@/src/utils/titanArtifactChestHelper';
import {
  titanEvolutionCosts,
  calculateTitanLevelUpPlan,
  getTitanLevelFromExp,
} from '@/src/data/titanLevelData';
import {
  getTitanArtifactLevelCost,
  getTitanArtifactEvolveCost,
} from '@/src/data/titanMetadata';

const props = defineProps<{
  modelValue: boolean;
  titan?: any | null;
  titanId?: number | string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const internalTitanId = ref<string>('');

watch(
  [() => props.titan, () => props.titanId, () => props.modelValue],
  () => {
    if (props.titan?.id) {
      internalTitanId.value = String(props.titan.id);
    } else if (props.titanId) {
      internalTitanId.value = String(props.titanId);
    } else if (!internalTitanId.value) {
      const titansData = cache.value?.titanGetAll?.data || {};
      const firstId = Object.keys(titansData)[0];
      if (firstId) internalTitanId.value = firstId;
    }
  },
  { immediate: true }
);

const stackLevel = computed(() => getModalStackLevel('titan'));

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    if (!isTopModal('titan')) return;
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
    close();
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      registerModalOpen('titan');
      document.addEventListener('keydown', handleKeydown);
    } else {
      registerModalClose('titan');
      document.removeEventListener('keydown', handleKeydown);
    }
  }
);

onUnmounted(() => {
  registerModalClose('titan');
  document.removeEventListener('keydown', handleKeydown);
});

function getAssetUrl(file?: string): string {
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}

// All titans from cache for switcher
const availableTitans = computed(() => {
  const titansData = cache.value?.titanGetAll?.data || {};
  return Object.entries(titansData)
    .map(([id, t]: [string, any]) => {
      const meta = getTitanMetadata(id);
      return {
        id,
        name: meta?.name || `Titan #${id}`,
        element: meta?.element || 'Water',
        power: Number(t?.power) || 0,
      };
    })
    .sort((a, b) => b.power - a.power);
});

function handleTitanSwitch(event: Event) {
  const target = event.target as HTMLSelectElement;
  if (target?.value) {
    internalTitanId.value = target.value;
  }
}

// Active Titan resolution
const activeTitan = computed<any>(() => {
  const fromCache = cache.value?.titanGetAll?.data?.[internalTitanId.value];
  if (fromCache) return fromCache;
  if (props.titan && String(props.titan.id) === internalTitanId.value) {
    return props.titan;
  }
  return null;
});

const meta = computed<TitanMeta | undefined>(() => {
  return getTitanMetadata(internalTitanId.value);
});

const activeTitanName = computed(() => {
  return meta.value?.name || `Titan #${internalTitanId.value}`;
});

const starCount = computed(() => {
  return Number(activeTitan.value?.star) || 1;
});

const largeGlow = computed(() => {
  return starGlowClass(starCount.value, 'large');
});

// Element Styling
const ELEMENT_STYLES: Record<string, {
  badge: string;
  dot: string;
  gradient: string;
  border: string;
}> = {
  Water: {
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    dot: 'bg-sky-400',
    gradient: 'from-sky-500 to-blue-700',
    border: 'border-sky-300 dark:border-sky-800',
  },
  Fire: {
    badge: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
    gradient: 'from-amber-600 to-red-700',
    border: 'border-red-300 dark:border-red-800',
  },
  Earth: {
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    gradient: 'from-emerald-600 to-green-800',
    border: 'border-emerald-300 dark:border-emerald-800',
  },
  Light: {
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-300',
    gradient: 'from-amber-400 to-yellow-600',
    border: 'border-amber-300 dark:border-amber-800',
  },
  Darkness: {
    badge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    dot: 'bg-purple-400',
    gradient: 'from-purple-800 to-slate-900',
    border: 'border-purple-300 dark:border-purple-800',
  },
};

const elementStyle = computed(() => {
  const el = meta.value?.element || 'Water';
  return ELEMENT_STYLES[el] || ELEMENT_STYLES.Water;
});

// Resources (canonical single source of truth for gold)
const gold = computed(() => getGold(cache.value));

const fairyDust = computed(() => {
  return Number(cache.value?.inventoryGet?.data?.coin?.['18'] ?? cache.value?.['resource:coin:18']?.data?.amount ?? 0);
});

const titanPotions = computed(() => {
  return Number(cache.value?.inventoryGet?.data?.consumable?.['20'] ?? cache.value?.['resource:consumable:20']?.data?.amount ?? 0);
});

// Soul Stones Progress & Evolution
const soulProg = computed(() => {
  const inv = cache.value?.inventoryGet?.data;
  return getTitanSoulProgress(internalTitanId.value, activeTitan.value, inv);
});

const nextStarCost = computed(() => {
  const next = starCount.value + 1;
  return titanEvolutionCosts[next] || null;
});

const canEvolveStar = computed(() => {
  if (starCount.value >= 6) return false;
  if (!nextStarCost.value) return false;
  const hasFrags = soulProg.value.owned >= nextStarCost.value.fragments;
  const hasGold = gold.value >= nextStarCost.value.gold;
  return hasFrags && hasGold;
});

const isEvolvingStar = ref(false);

async function handleEvolveStar() {
  if (!activeTitan.value || !canEvolveStar.value || isEvolvingStar.value) return;
  const numTitanId = Number(internalTitanId.value);
  isEvolvingStar.value = true;
  try {
    await dispatchRpc([
      {
        name: 'titanEvolve',
        args: { titanId: numTitanId },
      },
      { name: 'titanGetAll' },
      { name: 'inventoryGet' },
      { name: 'userGetInfo' },
    ]);
  } catch (err) {
    console.error('Failed to evolve titan star:', err);
  } finally {
    isEvolvingStar.value = false;
  }
}

// Level Up with Potions
const titanCurrentLevel = computed(() => {
  return Number(activeTitan.value?.level) || 1;
});

const titanCurrentXp = computed(() => {
  return Number(activeTitan.value?.xp) || 0;
});

const xpLevelInfo = computed(() => {
  return getTitanLevelFromExp(titanCurrentXp.value);
});

const planPlus1 = computed(() => {
  return calculateTitanLevelUpPlan(
    titanCurrentLevel.value,
    titanCurrentXp.value,
    titanPotions.value,
    1
  );
});

const planPlus10 = computed(() => {
  return calculateTitanLevelUpPlan(
    titanCurrentLevel.value,
    titanCurrentXp.value,
    titanPotions.value,
    10
  );
});

const planMax = computed(() => {
  return calculateTitanLevelUpPlan(
    titanCurrentLevel.value,
    titanCurrentXp.value,
    titanPotions.value,
    120
  );
});

const isUpgradingLevel = ref(false);

async function handleLevelUp(potionsToUse: number) {
  if (!activeTitan.value || potionsToUse <= 0 || isUpgradingLevel.value) return;
  const numTitanId = Number(internalTitanId.value);
  isUpgradingLevel.value = true;
  try {
    await dispatchRpc([
      {
        name: 'inventory_use',
        args: {
          libId: 20,
          amount: potionsToUse,
          params: { unitId: numTitanId },
        },
      },
      { name: 'titanGetAll' },
      { name: 'inventoryGet' },
    ]);
  } catch (err) {
    console.error('Failed to level up titan:', err);
  } finally {
    isUpgradingLevel.value = false;
  }
}

// Artifacts
export interface TitanArtifactSlot {
  slotId: number;
  slotName: string;
  artifactId: number;
  level: number;
  star: number;
  dustCost: number;
  goldCost: number;
  canLevelUp: boolean;
  fragCost: number;
  ownedFrags: number;
  canEvolve: boolean;
  canEvolveDirectly: boolean;
  canEvolveWithChests: boolean;
  chestsPlan: TitanArtifactChestOption[];
  totalChestsToOpen: number;
  totalFragsFromChests: number;
  tooltip: string;
  buttonLabel: string;
  iconPath: string | null;
}

const detailedArtifacts = computed<TitanArtifactSlot[]>(() => {
  const titan = activeTitan.value;
  const rawList = Array.isArray(titan?.artifacts) ? titan.artifacts : [];
  const metaArtifacts = meta.value?.artifacts || [];
  const invFrags = cache.value?.inventoryGet?.data?.fragmentArtifact || {};

  const slotLabels = ['Weapon', 'Crown', 'Seal'];

  return slotLabels.map((slotName, slotId) => {
    const rawArt = rawList[slotId] || { level: 1, star: 1 };
    const artifactId = metaArtifacts[slotId] || (11000 + slotId * 1000);
    const level = Number(rawArt.level) || 1;
    const star = Number(rawArt.star) || 1;

    // Level cost
    const nextLvl = level + 1;
    const levelCost = nextLvl <= 120 ? getTitanArtifactLevelCost(nextLvl) : null;
    const dustCost = levelCost ? levelCost[0] : 0;
    const goldCostVal = levelCost ? levelCost[1] : 0;

    const canLevelUp =
      level < titanCurrentLevel.value &&
      level < 120 &&
      dustCost > 0 &&
      fairyDust.value >= dustCost &&
      gold.value >= goldCostVal;

    // Evolve cost
    const nextStar = star + 1;
    const fragCost = nextStar <= 6 ? (getTitanArtifactEvolveCost(nextStar) || 0) : 0;
    const ownedFrags = Number(invFrags[String(artifactId)]) || 0;
    const invConsumable = cache.value?.inventoryGet?.data?.consumable || {};
    const plan = calculateTitanArtifactEvolvePlan(artifactId, fragCost, ownedFrags, invConsumable, nextStar);
    const canEvolve = star < 6 && fragCost > 0 && (ownedFrags >= fragCost || plan.canEvolveWithChests);

    const iconPath = getItemIcon('artifact', artifactId) || getItemIcon('fragmentArtifact', artifactId);

    return {
      slotId,
      slotName,
      artifactId,
      level,
      star,
      dustCost,
      goldCost: goldCostVal,
      canLevelUp,
      fragCost,
      ownedFrags,
      canEvolve,
      canEvolveDirectly: plan.canEvolveDirectly,
      canEvolveWithChests: plan.canEvolveWithChests,
      chestsPlan: plan.chestsPlan,
      totalChestsToOpen: plan.totalChestsToOpen,
      totalFragsFromChests: plan.totalFragsFromChests,
      tooltip: plan.tooltipText,
      buttonLabel: plan.buttonLabel,
      iconPath,
    };
  });
});

const isUpgradingArtifact = ref<Record<number, boolean>>({});
const isEvolvingArtifact = ref<Record<number, boolean>>({});

async function handleArtifactLevelUp(slotId: number, artifactId: number) {
  if (!activeTitan.value || isUpgradingArtifact.value[slotId]) return;
  const numTitanId = Number(internalTitanId.value);
  isUpgradingArtifact.value[slotId] = true;
  try {
    await dispatchRpc([
      {
        name: 'artifact_LevelUpCost',
        args: { unitId: numTitanId, artifactId },
      },
      { name: 'titanGetAll' },
      { name: 'inventoryGet' },
      { name: 'userGetInfo' },
    ]);
  } catch (err) {
    console.error('Failed to upgrade titan artifact level:', err);
  } finally {
    isUpgradingArtifact.value[slotId] = false;
  }
}

async function handleArtifactEvolve(slotId: number) {
  if (!activeTitan.value || isEvolvingArtifact.value[slotId]) return;
  const numTitanId = Number(internalTitanId.value);
  const art = detailedArtifacts.value[slotId];
  if (!art || !art.canEvolve) return;

  isEvolvingArtifact.value[slotId] = true;
  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [];

    if (art.chestsPlan && art.chestsPlan.length > 0) {
      for (const item of art.chestsPlan) {
        if (item.countToOpen > 0) {
          calls.push({
            name: 'inventory_use',
            args: {
              libId: Number(item.chestId),
              amount: item.countToOpen,
              params: { choice: item.choiceIndex },
            },
          });
        }
      }
    }

    calls.push({
      name: 'artifact_evolve',
      args: { heroId: numTitanId, slotId },
    });
    calls.push({ name: 'titanGetAll' });
    calls.push({ name: 'inventoryGet' });

    await dispatchRpc(calls);
  } catch (err) {
    console.error('Failed to evolve titan artifact star:', err);
  } finally {
    isEvolvingArtifact.value[slotId] = false;
  }
}

// Skins
export interface TitanSkinItem {
  skinId: string;
  name: string;
  level: number;
}

const detailedSkins = computed<TitanSkinItem[]>(() => {
  const titan = activeTitan.value;
  const skinsObj = titan?.skins || {};
  const entries = Object.entries(skinsObj);

  if (entries.length === 0) {
    const defaultId = String(titan?.currentSkin || 10001);
    return [
      {
        skinId: defaultId,
        name: 'Default Skin',
        level: 1,
      },
    ];
  }

  return entries.map(([sId, lvl], idx) => {
    let name = idx === 0 ? 'Default Skin' : `Skin #${sId}`;
    if (idx === 1) name = 'Champion Skin';
    else if (idx === 2) name = 'Primordial Skin';
    return {
      skinId: sId,
      name,
      level: Number(lvl) || 1,
    };
  });
});

const isUpgradingSkin = ref<Record<string, boolean>>({});

async function handleSkinUpgrade(skinId: string) {
  if (!activeTitan.value || isUpgradingSkin.value[skinId]) return;
  const numTitanId = Number(internalTitanId.value);
  const numSkinId = Number(skinId);
  isUpgradingSkin.value[skinId] = true;
  try {
    await dispatchRpc([
      {
        name: 'skin_upgrade',
        args: { unitId: numTitanId, skinId: numSkinId },
      },
      { name: 'titanGetAll' },
      { name: 'inventoryGet' },
    ]);
  } catch (err) {
    console.error('Failed to upgrade titan skin:', err);
  } finally {
    isUpgradingSkin.value[skinId] = false;
  }
}

// Skills
const skillsList = computed(() => {
  return meta.value?.skills || ['Titan Strike'];
});
</script>

<template>
  <div
    v-if="modelValue"
    id="titan-dialog"
    class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 transition-opacity"
    :style="{ zIndex: stackLevel }"
    @click.self="close"
  >
    <div
      class="w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Dialog Header -->
      <div
        id="titan-dialog-header"
        class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50"
      >
        <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <!-- Element Dot & Title -->
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="size-2.5 rounded-full" :class="elementStyle.dot"></span>
            <span class="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Titan Details
            </span>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            <!-- Titan ID Badge -->
            <span
              v-if="internalTitanId"
              class="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0"
            >
              #{{ internalTitanId }}
            </span>

            <!-- Element Badge -->
            <span
              class="inline-flex items-center px-2 py-0.5 rounded text-2xs font-bold border shrink-0"
              :class="elementStyle.badge"
            >
              {{ meta?.element || 'Titan' }}
            </span>

            <!-- Power Badge -->
            <span
              v-if="activeTitan?.power"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 shrink-0"
            >
              ⚡ {{ formatNumber(activeTitan.power) }}
            </span>

            <!-- Titan Switcher -->
            <select
              v-if="availableTitans.length > 1"
              id="titan-dialog-switcher"
              :value="internalTitanId"
              class="h-6 rounded border border-slate-300 bg-white px-1.5 text-2xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-hidden"
              @change="handleTitanSwitch($event)"
            >
              <option v-for="t in availableTitans" :key="t.id" :value="t.id">
                {{ t.name }} ({{ formatNumber(t.power) }})
              </option>
            </select>
          </div>
        </div>

        <button
          type="button"
          autofocus
          aria-label="Close Titan dialog"
          class="cursor-pointer rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 text-base"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- Dialog Body -->
      <div id="titan-dialog-body" class="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh_-_60px)]">
        <!-- Titan Not Found -->
        <div
          v-if="!activeTitan"
          class="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400"
        >
          <span class="text-xl">⚠️</span>
          <div>
            <div class="font-semibold text-slate-700 dark:text-slate-300">Titan not found</div>
            <div>This titan data has not been captured yet. Use "Refresh Titans" to update snapshots.</div>
          </div>
        </div>

        <template v-else>
          <!-- 1. Titan Overview Header Card -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
            <div class="flex items-start gap-4 flex-wrap sm:flex-nowrap">
              <!-- Avatar block -->
              <div class="flex flex-col items-center gap-1.5 shrink-0">
                <img
                  v-if="meta?.avatarFile"
                  :src="getAssetUrl(meta.avatarFile)"
                  :alt="activeTitanName"
                  class="size-16 rounded-xl object-cover shrink-0 border"
                  :class="largeGlow"
                />
                <span
                  v-else
                  class="inline-flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl font-bold text-white border"
                  :class="[elementStyle.gradient, largeGlow]"
                >
                  {{ activeTitanName.charAt(0).toUpperCase() }}
                </span>

                <!-- Star Icons -->
                <UnitStars :count="starCount" class="text-xs" />
              </div>

              <!-- Info details block -->
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
                    {{ activeTitanName }}
                  </h3>
                  <span
                    v-if="meta?.role"
                    class="px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  >
                    {{ meta.role }}
                  </span>
                  <span
                    class="px-1.5 py-0.5 rounded text-2xs font-bold border"
                    :class="elementStyle.badge"
                  >
                    {{ meta?.element || 'Titan' }}
                  </span>
                </div>

                <!-- Key stats chips -->
                <div class="flex items-center gap-3 flex-wrap text-xs">
                  <span class="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                    <span class="text-slate-400 font-normal">Level:</span> {{ titanCurrentLevel }} / 120
                  </span>
                  <span class="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
                    <span class="text-slate-400 font-normal">Power:</span> ⚡ {{ formatNumber(activeTitan.power || 0) }}
                  </span>
                </div>

                <!-- Soul Stones Progress & Evolution -->
                <div class="pt-1 space-y-1.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-slate-500 dark:text-slate-400 font-medium">Soul Stones Progress:</span>
                    <span
                      class="font-mono font-bold"
                      :class="canEvolveStar ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'"
                    >
                      {{ formatNumber(soulProg.owned) }} / {{ typeof soulProg.needed === 'number' ? formatNumber(soulProg.needed) : soulProg.needed }}
                    </span>
                  </div>

                  <div class="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-300"
                      :class="canEvolveStar ? 'bg-emerald-500' : 'bg-blue-500'"
                      :style="{
                        width: `${typeof soulProg.needed === 'number' && soulProg.needed > 0 ? Math.min(100, (soulProg.owned / soulProg.needed) * 100) : 100}%`
                      }"
                    ></div>
                  </div>

                  <!-- Evolve Star Action Button -->
                  <div v-if="starCount < 6" class="flex items-center justify-between pt-1">
                    <span class="text-2xs text-slate-500 dark:text-slate-400">
                      Next Star: <span class="font-bold text-slate-700 dark:text-slate-300">{{ starCount + 1 }} ⭐</span>
                      <template v-if="nextStarCost">
                        ({{ formatNumber(nextStarCost.fragments) }} frags + {{ formatNumber(nextStarCost.gold) }} gold)
                      </template>
                    </span>

                    <button
                      id="btn-titan-evolve-star"
                      type="button"
                      :disabled="!canEvolveStar || isEvolvingStar"
                      class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      :class="canEvolveStar ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'"
                      @click="handleEvolveStar"
                    >
                      <span v-if="isEvolvingStar" class="animate-spin">🔄</span>
                      <span v-else>✨</span>
                      <span>Evolve Star</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Level Up with Titan Potions Section -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="text-base">🧪</span>
                <h4 class="font-bold text-slate-900 dark:text-slate-100 text-xs">
                  Titan Level & Potions
                </h4>
              </div>

              <!-- Available Potions Badge -->
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-xs font-semibold text-teal-700 dark:text-teal-300">
                <img
                  :src="getAssetUrl('assets/items/consumable/20.png')"
                  alt="Potion"
                  class="size-4 object-contain inline-block"
                />
                <span>{{ formatNumber(titanPotions) }} potions available</span>
              </div>
            </div>

            <!-- XP Progress Bar -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400">
                <span>XP to Level {{ Math.min(120, titanCurrentLevel + 1) }}:</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {{ formatNumber(xpLevelInfo.currentLevelXp) }} / {{ formatNumber(xpLevelInfo.nextLevelExpNeeded) }}
                </span>
              </div>
              <div class="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-teal-500 rounded-full transition-all duration-300"
                  :style="{
                    width: `${xpLevelInfo.nextLevelExpNeeded > 0 ? Math.min(100, (xpLevelInfo.currentLevelXp / xpLevelInfo.nextLevelExpNeeded) * 100) : 100}%`
                  }"
                ></div>
              </div>
            </div>

            <!-- Level Up Action Buttons -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <!-- +1 Level -->
              <button
                id="btn-titan-levelup-1"
                type="button"
                :disabled="!planPlus1.canLevelUp || isUpgradingLevel"
                class="cursor-pointer flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :class="planPlus1.canLevelUp ? 'bg-teal-50 hover:bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-200' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800/40 dark:border-slate-700'"
                @click="handleLevelUp(planPlus1.potionsNeeded)"
              >
                <span class="font-bold">+1 Level</span>
                <span class="text-3xs text-slate-500 dark:text-slate-400">
                  {{ formatNumber(planPlus1.potionsNeeded) }} potions
                </span>
              </button>

              <!-- +10 Levels -->
              <button
                id="btn-titan-levelup-10"
                type="button"
                :disabled="!planPlus10.canLevelUp || isUpgradingLevel"
                class="cursor-pointer flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :class="planPlus10.canLevelUp ? 'bg-teal-50 hover:bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-200' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800/40 dark:border-slate-700'"
                @click="handleLevelUp(planPlus10.potionsNeeded)"
              >
                <span class="font-bold">+10 Levels (Lvl {{ planPlus10.targetLevel }})</span>
                <span class="text-3xs text-slate-500 dark:text-slate-400">
                  {{ formatNumber(planPlus10.potionsNeeded) }} potions
                </span>
              </button>

              <!-- Max Level -->
              <button
                id="btn-titan-levelup-max"
                type="button"
                :disabled="!planMax.canLevelUp || isUpgradingLevel"
                class="cursor-pointer flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                :class="planMax.canLevelUp ? 'bg-teal-600 hover:bg-teal-700 border-teal-600 text-white shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800/40 dark:border-slate-700'"
                @click="handleLevelUp(planMax.potionsNeeded)"
              >
                <span class="font-bold">Max Level (Lvl {{ planMax.targetLevel }})</span>
                <span class="text-3xs" :class="planMax.canLevelUp ? 'text-teal-100' : 'text-slate-400'">
                  {{ formatNumber(planMax.potionsNeeded) }} potions
                </span>
              </button>
            </div>
          </div>

          <!-- 3. Titan Artifacts Section -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="text-base">🏺</span>
                <h4 class="font-bold text-slate-900 dark:text-slate-100 text-xs">
                  Titan Artifacts
                </h4>
              </div>

              <!-- Currency chips -->
              <div class="flex items-center gap-2 flex-wrap text-2xs">
                <!-- Fairy Dust -->
                <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 font-semibold text-amber-700 dark:text-amber-300">
                  <img
                    :src="getAssetUrl('assets/items/coin/18.png')"
                    alt="Dust"
                    class="size-3.5 object-contain inline-block"
                  />
                  <span>Dust: {{ formatNumber(fairyDust) }}</span>
                </div>
                <!-- Gold -->
                <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800/60 font-semibold text-yellow-700 dark:text-yellow-300">
                  <span>🪙</span>
                  <span>Gold: {{ formatNumber(gold) }}</span>
                </div>
              </div>
            </div>

            <!-- 3 Artifact Cards Grid -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                v-for="art in detailedArtifacts"
                :key="art.slotId"
                class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3 space-y-2.5 flex flex-col justify-between"
              >
                <!-- Top Art Info -->
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <img
                      v-if="art.iconPath"
                      :src="getAssetUrl(art.iconPath)"
                      :alt="art.slotName"
                      class="size-9 rounded-lg object-contain bg-white dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {{ art.slotName }}
                      </div>
                      <div class="text-3xs font-mono text-slate-400">
                        #{{ art.artifactId }}
                      </div>
                    </div>
                  </div>

                  <!-- Level and Stars -->
                  <div class="flex items-center justify-between text-2xs pt-0.5">
                    <span class="font-bold text-slate-700 dark:text-slate-300">
                      Lvl {{ art.level }} <span class="text-slate-400 font-normal">/ {{ titanCurrentLevel }}</span>
                    </span>
                    <UnitStars :count="art.star" class="text-3xs" />
                  </div>
                </div>

                <!-- Level Up Button & Cost -->
                <div class="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1">
                  <div class="flex items-center justify-between text-3xs text-slate-500 dark:text-slate-400">
                    <span>Level Up Cost:</span>
                    <span class="font-mono">
                      {{ formatNumber(art.dustCost) }} dust • {{ formatNumber(art.goldCost) }} gold
                    </span>
                  </div>

                  <button
                    :id="`btn-titan-art-lvl-${art.slotId}`"
                    type="button"
                    :disabled="!art.canLevelUp || isUpgradingArtifact[art.slotId]"
                    class="cursor-pointer w-full py-1 rounded text-2xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    :class="art.canLevelUp ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-2xs' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'"
                    @click="handleArtifactLevelUp(art.slotId, art.artifactId)"
                  >
                    <span v-if="isUpgradingArtifact[art.slotId]" class="animate-spin inline-block">🔄</span>
                    <span>+1 Level</span>
                  </button>
                </div>

                <!-- Star Evolve Button & Cost -->
                <div v-if="art.star < 6" class="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1">
                  <div class="flex items-center justify-between text-3xs text-slate-500 dark:text-slate-400">
                    <span>Frags:</span>
                    <span
                      class="font-mono font-bold"
                      :class="art.canEvolve ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'"
                      :title="art.tooltip"
                    >
                      {{ formatNumber(art.ownedFrags) }} / {{ formatNumber(art.fragCost) }}
                      <span v-if="art.totalFragsFromChests > 0" class="text-purple-600 dark:text-purple-400 font-normal">
                        (+{{ art.totalFragsFromChests }})
                      </span>
                    </span>
                  </div>

                  <button
                    :id="`btn-titan-art-evolve-${art.slotId}`"
                    type="button"
                    :disabled="!art.canEvolve || isEvolvingArtifact[art.slotId]"
                    class="cursor-pointer w-full py-1 rounded text-2xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed select-none"
                    :class="art.canEvolve ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-2xs' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'"
                    :title="art.tooltip"
                    @click="handleArtifactEvolve(art.slotId)"
                  >
                    <span v-if="isEvolvingArtifact[art.slotId]" class="animate-spin inline-block">🔄</span>
                    <span>{{ art.buttonLabel }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Titan Skins Section -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-base">🥋</span>
                <h4 class="font-bold text-slate-900 dark:text-slate-100 text-xs">
                  Titan Skins
                </h4>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div
                v-for="skin in detailedSkins"
                :key="skin.skinId"
                class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 flex items-center justify-between gap-2"
              >
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {{ skin.name }}
                  </div>
                  <div class="text-2xs text-slate-500 dark:text-slate-400">
                    Level: <span class="font-bold text-slate-700 dark:text-slate-300">{{ skin.level }} / 60</span>
                  </div>
                </div>

                <button
                  :id="`btn-titan-skin-upgrade-${skin.skinId}`"
                  type="button"
                  :disabled="skin.level >= 60 || isUpgradingSkin[skin.skinId]"
                  class="cursor-pointer px-2.5 py-1 rounded text-2xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white shadow-2xs shrink-0"
                  @click="handleSkinUpgrade(skin.skinId)"
                >
                  <span v-if="isUpgradingSkin[skin.skinId]" class="animate-spin inline-block">🔄</span>
                  <span>+1 Upgrade</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 5. Titan Skills Section -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-base">⚡</span>
              <h4 class="font-bold text-slate-900 dark:text-slate-100 text-xs">
                Titan Skills
              </h4>
            </div>

            <div class="space-y-2">
              <div
                v-for="(skillName, idx) in skillsList"
                :key="idx"
                class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 flex items-center justify-between gap-3"
              >
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <span class="text-base shrink-0">✨</span>
                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {{ skillName }}
                    </div>
                    <div class="text-3xs text-slate-500 dark:text-slate-400">
                      Passive/Active Elemental Titan Ability
                    </div>
                  </div>
                </div>

                <span class="px-2 py-0.5 rounded text-2xs font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 shrink-0">
                  Lvl {{ titanCurrentLevel }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
