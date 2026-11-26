<script setup lang="ts">
import UnitStars from '@/src/components/common/UnitStars.vue';
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import {
  useModals,
  isTopModal,
  registerModalOpen,
  registerModalClose,
  getModalStackLevel,
} from '@/src/composables/useModals';
import {
  getHeroMetadata,
  getHeroName,
  getHeroEquipmentRank,
  getHeroSoulProgress,
  getItemName,
  getGearCraftData,
  starGlowClass,
} from '@/src/utils/metadata';
import { formatNumber, formatCompactMillion } from '@/src/utils/formatters';
import { getSkillPoints, getSkillPointsCap, getGold } from '@/src/utils/resourceData';
import pickerData from '@/src/data/campaign-picker.json';
import { getHeroSoulMissions } from '@/src/data/campaignData';
import {
  getArtifactUpgradePlan,
  type ArtifactUpgradePlan,
} from '@/src/utils/artifactHelper';
import {
  HERO_RESOURCE_IDS,
  getHeroEvolveStatus,
  planHeroXpPotions,
  buildXpPotionInventoryUseCalls,
  getHeroXpPotionInventory,
  getHeroSparkStatus,
  getArtifactEvolveStatus,
  extractHeroGlyphsAndTalisman,
} from '@/src/services/heroUpgradeService';
import {
  getHeroSkinsDetailed,
  getHeroMainStat,
  getSkinStoneInfo,
  type HeroSkinDetailedItem,
} from '@/src/utils/skinHelper';

const props = defineProps<{
  modelValue: boolean;
  hero?: any | null;
  heroId?: number | string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'openCampaign', gearId: number | string | null): void;
  (e: 'openCampaignHero', heroId: number | string | null): void;
  (e: 'openCampaignSoul', heroId: number | string | null): void;
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

const stackLevel = computed(() => getModalStackLevel('hero'));

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    if (!isTopModal('hero')) return;
    e.stopPropagation?.();
    e.stopImmediatePropagation?.();
    close();
  }
}

const now = ref(Date.now());
let nowTimer: any = null;

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      now.value = Date.now();
      if (!nowTimer) {
        nowTimer = setInterval(() => {
          now.value = Date.now();
        }, 1000);
      }
      registerModalOpen('hero');
      document.addEventListener('keydown', handleKeydown);
    } else {
      if (nowTimer) {
        clearInterval(nowTimer);
        nowTimer = null;
      }
      registerModalClose('hero');
      document.removeEventListener('keydown', handleKeydown);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
  registerModalClose('hero');
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

const canFarmSoulStones = computed(() => {
  if (!currentHeroId.value) return false;
  return getHeroSoulMissions(currentHeroId.value, pickerData?.missions).length > 0;
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
  dotColor: string;
  accentBorder: string;
  delta: number;
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
    dotColor: 'bg-slate-400 dark:bg-slate-500',
    accentBorder: 'border-l-[3px] border-l-slate-400 dark:border-l-slate-500',
    delta: 0,
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
    dotColor: 'bg-emerald-500',
    accentBorder: 'border-l-[3px] border-l-emerald-500',
    delta: 0,
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
    dotColor: 'bg-sky-500',
    accentBorder: 'border-l-[3px] border-l-sky-500',
    delta: 20,
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
    dotColor: 'bg-purple-500',
    accentBorder: 'border-l-[3px] border-l-purple-500',
    delta: 40,
    maxLvl: Math.max(0, heroLevel.value - 40),
  },
]);

function getSkillDisplayLevel(s: SkillSlotConfig): number {
  const skillKey = skillKeys.value[s.slot - 1];
  const rawLvl = Number((skillKey == null ? undefined : activeHero.value?.skills?.[skillKey]) ?? activeHero.value?.skills?.[s.slot] ?? 1);
  return Math.max(1, rawLvl - s.delta);
}

function isSkillMax(s: SkillSlotConfig): boolean {
  if (s.maxLvl <= 0) return false;
  return getSkillDisplayLevel(s) >= s.maxLvl;
}

function getSkillProgressPercent(s: SkillSlotConfig): number {
  if (s.maxLvl <= 0) return 0;
  return Math.min(100, Math.round((getSkillDisplayLevel(s) / s.maxLvl) * 100));
}

const upgradingSkills = ref<Record<number, boolean>>({});
const upgradingSkillAction = ref<Record<number, 'single' | 'max' | null>>({});
const isUpgradingSkills = ref(false);
const isUpgradingAllSkills = ref(false);

// Available skill points and gold (canonical single source of truth)
const skillPoints = computed(() => getSkillPoints(cache.value, now.value));
const skillPointsCap = computed(() => getSkillPointsCap(cache.value));
const currentGold = computed(() => getGold(cache.value));

function getSkillPointsNeeded(s: SkillSlotConfig): number {
  if (!activeHero.value) return 0;
  const isUnlocked = heroColor.value >= s.rankReq || s.slot <= skillKeys.value.length;
  if (!isUnlocked || s.maxLvl <= 0) return 0;
  return Math.max(0, s.maxLvl - getSkillDisplayLevel(s));
}

function getSkillMaxAddable(s: SkillSlotConfig): number {
  const needed = getSkillPointsNeeded(s);
  return Math.min(skillPoints.value, needed);
}

const totalSkillPointsNeeded = computed(() => {
  return skillSlots.value.reduce((sum, s) => sum + getSkillPointsNeeded(s), 0);
});

const totalSkillMaxAddable = computed(() => {
  return Math.min(skillPoints.value, totalSkillPointsNeeded.value);
});

// Free skill points via video refill (refillable ID 55)
const isClaimingFreeSkillPoints = ref(false);

const hasFreeSkillPoints = computed(() => {
  const quota = cache.value?.['resource:refillable:55'];
  const fromUser = cache.value?.userGetInfo?.data?.refillable?.find((r: any) => r?.id === 55);
  const amount = quota?.data?.amount ?? fromUser?.amount;
  const lastRefill = quota?.data?.lastRefillAt
    ? quota.data.lastRefillAt / 1000
    : fromUser?.lastRefill;

  if (Number.isFinite(amount)) {
    if (amount > 0) return true;
    if (Number.isFinite(lastRefill)) {
      // 28800 seconds = 8 hours
      return Date.now() >= lastRefill * 1000 + 28800000;
    }
    return false;
  }
  return false;
});

async function claimFreeSkillPoints() {
  if (isClaimingFreeSkillPoints.value || isUpgradingSkills.value || skillPoints.value >= skillPointsCap.value) return;
  isClaimingFreeSkillPoints.value = true;

  try {
    await dispatchRpc([
      {
        name: 'refillable_skillpointsUseVideo',
        args: { type: 'skill_points' },
      },
      { name: 'userGetInfo' },
      { name: 'inventoryGet' },
    ]);
  } finally {
    isClaimingFreeSkillPoints.value = false;
  }
}

async function upgradeSkill(s: SkillSlotConfig) {
  if (!activeHero.value || isUpgradingSkills.value || upgradingSkills.value[s.slot]) return;
  const numId = Number(currentHeroId.value);
  if (skillPoints.value <= 0 || isSkillMax(s)) return;
  isUpgradingSkills.value = true;
  upgradingSkills.value[s.slot] = true;
  upgradingSkillAction.value[s.slot] = 'single';

  // Display only server-observed skill levels, including queued/rejected RPCs.
  try {
    await dispatchRpc([
      {
        name: 'heroUpgradeSkill',
        args: { heroId: numId, skill: s.slot },
      },
      { name: 'heroGetAll' },
      { name: 'inventoryGet' },
      { name: 'userGetInfo' },
    ]);
  } finally {
    upgradingSkills.value[s.slot] = false;
    upgradingSkillAction.value[s.slot] = null;
    isUpgradingSkills.value = false;
  }
}

async function upgradeSkillMax(s: SkillSlotConfig) {
  if (!activeHero.value || isUpgradingSkills.value || upgradingSkills.value[s.slot]) return;
  const numId = Number(currentHeroId.value);
  const count = getSkillMaxAddable(s);
  if (count <= 0) return;

  isUpgradingSkills.value = true;
  upgradingSkills.value[s.slot] = true;
  upgradingSkillAction.value[s.slot] = 'max';

  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [];
    for (let i = 0; i < count; i++) {
      calls.push({
        name: 'heroUpgradeSkill',
        args: { heroId: numId, skill: s.slot },
      });
    }
    calls.push({ name: 'heroGetAll' });
    calls.push({ name: 'inventoryGet' });
    calls.push({ name: 'userGetInfo' });

    await dispatchRpc(calls);
  } finally {
    upgradingSkills.value[s.slot] = false;
    upgradingSkillAction.value[s.slot] = null;
    isUpgradingSkills.value = false;
  }
}

async function upgradeAllSkillsMax() {
  if (!activeHero.value || isUpgradingSkills.value || isUpgradingAllSkills.value) return;
  const numId = Number(currentHeroId.value);
  let available = skillPoints.value;
  if (available <= 0) return;

  const calls: Array<{ name: string; args?: any; feature?: string }> = [];
  for (const s of skillSlots.value) {
    if (available <= 0) break;
    const needed = getSkillPointsNeeded(s);
    if (needed > 0) {
      const toAdd = Math.min(available, needed);
      for (let i = 0; i < toAdd; i++) {
        calls.push({
          name: 'heroUpgradeSkill',
          args: { heroId: numId, skill: s.slot },
        });
      }
      available -= toAdd;
    }
  }

  if (calls.length === 0) return;

  isUpgradingSkills.value = true;
  isUpgradingAllSkills.value = true;
  try {
    calls.push({ name: 'heroGetAll' });
    calls.push({ name: 'inventoryGet' });
    calls.push({ name: 'userGetInfo' });

    await dispatchRpc(calls);
  } finally {
    isUpgradingAllSkills.value = false;
    isUpgradingSkills.value = false;
  }
}

// Artifacts
const heroArtifacts = computed(() => {
  return Array.isArray(activeHero.value?.artifacts) ? activeHero.value.artifacts : [];
});

const isUpgradingArtifact = ref(false);
const upgradingArtifactSlot = ref<number | null>(null);
const upgradingArtifactAction = ref<'single' | 'milestone' | 'chest' | null>(null);

const inventoryConsumables = computed<Record<string | number, number>>(() => {
  return cache.value?.inventoryGet?.data?.consumable || {};
});

export interface ArtifactSlotInfo {
  slotId: number;
  artifactType: string;
  name: string;
  level: number;
  star: number;
  plan: ArtifactUpgradePlan;
}

const detailedArtifacts = computed<ArtifactSlotInfo[]>(() => {
  const list = heroArtifacts.value;
  return list.map((art: any, idx: number) => {
    const slotId = idx;
    const type = art.artifactType || (slotId === 0 ? 'weapon' : slotId === 1 ? 'book' : 'ring');
    const level = Number(art.level) || 1;
    const star = Number(art.star) || 1;
    const plan = getArtifactUpgradePlan(type, level, inventoryConsumables.value);
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);

    return {
      slotId,
      artifactType: type,
      name: typeName,
      level,
      star,
      plan,
    };
  });
});

async function upgradeArtifactSingle(slotId: number) {
  if (isUpgradingArtifact.value || !activeHero.value) return;
  const numHeroId = Number(currentHeroId.value);
  if (!numHeroId) return;

  const artInfo = detailedArtifacts.value.find((a) => a.slotId === slotId);
  if (!artInfo || !artInfo.plan.canUpgradeOne) return;

  isUpgradingArtifact.value = true;
  upgradingArtifactSlot.value = slotId;
  upgradingArtifactAction.value = 'single';
  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [
      {
        name: 'artifact_levelUp',
        args: { heroId: numHeroId, slotId },
      },
      { name: 'heroGetAll' },
      { name: 'inventoryGet' },
      { name: 'userGetInfo' },
    ];
    await dispatchRpc(calls);
  } finally {
    upgradingArtifactSlot.value = null;
    upgradingArtifactAction.value = null;
    isUpgradingArtifact.value = false;
  }
}

async function upgradeArtifactToMilestone(slotId: number) {
  if (isUpgradingArtifact.value || !activeHero.value) return;
  const numHeroId = Number(currentHeroId.value);
  if (!numHeroId) return;

  const artInfo = detailedArtifacts.value.find((a) => a.slotId === slotId);
  if (!artInfo) return;

  const toAdd = artInfo.plan.milestoneLevels;
  if (toAdd <= 0) return;

  isUpgradingArtifact.value = true;
  upgradingArtifactSlot.value = slotId;
  upgradingArtifactAction.value = 'milestone';
  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [];
    for (let i = 0; i < toAdd; i++) {
      calls.push({
        name: 'artifact_levelUp',
        args: { heroId: numHeroId, slotId },
      });
    }
    calls.push({ name: 'heroGetAll' });
    calls.push({ name: 'inventoryGet' });
    calls.push({ name: 'userGetInfo' });

    await dispatchRpc(calls);
  } finally {
    upgradingArtifactSlot.value = null;
    upgradingArtifactAction.value = null;
    isUpgradingArtifact.value = false;
  }
}

async function upgradeArtifactWithChests(slotId: number) {
  if (isUpgradingArtifact.value || !activeHero.value) return;
  const numHeroId = Number(currentHeroId.value);
  if (!numHeroId) return;

  const artInfo = detailedArtifacts.value.find((a) => a.slotId === slotId);
  if (!artInfo || !artInfo.plan.chestPlan.canUpgradeWithChests) return;

  const { chestId, choiceIndex, chestsToOpen, levelsDeltaWithChests } = artInfo.plan.chestPlan;
  if (levelsDeltaWithChests <= 0) return;

  isUpgradingArtifact.value = true;
  upgradingArtifactSlot.value = slotId;
  upgradingArtifactAction.value = 'chest';
  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [];

    // 1. Open chests if needed
    if (chestsToOpen > 0) {
      calls.push({
        name: 'inventory_use',
        args: {
          libId: chestId,
          amount: chestsToOpen,
          params: { choice: choiceIndex }
        }
      });
    }

    // 2. Perform artifact level ups
    for (let i = 0; i < levelsDeltaWithChests; i++) {
      calls.push({
        name: 'artifact_levelUp',
        args: { heroId: numHeroId, slotId }
      });
    }

    // 3. Sync state
    calls.push({ name: 'heroGetAll' });
    calls.push({ name: 'inventoryGet' });
    calls.push({ name: 'userGetInfo' });

    await dispatchRpc(calls);
  } finally {
    upgradingArtifactSlot.value = null;
    upgradingArtifactAction.value = null;
    isUpgradingArtifact.value = false;
  }
}

// Skins
function getAssetUrl(file?: string): string {
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
}

const inventoryCoins = computed<Record<string | number, number>>(() => {
  return cache.value?.inventoryGet?.data?.coin || cache.value?.userGetInfo?.data?.coin || {};
});

const heroMainStat = computed(() => getHeroMainStat(currentHeroId.value));
const skinStoneInfo = computed(() => getSkinStoneInfo(heroMainStat.value));
const ownedSkinStones = computed(() => Number(inventoryCoins.value?.[skinStoneInfo.value.coinId]) || 0);
const ownedLargeSkinChests = computed(() => Number(inventoryConsumables.value?.[65]) || 0);
const ownedSmallSkinChests = computed(() => Number(inventoryConsumables.value?.[51]) || 0);

const detailedSkins = computed<HeroSkinDetailedItem[]>(() => {
  return getHeroSkinsDetailed(
    currentHeroId.value,
    activeHero.value,
    inventoryCoins.value,
    inventoryConsumables.value
  );
});

const isUpgradingSkin = ref(false);
const upgradingSkinId = ref<number | null>(null);
const upgradingSkinAction = ref<'single' | 'ten' | 'tenPlus10' | null>(null);
const skinActionError = ref<string | null>(null);

async function upgradeSkin(skin: HeroSkinDetailedItem, targetLevel: number, actionType: 'single' | 'ten' | 'tenPlus10') {
  if (isUpgradingSkin.value || !activeHero.value) return;
  const numHeroId = Number(currentHeroId.value);
  if (!numHeroId) return;

  const plan = actionType === 'single'
    ? skin.plan?.singlePlan
    : actionType === 'ten'
    ? skin.plan?.nextTenPlan
    : skin.plan?.nextTenPlus10Plan;

  if (!plan?.canAfford || targetLevel <= skin.level) return;

  const delta = targetLevel - skin.level;
  if (delta <= 0) return;

  const sId = skin.skinId ?? skin.id;
  isUpgradingSkin.value = true;
  upgradingSkinId.value = sId;
  upgradingSkinAction.value = actionType;
  skinActionError.value = null;

  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [];

    // 1. Open chests if needed
    if (plan.openChests && plan.openChests.length > 0) {
      for (const chest of plan.openChests) {
        if (chest.amount > 0) {
          calls.push({
            name: 'inventory_use',
            args: {
              libId: chest.libId,
              amount: chest.amount,
              params: { choice: chest.choiceIndex }
            }
          });
        }
      }
    } else {
      if (plan.openLargeCount > 0) {
        calls.push({
          name: 'inventory_use',
          args: {
            libId: 65,
            amount: plan.openLargeCount,
            params: { choice: plan.choiceIndex }
          }
        });
      }
      if (plan.openSmallCount > 0) {
        calls.push({
          name: 'inventory_use',
          args: {
            libId: 51,
            amount: plan.openSmallCount,
            params: { choice: plan.choiceIndex }
          }
        });
      }
    }

    // 2. Upgrade skin levels
    for (let i = 0; i < delta; i++) {
      calls.push({
        name: 'skin_upgrade',
        args: { unitId: numHeroId, skinId: sId }
      });
    }

    // 3. Synchronize state
    calls.push({ name: 'heroGetAll' });
    calls.push({ name: 'inventoryGet' });
    calls.push({ name: 'userGetInfo' });

    await dispatchRpc(calls);
  } catch (err: any) {
    console.error('Failed to upgrade hero skin:', err);
    skinActionError.value = err?.message || 'Failed to upgrade hero skin';
  } finally {
    isUpgradingSkin.value = false;
    upgradingSkinId.value = null;
    upgradingSkinAction.value = null;
  }
}

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
const isPromoting = ref(false);

const canPromote = computed(() => {
  if (!activeHero.value || equipmentSlots.value.length < 6) return false;
  return equipmentSlots.value.every((slot) => slot.isEquipped);
});

const nextRank = computed(() => {
  const curColor = Number(activeHero.value?.color) || 1;
  return getHeroEquipmentRank(curColor + 1);
});

async function handlePromote() {
  if (!activeHero.value || !canPromote.value || isPromoting.value) return;
  const numId = Number(activeHero.value.id);
  isPromoting.value = true;
  try {
    await dispatchRpc([
      {
        name: 'heroPromote',
        args: { heroId: numId },
      },
      { name: 'heroGetAll' },
      { name: 'inventoryGet' },
      { name: 'mailGetAll' },
    ]);
  } catch (err) {
    console.error('Failed to promote hero:', err);
  } finally {
    isPromoting.value = false;
  }
}

// P2-13/15/16: 2-tab layout (Core + Upgrades), Prev/Next switcher, heroEvolve, artifact_evolve, XP planner, Glyphs/Sparks
const activeSubTab = ref<'core' | 'upgrades'>('core');
const isEvolvingHero = ref(false);
const isLevelingHero = ref(false);
const evolvingArtifactSlot = ref<number | null>(null);
const upgradingGlyphTier = ref<number | null>(null);
const isUpgradingSpark = ref(false);

const ownedRuneStones = computed(() =>
  Number(inventoryCoins.value?.[HERO_RESOURCE_IDS.RUNE_STONE_COIN_ID] ?? 0) || 0
);
const ownedSparksOfPower = computed(() =>
  Number(inventoryConsumables.value?.[HERO_RESOURCE_IDS.SPARK_OF_POWER_CONSUMABLE_ID] ?? 0) || 0
);
const heroSparkStatus = computed(() =>
  getHeroSparkStatus(activeHero.value, inventoryConsumables.value, currentGold.value)
);

const artifactHeaderResources = computed(() => {
  const seen = new Set<number>();
  const items: Array<{ id: number; name: string; owned: number; icon: string }> = [];
  for (const art of detailedArtifacts.value) {
    const cid = Number(art.plan?.consumableId);
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    items.push({
      id: cid,
      name: art.plan.resourceName,
      owned: art.plan.ownedAmount,
      icon: `assets/items/consumable/${cid}.png`,
    });
  }
  return items;
});

const artifactHeaderChests = computed(() => {
  const defs = [
    { id: 62, name: 'Artifact Essence Chest' },
    { id: 63, name: 'Artifact Scroll Chest' },
    { id: 64, name: 'Artifact Metal Chest' },
  ];
  return defs
    .map((d) => ({
      ...d,
      owned: Number(inventoryConsumables.value?.[d.id] ?? 0) || 0,
      icon: `assets/items/consumable/${d.id}.png`,
    }))
    .filter((d) => d.owned > 0);
});

const heroEvolveStatus = computed(() =>
  getHeroEvolveStatus({
    star: starCount.value,
    soulOwned: Number(soulProgress.value?.owned ?? 0),
    soulNeeded: soulProgress.value?.needed,
    userGold: getGold(cache.value),
  })
);

const teamLevelCap = computed(() => {
  const lv = Number(cache.value?.userGetInfo?.data?.level ?? cache.value?.accountStatus?.data?.level ?? 120);
  return Number.isFinite(lv) && lv > 0 ? Math.min(120, Math.floor(lv)) : 120;
});

const xpPotionInventory = computed(() =>
  getHeroXpPotionInventory(cache.value?.inventoryGet?.data?.consumable)
);

const nextLevelXpPlan = computed(() =>
  planHeroXpPotions(
    Number(activeHero.value?.level ?? 1),
    Number(activeHero.value?.level ?? 1) + 1,
    teamLevelCap.value,
    cache.value?.inventoryGet?.data?.consumable
  )
);

const maxLevelXpPlan = computed(() =>
  planHeroXpPotions(
    Number(activeHero.value?.level ?? 1),
    teamLevelCap.value,
    teamLevelCap.value,
    cache.value?.inventoryGet?.data?.consumable
  )
);

const heroGlyphsAndTalisman = computed(() =>
  extractHeroGlyphsAndTalisman(activeHero.value, cache.value)
);

const artifactUpgradeableCount = computed(() =>
  detailedArtifacts.value.filter((a: any) => a.plan?.canUpgradeOne).length
);

const skinUpgradeableCount = computed(() =>
  detailedSkins.value.filter((s: any) => !s.plan?.isMax && (s.plan?.canAffordNextOne || s.plan?.canAffordNextTen)).length
);

const glyphAndSparkUpgradeableCount = computed(() => {
  let count = 0;
  if (ownedRuneStones.value > 0) {
    count += heroGlyphsAndTalisman.value.glyphs.filter((g) => !g.isMax).length;
  }
  if (heroSparkStatus.value.canUpgrade) {
    count += 1;
  }
  return count;
});

const totalUpgradesReadyCount = computed(
  () => artifactUpgradeableCount.value + skinUpgradeableCount.value + glyphAndSparkUpgradeableCount.value
);

function switchHeroByDelta(delta: -1 | 1) {
  const list = availableHeroes.value;
  if (list.length <= 1) return;
  const idx = list.findIndex((h) => String(h.id) === String(currentHeroId.value));
  const nextIdx = idx < 0 ? 0 : (idx + delta + list.length) % list.length;
  const target = list[nextIdx];
  if (target) {
    internalHeroId.value = String(target.id);
  }
}

async function handleLevelUpHero(mode: 'single' | 'max') {
  if (!activeHero.value || isLevelingHero.value) return;
  const plan = mode === 'single' ? nextLevelXpPlan.value : maxLevelXpPlan.value;
  const useCalls = buildXpPotionInventoryUseCalls(activeHero.value.id, plan);
  if (useCalls.length === 0) return;

  isLevelingHero.value = true;
  try {
    await dispatchRpc([
      ...useCalls,
      { name: 'heroGetAll' },
      { name: 'inventoryGet' },
    ]);
  } catch (err) {
    console.error('Failed to level up hero:', err);
  } finally {
    isLevelingHero.value = false;
  }
}

async function upgradeGlyphTier(tier: number, steps = 1) {
  if (!activeHero.value || upgradingGlyphTier.value !== null || ownedRuneStones.value <= 0) return;
  const numId = Number(activeHero.value.id);
  const glyph = heroGlyphsAndTalisman.value.glyphs.find((g) => g.tier === tier);
  if (!glyph || glyph.isMax) return;

  const actualSteps = Math.max(1, Math.min(steps, glyph.maxLevel - glyph.level));
  upgradingGlyphTier.value = tier;
  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [];
    for (let i = 0; i < actualSteps; i++) {
      calls.push({
        name: 'rune_upgradeHeroRune',
        args: { heroId: numId, runeTier: tier, alternatePrice: false },
      });
    }
    calls.push({ name: 'rune_getAll' });
    calls.push({ name: 'heroGetAll' });
    calls.push({ name: 'inventoryGet' });
    await dispatchRpc(calls);
  } catch (err) {
    console.error('Failed to upgrade glyph:', err);
  } finally {
    upgradingGlyphTier.value = null;
  }
}

async function upgradeHeroSpark(steps = 1) {
  if (!activeHero.value || isUpgradingSpark.value || !heroSparkStatus.value.canUpgrade) return;
  const numId = Number(activeHero.value.id);
  const actualSteps = Math.max(1, Math.min(steps, heroSparkStatus.value.maxLevel - heroSparkStatus.value.level));
  isUpgradingSpark.value = true;
  try {
    const calls: Array<{ name: string; args?: any; feature?: string }> = [];
    for (let i = 0; i < actualSteps; i++) {
      calls.push({
        name: 'heroTitanGiftLevelUp',
        args: { heroId: numId },
      });
    }
    calls.push({ name: 'heroGetAll' });
    calls.push({ name: 'inventoryGet' });
    calls.push({ name: 'userGetInfo' });
    await dispatchRpc(calls);
  } catch (err) {
    console.error('Failed to upgrade Spark of Power:', err);
  } finally {
    isUpgradingSpark.value = false;
  }
}

async function handleEvolveHero() {
  if (!activeHero.value || !heroEvolveStatus.value.canEvolve || isEvolvingHero.value) return;
  const numId = Number(activeHero.value.id);
  isEvolvingHero.value = true;
  try {
    await dispatchRpc([
      { name: 'heroEvolve', args: { heroId: numId } },
      { name: 'heroGetAll' },
      { name: 'inventoryGet' },
      { name: 'userGetInfo' },
    ]);
  } catch (err) {
    console.error('Failed to evolve hero:', err);
  } finally {
    isEvolvingHero.value = false;
  }
}

function getArtifactSlotEvolveInfo(art: any) {
  const fragMap = cache.value?.inventoryGet?.data?.fragmentArtifact || {};
  const fragId = art?.artifactId ?? art?.id;
  const owned = fragId != null ? Number(fragMap[String(fragId)] ?? 0) : 0;
  return getArtifactEvolveStatus(Number(art?.star ?? 1), owned);
}

async function evolveArtifactSlot(slotId: number) {
  if (!activeHero.value || evolvingArtifactSlot.value !== null) return;
  const numId = Number(activeHero.value.id);
  evolvingArtifactSlot.value = slotId;
  try {
    await dispatchRpc([
      { name: 'artifact_evolve', args: { heroId: numId, slotId: slotId + 1 } },
      { name: 'heroGetAll' },
      { name: 'inventoryGet' },
    ]);
  } catch (err) {
    console.error('Failed to evolve artifact:', err);
  } finally {
    evolvingArtifactSlot.value = null;
  }
}

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
  openModal('campaign', { selectedCampaignGearId: gearId, selectedCampaignHeroId: null });
}

function handleFarmQuick() {
  const firstMissing = equipmentSlots.value.find((s) => !s.isEquipped && s.itemId);
  const gearId = firstMissing?.itemId || colorEquipmentItems.value[0] || null;
  emit('openCampaign', gearId);
  openModal('campaign', { selectedCampaignGearId: gearId, selectedCampaignHeroId: null });
}

function handleHeroFarmAll() {
  if (!activeHero.value?.id) return;
  const numId = Number(activeHero.value.id);
  emit('openCampaignHero', numId);
  openModal('campaign', { selectedCampaignHeroId: numId, selectedCampaignGearId: null });
}

function handleSoulStoneFarm() {
  if (!activeHero.value?.id) return;
  const numId = Number(activeHero.value.id);
  emit('openCampaignSoul', numId);
  openModal('campaign', {
    selectedCampaignHeroId: numId,
    selectedCampaignGearId: null,
    campaignFarmMode: 'soul',
  });
}

</script>

<template>
  <div
    v-if="modelValue"
    id="hero-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="hero-dialog-title"
    :style="{ zIndex: stackLevel }"
    class="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"

  >
    <div
      class="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-xl dark:bg-slate-900 dark:border-slate-800 overflow-hidden"
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

            <!-- Hero Switcher with Prev/Next -->
            <div v-if="availableHeroes.length > 1" class="inline-flex items-center gap-1 shrink-0">
              <button
                id="btn-hero-prev"
                type="button"
                aria-label="Previous Hero"
                title="Previous Hero"
                class="cursor-pointer h-6 px-1.5 rounded border border-slate-300 bg-white text-2xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                @click="switchHeroByDelta(-1)"
              >
                ◀
              </button>
              <select
                id="hero-dialog-switcher"
                :value="currentHeroId"
                class="h-6 rounded border border-slate-300 bg-white px-1.5 text-2xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 focus:outline-hidden"
                @change="handleHeroSwitch($event)"
              >
                <option v-for="h in availableHeroes" :key="h.id" :value="h.id">
                  {{ h.name }} ({{ formatNumber(h.power) }})
                </option>
              </select>
              <button
                id="btn-hero-next"
                type="button"
                aria-label="Next Hero"
                title="Next Hero"
                class="cursor-pointer h-6 px-1.5 rounded border border-slate-300 bg-white text-2xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                @click="switchHeroByDelta(1)"
              >
                ▶
              </button>
            </div>
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
                <UnitStars :count="starCount" class="text-xs" />
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

                <!-- Key stats chips + Level XP Planner Bar -->
                <div id="hero-level-xp-bar" class="flex items-center gap-2 flex-wrap text-xs">
                  <span class="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                    <span class="text-slate-400 font-normal">Level:</span> {{ activeHero.level || 1 }}
                    <span class="text-2xs font-normal text-slate-400">/ {{ teamLevelCap }}</span>
                  </span>
                  <span
                    v-if="(activeHero.level || 1) < teamLevelCap"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-2xs font-medium text-sky-700 dark:text-sky-300"
                    :title="`XP Potions in bag: ${xpPotionInventory.totalPotions} (${formatNumber(xpPotionInventory.totalAvailableXp)} XP). +1 Lv needs ~${formatNumber(nextLevelXpPlan.xpNeeded)} XP; Max Lv.${maxLevelXpPlan.targetLevel} needs ~${formatNumber(maxLevelXpPlan.xpNeeded)} XP.`"
                  >
                    🧪 {{ formatCompactMillion(xpPotionInventory.totalAvailableXp) }} XP
                  </span>
                  <button
                    v-if="(activeHero.level || 1) < teamLevelCap"
                    id="btn-hero-level-1"
                    type="button"
                    :disabled="isLevelingHero || nextLevelXpPlan.potionsToUse.length === 0"
                    class="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-3xs font-bold shadow-2xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :title="nextLevelXpPlan.potionsToUse.length > 0 ? `Use ${nextLevelXpPlan.potionsToUse.map((p) => `${p.count}x ${p.name}`).join(', ')} (~${formatNumber(nextLevelXpPlan.xpNeeded)} XP)` : 'No EXP Potions available'"
                    @click="handleLevelUpHero('single')"
                  >
                    <span v-if="isLevelingHero" class="animate-spin inline-block">↻</span>
                    <span v-else>+1 Lv</span>
                  </button>
                  <button
                    v-if="(activeHero.level || 1) < teamLevelCap"
                    id="btn-hero-level-max"
                    type="button"
                    :disabled="isLevelingHero || maxLevelXpPlan.potionsToUse.length === 0"
                    class="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-3xs font-bold shadow-2xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :title="maxLevelXpPlan.potionsToUse.length > 0 ? `Level up toward Lv.${maxLevelXpPlan.targetLevel}: ${maxLevelXpPlan.potionsToUse.map((p) => `${p.count}x ${p.name}`).join(', ')}` : 'No EXP Potions available'"
                    @click="handleLevelUpHero('max')"
                  >
                    <span>Max</span>
                  </button>
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

                <!-- Soul Stones Progress + 1-Click Evolve -->
                <div v-if="soulProgress" class="pt-1">
                  <div class="flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>Soul Stones:</span>
                    <div class="flex items-center gap-1.5">
                      <button
                        v-if="!heroEvolveStatus.isMax && heroEvolveStatus.hasEnoughSouls"
                        id="btn-hero-evolve"
                        type="button"
                        :disabled="isEvolvingHero || !heroEvolveStatus.canEvolve"
                        class="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-white text-3xs font-bold shadow-2xs transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                        :title="heroEvolveStatus.canEvolve ? `Evolve to ${heroEvolveStatus.targetStar}★ (Cost: ${formatNumber(heroEvolveStatus.goldCost)} Gold)` : (heroEvolveStatus.reason || 'Cannot evolve')"
                        @click="handleEvolveHero"
                      >
                        <span v-if="isEvolvingHero" class="animate-spin inline-block">↻</span>
                        <span v-else>⭐ Evolve → {{ heroEvolveStatus.targetStar }}★</span>
                      </button>
                      <button
                        v-if="canFarmSoulStones"
                        type="button"
                        id="btn-farm-soul-stone"
                        class="cursor-pointer inline-flex items-center justify-center w-4 h-4 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:hover:bg-amber-800 dark:text-amber-200 text-3xs font-bold transition-colors shadow-2xs"
                        title="Farm Soul Stones in Campaign"
                        aria-label="Farm Soul Stones in Campaign"
                        @click="handleSoulStoneFarm"
                      >
                        ➕
                      </button>
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

          <!-- Compact 2-Tab Switcher (Core + Unified Upgrades) -->
          <div id="hero-detail-subtabs" class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/90 text-xs font-semibold flex-wrap">
            <button
              type="button"
              class="cursor-pointer flex-1 min-w-fit px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5"
              :class="activeSubTab === 'core' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
              @click="activeSubTab = 'core'"
            >
              <span>⚙️</span> <span>Core (Skills &amp; Gear)</span>
              <span v-if="canPromote" class="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-3xs font-bold">↑</span>
            </button>
            <button
              type="button"
              class="cursor-pointer flex-1 min-w-fit px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5"
              :class="activeSubTab === 'upgrades' ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
              @click="activeSubTab = 'upgrades'"
            >
              <span>✨</span> <span>Upgrades (Artifacts · Skins · Glyphs)</span>
              <span v-if="totalUpgradesReadyCount > 0" class="px-1.5 py-0.2 rounded-full bg-purple-500 text-white text-3xs font-bold">{{ totalUpgradesReadyCount }}</span>
            </button>
          </div>

          <!-- 2. Hero Skills Section with + Upgrade Button -->
          <div v-show="activeSubTab === 'core'" class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>⚡</span> Hero Skills
                </h4>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  Upgrade hero skills using skill points and gold
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  :class="
                    skillPoints > 0
                      ? 'bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-800/50'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  "
                >
                  <span>⚡</span> {{ skillPoints }}/{{ skillPointsCap }}
                </span>
                <button
                  v-if="hasFreeSkillPoints"
                  type="button"
                  id="claim-free-skill-points-btn"
                  :disabled="isClaimingFreeSkillPoints || isUpgradingSkills || skillPoints >= skillPointsCap"
                  class="btn-claim-free-skill-points inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none"
                  :class="[
                    skillPoints < skillPointsCap && !isClaimingFreeSkillPoints && !isUpgradingSkills
                      ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 ring-1 ring-amber-500/50 animate-pulse hover:animate-none'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
                    isClaimingFreeSkillPoints || isUpgradingSkills ? 'pointer-events-none' : ''
                  ]"
                  :title="
                    skillPoints >= skillPointsCap
                      ? `Skill points are full (${skillPointsCap}/${skillPointsCap}). Spend points before claiming.`
                      : 'Claim free skill points (Video Bonus)'
                  "
                  aria-label="Claim free skill points"
                  @click="claimFreeSkillPoints"
                >
                  <span v-if="isClaimingFreeSkillPoints" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                  <span v-else>🎬</span>
                  <span>+10 Free</span>
                </button>
                <button
                  type="button"
                  id="upgrade-all-skills-max-btn"
                  :disabled="isUpgradingSkills || totalSkillMaxAddable <= 0"
                  class="btn-upgrade-all-skills-max inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed select-none"
                  :class="[
                    totalSkillMaxAddable > 0 && !isUpgradingSkills
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500',
                    isUpgradingSkills ? 'pointer-events-none' : '',
                    isUpgradingAllSkills ? 'ring-2 ring-emerald-400' : ''
                  ]"
                  :title="
                    totalSkillPointsNeeded <= 0
                      ? 'All unlocked skills are at max level'
                      : skillPoints <= 0
                        ? 'No skill points available'
                        : `Add maximum available skill points (+${totalSkillMaxAddable}) across unlocked skills`
                  "
                  @click="upgradeAllSkillsMax"
                >
                  <span v-if="isUpgradingAllSkills" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                  <span v-else>⚡</span>
                  <span>Max All</span>
                  <span
                    v-if="totalSkillMaxAddable > 0"
                    class="text-2xs opacity-90 font-mono"
                  >
                    (+{{ totalSkillMaxAddable }})
                  </span>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div
                v-for="s in skillSlots"
                :key="s.slot"
                class="flex flex-col justify-between p-2 rounded-lg border transition-all"
                :class="[
                  heroColor >= s.rankReq || s.slot <= skillKeys.length
                    ? s.bg
                    : 'border-dashed border-slate-200 bg-slate-50/30 text-slate-400 dark:border-slate-800 dark:bg-slate-900/30',
                  heroColor >= s.rankReq || s.slot <= skillKeys.length ? s.accentBorder : ''
                ]"
              >
                <!-- Top Row: Tier indicator dot, name, action button/badge -->
                <div class="flex items-center justify-between gap-1 min-w-0">
                  <div class="flex items-center gap-1.5 min-w-0 flex-1 mr-0.5">
                    <span
                      class="size-2 rounded-full shrink-0 shadow-2xs"
                      :class="s.dotColor"
                      :title="`Tier: ${s.tier} (Unlocked at rank ${s.rankName})`"
                    ></span>
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

                  <!-- Right Action Wrap: Max and + buttons -->
                  <div class="shrink-0 flex items-center gap-1">
                    <span
                      v-if="!(heroColor >= s.rankReq || s.slot <= skillKeys.length)"
                      class="px-1.5 py-0.2 rounded text-3xs text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500"
                    >
                      🔒
                    </span>
                    <span
                      v-else-if="isSkillMax(s)"
                      class="px-1.5 py-0.2 rounded text-3xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      MAX
                    </span>
                    <template v-else>
                      <button
                        type="button"
                        :disabled="isUpgradingSkills || upgradingSkills[s.slot] || getSkillMaxAddable(s) <= 0"
                        class="btn-upgrade-skill-max inline-flex items-center justify-center px-1.5 h-5.5 rounded text-3xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 ring-1 ring-emerald-300 dark:ring-emerald-700/60 shadow-xs cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed select-none"
                        :class="{
                          'pointer-events-none': isUpgradingSkills || upgradingSkills[s.slot],
                          'ring-2 ring-emerald-500 dark:ring-emerald-400': upgradingSkills[s.slot] && upgradingSkillAction[s.slot] === 'max'
                        }"
                        :title="
                          getSkillMaxAddable(s) <= 0
                            ? 'No skill points available'
                            : `Upgrade ${meta?.skills?.[s.slot - 1] || s.label} to maximum possible (+${getSkillMaxAddable(s)} lvls)`
                        "
                        :aria-label="`Max upgrade ${meta?.skills?.[s.slot - 1] || s.label}`"
                        @click="upgradeSkillMax(s)"
                      >
                        <span v-if="upgradingSkills[s.slot] && upgradingSkillAction[s.slot] === 'max'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                        <span v-else>+{{ getSkillMaxAddable(s) > 1 ? getSkillMaxAddable(s) : 'Max' }}</span>
                      </button>
                      <button
                        type="button"
                        :disabled="isUpgradingSkills || upgradingSkills[s.slot] || skillPoints <= 0"
                        class="btn-upgrade-skill inline-flex items-center justify-center size-5.5 rounded font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none"
                        :class="{
                          'pointer-events-none': isUpgradingSkills || upgradingSkills[s.slot],
                          'ring-2 ring-emerald-300 dark:ring-emerald-500': upgradingSkills[s.slot] && upgradingSkillAction[s.slot] === 'single'
                        }"
                        :title="
                          skillPoints <= 0
                            ? 'No skill points available'
                            : `Upgrade ${meta?.skills?.[s.slot - 1] || s.label} to Lv. ${getSkillDisplayLevel(s) + 1}`
                        "
                        :aria-label="`Upgrade ${meta?.skills?.[s.slot - 1] || s.label}`"
                        @click="upgradeSkill(s)"
                      >
                        <span v-if="upgradingSkills[s.slot] && upgradingSkillAction[s.slot] === 'single'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                        <svg v-else class="size-3 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </template>
                  </div>
                </div>

                <!-- Bottom Area -->
                <div class="mt-2 space-y-1">
                  <template v-if="heroColor >= s.rankReq || s.slot <= skillKeys.length">
                    <div class="flex items-center justify-between text-3xs text-slate-500 dark:text-slate-400">
                      <span>
                        Lv.
                        <span class="font-bold text-slate-700 dark:text-slate-200">
                          {{ getSkillDisplayLevel(s) }}
                        </span>
                        / {{ s.maxLvl }}
                      </span>
                      <span class="font-semibold">
                        {{ getSkillProgressPercent(s) }}%
                      </span>
                    </div>
                    <div class="w-full bg-slate-200/80 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all"
                        :class="isSkillMax(s) ? 'bg-amber-500' : 'bg-emerald-500'"
                        :style="{ width: `${getSkillProgressPercent(s)}%` }"
                      ></div>
                    </div>
                  </template>
                  <div v-else class="text-3xs text-slate-400 italic">
                    🔒 Rank {{ s.rankName }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Artifacts Section -->
          <div
            v-if="detailedArtifacts.length > 0"
            v-show="activeSubTab === 'upgrades'"
            class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3"
          >
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>🛡️</span> Artifacts
                </h4>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  Milestones: Lv. 25, 50, 70, 85, 100
                </div>
              </div>

              <!-- Unified Icon+Count Resource Summary Bar (matching Skins card) -->
              <div
                id="hero-artifacts-resource-bar"
                class="flex items-center gap-2.5 text-2xs bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60 flex-wrap"
              >
                <div
                  v-for="res in artifactHeaderResources"
                  :key="'art-res-' + res.id"
                  class="flex items-center gap-1"
                  :title="`${res.name}: ${formatNumber(res.owned)}`"
                >
                  <img :src="getAssetUrl(res.icon)" :alt="res.name" class="size-4 object-contain" />
                  <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(res.owned) }}</span>
                </div>

                <template v-if="artifactHeaderChests.length > 0">
                  <span class="text-slate-300 dark:text-slate-600">|</span>
                  <div
                    v-for="ch in artifactHeaderChests"
                    :key="'art-chest-' + ch.id"
                    class="flex items-center gap-1"
                    :title="`${ch.name}: ${formatNumber(ch.owned)}`"
                  >
                    <img :src="getAssetUrl(ch.icon)" :alt="ch.name" class="size-4 object-contain" />
                    <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(ch.owned) }}</span>
                  </div>
                </template>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              <div
                v-for="art in detailedArtifacts"
                :key="art.slotId"
                class="p-2.5 rounded-lg border transition-all flex flex-col justify-between gap-2"
                :class="
                  art.plan.isMax
                    ? 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700/60'
                    : art.plan.canUpgradeOne
                    ? 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/80 hover:border-amber-400/60 dark:hover:border-amber-600/60 shadow-2xs'
                    : 'bg-slate-50/40 dark:bg-slate-900/30 border-slate-200/80 dark:border-slate-800/70 opacity-90'
                "
              >
                <!-- Top: Type, Stars, Level & Resource badge -->
                <div>
                  <div class="flex items-center justify-between gap-1.5 mb-1">
                    <span class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-xs">
                      <span>{{ art.slotId === 0 ? '⚔️' : art.slotId === 1 ? '📖' : '💍' }}</span>
                      <span>{{ art.name }}</span>
                    </span>
                    <span class="text-3xs text-amber-500 tracking-tighter">
                      {{ '★'.repeat(art.star) }}
                    </span>
                  </div>

                  <div class="flex items-center justify-between gap-1 text-2xs mb-1.5">
                    <span class="font-extrabold text-slate-900 dark:text-slate-100">
                      Lv. {{ art.level }}
                      <span class="text-3xs font-normal text-slate-400 dark:text-slate-500">/ 100</span>
                    </span>

                    <!-- Tier indicator & next milestone -->
                    <span
                      class="text-3xs px-1.5 py-0.2 rounded font-semibold border"
                      :class="
                        art.plan.tierColor === 'white'
                          ? 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'
                          : art.plan.tierColor === 'green'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700'
                          : art.plan.tierColor === 'blue'
                          ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700'
                          : art.plan.tierColor === 'purple'
                          ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700'
                          : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700'
                      "
                    >
                      {{ art.plan.isMax ? 'MAX' : `Goal: Lv. ${art.plan.targetLevel}` }}
                    </span>
                  </div>

                  <!-- Level Progress Bar -->
                  <div class="h-1.5 w-full bg-slate-200/80 dark:bg-slate-700 rounded-full overflow-hidden my-1.5">
                    <div
                      class="h-full rounded-full transition-all duration-300"
                      :class="art.plan.isMax ? 'bg-amber-500' : 'bg-gradient-to-r from-amber-500 to-emerald-500'"
                      :style="{ width: `${art.plan.isMax ? 100 : Math.min(100, (art.level / (art.plan.targetLevel || 100)) * 100)}%` }"
                    ></div>
                  </div>
                </div>

                <!-- Bottom: Action Buttons -->
                <div
                  v-if="!art.plan.isMax"
                  class="grid gap-1 pt-1"
                  :class="art.plan.chestPlan.hasChests && art.plan.chestPlan.canUpgradeWithChests ? 'grid-cols-3' : 'grid-cols-2'"
                >
                  <!-- Button +1 -->
                  <button
                    type="button"
                    :disabled="isUpgradingArtifact || !art.plan.canUpgradeOne"
                    class="h-6.5 px-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center justify-center border shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                    :class="[
                      art.plan.canUpgradeOne
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700 dark:border-emerald-500'
                        : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
                      isUpgradingArtifact ? 'pointer-events-none' : '',
                      upgradingArtifactSlot === art.slotId && upgradingArtifactAction === 'single' ? 'ring-2 ring-emerald-400 opacity-90' : ''
                    ]"
                    :title="`Upgrade +1 Level. Cost: ${formatNumber(art.plan.costForNextOne)} ${art.plan.shortName} (Owned: ${formatNumber(art.plan.ownedAmount)})`"
                    @click="upgradeArtifactSingle(art.slotId)"
                  >
                    <span v-if="upgradingArtifactSlot === art.slotId && upgradingArtifactAction === 'single'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span v-else>+1</span>
                  </button>

                  <!-- Button +{#1} (up to milestone with owned resources) -->
                  <button
                    type="button"
                    :disabled="isUpgradingArtifact || !art.plan.canUpgradeMilestone || art.plan.milestoneLevels <= 0"
                    class="h-6.5 px-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center justify-center border shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                    :class="[
                      art.plan.canUpgradeMilestone && art.plan.milestoneLevels > 0
                        ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-700 dark:border-amber-500'
                        : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
                      isUpgradingArtifact ? 'pointer-events-none' : '',
                      upgradingArtifactSlot === art.slotId && upgradingArtifactAction === 'milestone' ? 'ring-2 ring-amber-400 opacity-90' : ''
                    ]"
                    :title="`Upgrade to Lv. ${art.plan.currentLevel + (art.plan.milestoneLevels > 0 ? art.plan.milestoneLevels : art.plan.levelsDelta)} (+${art.plan.milestoneLevels > 0 ? art.plan.milestoneLevels : art.plan.levelsDelta} levels). Cost: ${art.plan.milestoneLevels > 0 ? art.plan.milestoneCost : art.plan.totalCost} ${art.plan.shortName}`"
                    @click="upgradeArtifactToMilestone(art.slotId)"
                  >
                    <span v-if="upgradingArtifactSlot === art.slotId && upgradingArtifactAction === 'milestone'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span v-else>+{{ art.plan.milestoneLevels > 0 ? art.plan.milestoneLevels : art.plan.levelsDelta }}</span>
                  </button>

                  <!-- Button +{#2} (with corresponding chest opening) -->
                  <button
                    v-if="art.plan.chestPlan.hasChests && art.plan.chestPlan.canUpgradeWithChests"
                    type="button"
                    :disabled="isUpgradingArtifact || !art.plan.chestPlan.canUpgradeWithChests"
                    class="h-6.5 px-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center justify-center border shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                    :class="[
                      art.plan.chestPlan.canUpgradeWithChests
                        ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-700 dark:border-purple-500'
                        : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
                      isUpgradingArtifact ? 'pointer-events-none' : '',
                      upgradingArtifactSlot === art.slotId && upgradingArtifactAction === 'chest' ? 'ring-2 ring-purple-400 opacity-90' : ''
                    ]"
                    :title="`Upgrade +${art.plan.chestPlan.levelsDeltaWithChests} levels (opens ${art.plan.chestPlan.chestsToOpen} ${art.plan.chestPlan.chestName} for +${art.plan.chestPlan.chestsToOpen * art.plan.chestPlan.resourcePerChest} ${art.plan.shortName}). Total cost: ${art.plan.chestPlan.totalCostWithChests} ${art.plan.shortName}`"
                    @click="upgradeArtifactWithChests(art.slotId)"
                  >
                    <span v-if="upgradingArtifactSlot === art.slotId && upgradingArtifactAction === 'chest'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span v-else>+{{ art.plan.chestPlan.levelsDeltaWithChests }}</span>
                  </button>
                </div>

                <div v-else class="text-center py-1 text-3xs font-bold text-amber-500">
                  ★ MAX LEVEL ★
                </div>

                <!-- Artifact Star Evolution Button (artifact_evolve) -->
                <button
                  v-if="art.star < 6 && getArtifactSlotEvolveInfo(art).canEvolve"
                  type="button"
                  :disabled="evolvingArtifactSlot !== null"
                  class="mt-1 w-full h-6 px-2 rounded-md bg-amber-500 hover:bg-amber-400 text-white text-3xs font-bold cursor-pointer transition-all disabled:opacity-45"
                  :title="`Evolve ${art.name} to ${art.star + 1}★`"
                  @click="evolveArtifactSlot(art.slotId)"
                >
                  {{ evolvingArtifactSlot === art.slotId ? '↻ Evolving…' : `⭐ Evolve → ${art.star + 1}★` }}
                </button>
              </div>
            </div>
          </div>

          <!-- 4. Skins Section -->
          <div v-show="activeSubTab === 'upgrades'" class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>👘</span> Skins
                  <span class="text-xs font-semibold text-slate-400">({{ detailedSkins.length }})</span>
                </h4>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  Enhance stats with skin stones and auto-chest opening
                </div>
              </div>

              <!-- Resource summary bar: Skin stones and Chests -->
              <div class="flex items-center gap-3 text-2xs bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60 flex-wrap">
                <!-- Direct Skin Stones -->
                <div class="flex items-center gap-1.5" :title="`${skinStoneInfo.name}: ${formatNumber(ownedSkinStones)}`">
                  <img :src="getAssetUrl(skinStoneInfo.icon)" :alt="skinStoneInfo.name" class="size-4.5 object-contain" />
                  <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(ownedSkinStones) }}</span>
                </div>

                <span class="text-slate-300 dark:text-slate-600">|</span>

                <!-- Large Skin Stone Chest (65) -->
                <div class="flex items-center gap-1" :title="`Large Skin Stone Chest (150 stones each): ${formatNumber(ownedLargeSkinChests)}`">
                  <img :src="getAssetUrl('assets/items/consumable/65.png')" alt="Large Skin Stone Chest" class="size-4.5 object-contain" />
                  <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(ownedLargeSkinChests) }}</span>
                </div>

                <!-- Skin Stone Chest (51) -->
                <div class="flex items-center gap-1" :title="`Skin Stone Chest (10 stones each): ${formatNumber(ownedSmallSkinChests)}`">
                  <img :src="getAssetUrl('assets/items/consumable/51.png')" alt="Skin Stone Chest" class="size-4.5 object-contain" />
                  <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(ownedSmallSkinChests) }}</span>
                </div>
              </div>
            </div>

            <!-- Error banner if any -->
            <div v-if="skinActionError" class="p-2 rounded bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 text-xs flex items-center justify-between">
              <span>⚠️ {{ skinActionError }}</span>
              <button type="button" class="text-2xs underline cursor-pointer ml-2" @click="skinActionError = null">Dismiss</button>
            </div>

            <!-- Empty state -->
            <div v-if="detailedSkins.length === 0" class="text-center py-6 text-xs text-slate-400 dark:text-slate-500 italic">
              No skins unlocked for this hero.
            </div>

            <!-- Skins Cards Grid -->
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="skin in detailedSkins"
                :key="skin.id"
                class="rounded-lg border p-2.5 flex flex-col justify-between transition-all bg-slate-50/70 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              >
                <!-- Skin Header & Badges -->
                <div class="space-y-1.5 mb-2">
                  <div class="flex items-center justify-between gap-1.5">
                    <div class="font-bold text-xs text-slate-800 dark:text-slate-100 truncate" :title="skin.name">
                      {{ skin.name }}
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <span
                        v-if="skin.isCurrent"
                        class="text-3xs px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      >
                        Active
                      </span>
                      <span
                        v-if="skin.isDefault"
                        class="text-3xs px-1.5 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      >
                        Default
                      </span>
                    </div>
                  </div>

                  <!-- Level and Stat -->
                  <div class="flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400">
                    <span class="font-bold text-slate-700 dark:text-slate-300">Lv. {{ skin.level }} / {{ skin.maxLevel }}</span>
                    <span class="text-indigo-600 dark:text-indigo-400 font-medium">{{ skin.statLabel }}</span>
                  </div>

                  <!-- Level Progress Bar -->
                  <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                      :style="{ width: `${Math.min(100, (skin.level / skin.maxLevel) * 100)}%` }"
                    ></div>
                  </div>
                </div>

                <!-- Action Buttons / Max Level -->
                <div v-if="skin.plan?.isMax" class="text-center py-1.5 text-2xs font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-900/40">
                  ★ MAX LEVEL ({{ skin.maxLevel }}) ★
                </div>

                <div
                  v-else
                  class="grid gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/80"
                  :class="(skin.plan?.targetNextTen ?? 60) < skin.maxLevel ? 'grid-cols-3' : 'grid-cols-2'"
                >
                  <!-- Button +1 -->
                  <button
                    type="button"
                    :disabled="isUpgradingSkin || !skin.plan?.singlePlan?.canAfford"
                    class="h-6.5 px-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center justify-center border shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                    :class="[
                      skin.plan?.singlePlan?.canAfford
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700 dark:border-emerald-500'
                        : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
                      isUpgradingSkin ? 'pointer-events-none' : '',
                      upgradingSkinId === (skin.skinId ?? skin.id) && upgradingSkinAction === 'single' ? 'ring-2 ring-emerald-400 opacity-90' : ''
                    ]"
                    :title="`Upgrade +1 Level. Cost: ${formatNumber(skin.plan?.costSingle ?? skin.plan?.costOne ?? 0)} stones${(skin.plan?.singlePlan?.totalChestsToOpen ?? 0) > 0 ? ` (opens ${skin.plan.singlePlan.totalChestsToOpen} chest${skin.plan.singlePlan.totalChestsToOpen > 1 ? 's' : ''})` : ''}`"
                    @click="upgradeSkin(skin, skin.plan?.targetSingle ?? (skin.level + 1), 'single')"
                  >
                    <span v-if="upgradingSkinId === (skin.skinId ?? skin.id) && upgradingSkinAction === 'single'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span v-else>+1</span>
                  </button>

                  <!-- Button -> Next Ten (e.g. -> 10, -> 20, -> 30) -->
                  <button
                    type="button"
                    :disabled="isUpgradingSkin || !skin.plan?.nextTenPlan?.canAfford"
                    class="h-6.5 px-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center justify-center border shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                    :class="[
                      skin.plan?.nextTenPlan?.canAfford
                        ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-700 dark:border-amber-500'
                        : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
                      isUpgradingSkin ? 'pointer-events-none' : '',
                      upgradingSkinId === (skin.skinId ?? skin.id) && upgradingSkinAction === 'ten' ? 'ring-2 ring-amber-400 opacity-90' : ''
                    ]"
                    :title="`Upgrade to Lv. ${skin.plan?.targetNextTen} (+${(skin.plan?.targetNextTen ?? skin.level) - skin.level} lvls). Cost: ${formatNumber(skin.plan?.costNextTen ?? 0)} stones${(skin.plan?.nextTenPlan?.totalChestsToOpen ?? 0) > 0 ? ` (opens ${skin.plan.nextTenPlan.totalChestsToOpen} chest${skin.plan.nextTenPlan.totalChestsToOpen > 1 ? 's' : ''})` : ''}`"
                    @click="upgradeSkin(skin, skin.plan?.targetNextTen ?? skin.level, 'ten')"
                  >
                    <span v-if="upgradingSkinId === (skin.skinId ?? skin.id) && upgradingSkinAction === 'ten'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span v-else>+{{ (skin.plan?.targetNextTen ?? skin.level) - skin.level }}</span>
                  </button>

                  <!-- Button -> Next Ten + 10 (e.g. -> 20, -> 30, -> 40) -->
                  <button
                    v-if="(skin.plan?.targetNextTen ?? 60) < skin.maxLevel"
                    type="button"
                    :disabled="isUpgradingSkin || !skin.plan?.nextTenPlus10Plan?.canAfford"
                    class="h-6.5 px-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center justify-center border shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 leading-none"
                    :class="[
                      skin.plan?.nextTenPlus10Plan?.canAfford
                        ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-700 dark:border-purple-500'
                        : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
                      isUpgradingSkin ? 'pointer-events-none' : '',
                      upgradingSkinId === (skin.skinId ?? skin.id) && upgradingSkinAction === 'tenPlus10' ? 'ring-2 ring-purple-400 opacity-90' : ''
                    ]"
                    :title="`Upgrade to Lv. ${skin.plan?.targetNextTenPlus10} (+${(skin.plan?.targetNextTenPlus10 ?? skin.level) - skin.level} lvls). Cost: ${formatNumber(skin.plan?.costNextTenPlus10 ?? 0)} stones${(skin.plan?.nextTenPlus10Plan?.totalChestsToOpen ?? 0) > 0 ? ` (opens ${skin.plan.nextTenPlus10Plan.totalChestsToOpen} chest${skin.plan.nextTenPlus10Plan.totalChestsToOpen > 1 ? 's' : ''})` : ''}`"
                    @click="upgradeSkin(skin, skin.plan?.targetNextTenPlus10 ?? skin.level, 'tenPlus10')"
                  >
                    <span v-if="upgradingSkinId === (skin.skinId ?? skin.id) && upgradingSkinAction === 'tenPlus10'" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span v-else>+{{ (skin.plan?.targetNextTenPlus10 ?? skin.level) - skin.level }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 5. Equipment Slots & Campaign Farm Section -->
          <div v-show="activeSubTab === 'core'" class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>🛡️</span> Equipment Slots
                </h4>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  6 equipment slots to advance Hero Rank/Color
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  v-if="canPromote"
                  id="hero-promote-btn"
                  type="button"
                  :disabled="isPromoting"
                  class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 select-none active:scale-95"
                  :class="[
                    isPromoting ? 'pointer-events-none' : 'animate-pulse'
                  ]"
                  :title="`All 6 equipment slots equipped! Promote to ${nextRank?.name || 'Next Rank'}`"
                  @click="handlePromote"
                >
                  <span v-if="isPromoting" class="animate-spin text-xs inline-block">↻</span>
                  <span v-else>⬆️</span>
                  <span>{{ isPromoting ? 'Promoting...' : `Promote to ${nextRank?.name || 'Next Rank'}` }}</span>
                </button>
                <button
                  id="hero-farm-all-btn"
                  type="button"
                  class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
                  title="Aggregate all leaf resources needed to farm for this Hero and open Campaign Farm dialog"
                  @click="handleHeroFarmAll"
                >
                  <span>🎯</span> Farm by Hero
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
                  @click="handleFarmQuick"
                >
                  <span>⚔️</span> Farm Equipment
                </button>
              </div>
            </div>

            <!-- Ready to Promote Alert Banner -->
            <div
              v-if="canPromote"
              id="hero-promote-banner"
              class="p-3 rounded-lg border border-emerald-300 bg-emerald-50/90 dark:border-emerald-800 dark:bg-emerald-950/40 flex items-center justify-between gap-3 text-xs"
            >
              <div class="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-semibold">
                <span class="text-base">✨</span>
                <span>All 6 equipment slots equipped! Ready to advance to <strong>{{ nextRank?.name || 'Next Rank' }}</strong>.</span>
              </div>
              <button
                type="button"
                :disabled="isPromoting"
                class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shadow-xs transition-all disabled:opacity-50 shrink-0 select-none active:scale-95 flex items-center gap-1"
                :class="{ 'pointer-events-none': isPromoting }"
                @click="handlePromote"
              >
                <span v-if="isPromoting" class="animate-spin text-xs inline-block">↻</span>
                <span>{{ isPromoting ? 'Promoting...' : 'Promote Now' }}</span>
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
                    class="px-2 py-0.5 rounded text-3xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs shrink-0 disabled:opacity-50 select-none flex items-center gap-1 active:scale-95"
                    :class="{ 'pointer-events-none': isCrafting[slot.slotNum] }"
                    @click.stop="handleCraft(slot)"
                  >
                    <span v-if="isCrafting[slot.slotNum]" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span>{{ isCrafting[slot.slotNum] ? 'Crafting' : 'Craft' }}</span>
                  </button>
                  <button
                    v-else-if="slot.statusKind === 'inventory'"
                    type="button"
                    :disabled="isEquipping[slot.slotNum]"
                    class="px-2 py-0.5 rounded text-3xs font-bold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer shadow-xs shrink-0 disabled:opacity-50 select-none flex items-center gap-1 active:scale-95"
                    :class="{ 'pointer-events-none': isEquipping[slot.slotNum] }"
                    @click.stop="handleEquip(slot)"
                  >
                    <span v-if="isEquipping[slot.slotNum]" class="animate-spin text-3xs font-bold leading-none inline-block">↻</span>
                    <span>{{ isEquipping[slot.slotNum] ? 'Equipping' : 'Equip' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 6. Glyphs, Spark of Power & Talisman Section -->
          <div
            v-show="activeSubTab === 'upgrades'"
            class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 space-y-3"
          >
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>✨</span> Glyphs &amp; Spark of Power
                </h4>
                <div class="text-2xs text-slate-400 dark:text-slate-500">
                  Upgrade 5 glyphs with Rune Stones (zero Emeralds) and boost Spark of Power
                </div>
              </div>
              <div
                id="hero-glyphs-resource-bar"
                class="flex items-center gap-3 text-2xs bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60"
              >
                <div class="flex items-center gap-1.5" :title="`Rune Stones: ${formatNumber(ownedRuneStones)}`">
                  <img :src="getAssetUrl('assets/items/coin/40077.png')" alt="Rune Stones" class="size-4 object-contain" />
                  <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(ownedRuneStones) }}</span>
                </div>
                <span class="text-slate-300 dark:text-slate-600">|</span>
                <div class="flex items-center gap-1.5" :title="`Sparks of Power: ${formatNumber(ownedSparksOfPower)}`">
                  <img :src="getAssetUrl('assets/items/consumable/24.png')" alt="Sparks of Power" class="size-4 object-contain" />
                  <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(ownedSparksOfPower) }}</span>
                </div>
                <span class="text-slate-300 dark:text-slate-600">|</span>
                <div class="flex items-center gap-1.5" :title="`Gold: ${formatNumber(currentGold)}`">
                  <img :src="getAssetUrl('assets/items/gold/0.png')" alt="Gold" class="size-4 object-contain" />
                  <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatCompactMillion(currentGold) }}</span>
                </div>
              </div>
            </div>

            <!-- 5 Glyphs Grid -->
            <div v-if="heroGlyphsAndTalisman.glyphs.length > 0" class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div
                v-for="g in heroGlyphsAndTalisman.glyphs"
                :key="'glyph-' + g.tier"
                class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col justify-between gap-1.5"
              >
                <div class="flex items-center justify-between text-3xs text-slate-500 dark:text-slate-400">
                  <span class="font-semibold">Glyph {{ g.slot }}</span>
                  <span class="font-bold text-slate-800 dark:text-slate-100">Lv. {{ g.level }}/{{ g.maxLevel }}</span>
                </div>
                <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="g.isMax ? 'bg-amber-500' : 'bg-sky-500'"
                    :style="{ width: `${Math.min(100, Math.round((g.level / g.maxLevel) * 100))}%` }"
                  />
                </div>
                <div v-if="g.isMax" class="text-center text-3xs font-bold text-amber-500 py-0.5">
                  ★ MAX
                </div>
                <div v-else class="grid grid-cols-2 gap-1">
                  <button
                    :id="`btn-glyph-upgrade-${g.tier}`"
                    type="button"
                    :disabled="upgradingGlyphTier !== null || ownedRuneStones <= 0"
                    class="cursor-pointer h-6 rounded text-3xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    :title="`Upgrade Glyph ${g.slot} +1 using Rune Stones`"
                    @click="upgradeGlyphTier(g.tier, 1)"
                  >
                    <span v-if="upgradingGlyphTier === g.tier" class="animate-spin inline-block">↻</span>
                    <span v-else>+1</span>
                  </button>
                  <button
                    type="button"
                    :disabled="upgradingGlyphTier !== null || ownedRuneStones <= 0"
                    class="cursor-pointer h-6 rounded text-3xs font-bold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    :title="`Upgrade Glyph ${g.slot} +5 using Rune Stones`"
                    @click="upgradeGlyphTier(g.tier, 5)"
                  >
                    +5
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="text-xs text-slate-400 italic">No glyph data captured for this hero yet (open Glyphs in-game to capture rune_getAll).</div>

            <!-- Spark of Power Row -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <img :src="getAssetUrl('assets/items/consumable/24.png')" alt="Spark of Power" class="size-5 object-contain shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between text-2xs mb-0.5">
                    <span class="font-bold text-slate-700 dark:text-slate-200">Spark of Power</span>
                    <span class="font-bold text-indigo-600 dark:text-indigo-400">
                      Lv. {{ heroSparkStatus.level }} / {{ heroSparkStatus.maxLevel }}
                    </span>
                  </div>
                  <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="heroSparkStatus.isMax ? 'bg-amber-500' : 'bg-indigo-500'"
                      :style="{ width: `${Math.min(100, Math.round((heroSparkStatus.level / heroSparkStatus.maxLevel) * 100))}%` }"
                    />
                  </div>
                </div>
              </div>

              <div v-if="heroSparkStatus.isMax" class="text-2xs font-bold text-amber-500 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30">
                ★ MAX (30)
              </div>
              <div v-else class="flex items-center gap-1.5 shrink-0">
                <button
                  id="btn-hero-spark-up"
                  type="button"
                  :disabled="isUpgradingSpark || !heroSparkStatus.canUpgrade"
                  class="cursor-pointer h-7 px-2.5 rounded-md text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Upgrade Spark of Power +1"
                  @click="upgradeHeroSpark(1)"
                >
                  <span v-if="isUpgradingSpark" class="animate-spin inline-block">↻</span>
                  <span v-else>+1</span>
                </button>
                <button
                  type="button"
                  :disabled="isUpgradingSpark || !heroSparkStatus.canUpgrade"
                  class="cursor-pointer h-7 px-2.5 rounded-md text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Upgrade Spark of Power +5"
                  @click="upgradeHeroSpark(5)"
                >
                  +5
                </button>
              </div>
            </div>

            <div v-if="heroGlyphsAndTalisman.talismans.length > 0" class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <div class="text-2xs font-bold text-slate-600 dark:text-slate-300">Talismans ({{ heroGlyphsAndTalisman.talismans.length }})</div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="(t, idx) in heroGlyphsAndTalisman.talismans"
                  :key="'talisman-' + idx"
                  class="px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 text-2xs font-semibold text-sky-800 dark:text-sky-300"
                >
                  Talisman #{{ t.id ?? idx + 1 }} · Lv. {{ t.level ?? 1 }}
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
