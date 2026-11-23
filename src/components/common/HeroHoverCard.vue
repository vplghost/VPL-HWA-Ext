<script setup lang="ts">
import UnitStars from '@/src/components/common/UnitStars.vue';
import { computed } from 'vue';
import {
  getHeroMetadata,
  getHeroEquipmentRank,
  getHeroSoulProgress,
  getItemName,
  getGearBorderClass,
  starGlowClass,
} from '@/src/utils/metadata';
import { skinStats, getHeroGlyphs, getHeroName, heroMetadata } from '@/src/data/heroMetadata';
import { getHeroMainStat } from '@/src/utils/skinHelper';
import { getHeroArtifactTierStyle } from '@/src/utils/popupData';
import { getItemIcon } from '@/src/utils/itemResources';
import { formatNumber } from '@/src/utils/formatters';
import { useHoverCardPosition } from '@/src/composables/useHoverCardPosition';

const props = defineProps<{
  heroId: number | string;
  hero: any;
  inventory?: any;
}>();

const { isVisible, cardPositionStyle, anchorRef } = useHoverCardPosition();

const meta = computed(() => getHeroMetadata(props.heroId));

const heroName = computed(() => {
  return meta.value?.name || getHeroName(props.heroId) || `Hero #${props.heroId}`;
});

const starCount = computed(() => Number(props.hero?.star) || 1);
const largeGlow = computed(() => starGlowClass(starCount.value, true));

const avatarUrl = computed(() => {
  const file = meta.value?.avatarFile || (meta.value?.hasAvatar ? `assets/heroes/${props.heroId}.webp` : null);
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
});

function resolveItemIcon(path: string | null): string {
  if (!path) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

const FACTION_THEMES: Record<string, { dot: string; gradient: string }> = {
  'Way of Eternity': { dot: 'bg-purple-400', gradient: 'from-purple-600 to-indigo-800' },
  'Way of Nature': { dot: 'bg-emerald-400', gradient: 'from-emerald-600 to-teal-800' },
  'Way of Honor': { dot: 'bg-amber-400', gradient: 'from-amber-600 to-orange-800' },
  'Way of Progress': { dot: 'bg-blue-400', gradient: 'from-blue-600 to-cyan-800' },
  'Way of Mystery': { dot: 'bg-indigo-400', gradient: 'from-indigo-600 to-violet-800' },
  'Way of Chaos': { dot: 'bg-red-400', gradient: 'from-red-600 to-rose-800' },
};

const factionTheme = computed(() => {
  const f = meta.value?.faction || '';
  return FACTION_THEMES[f] || { dot: 'bg-slate-400', gradient: 'from-slate-600 to-slate-800' };
});

const equipmentRank = computed(() => {
  return getHeroEquipmentRank(props.hero?.color);
});

const soulProgress = computed(() => {
  const prog = getHeroSoulProgress(props.heroId, props.hero, props.inventory);
  if (!prog) return { owned: 0, needed: '—', canEvolve: false, percent: 0 };
  const owned = Number(prog.owned) || 0;
  const needed = prog.needed;
  const canEvolve = typeof needed === 'number' && owned >= needed;
  const percent = typeof needed === 'number' && needed > 0 ? Math.min(100, Math.round((owned / needed) * 100)) : 100;
  return { owned, needed, canEvolve, percent };
});

// Equipment slots (1..6) status with gear image, rarity border, and equipped opacity
const equipmentSlots = computed(() => {
  const heroColor = Number(props.hero?.color) || 1;
  const gearIds = meta.value?.equipment?.[String(heroColor)] || [];
  const slots = props.hero?.slots;

  const result = [];
  for (let i = 0; i < 6; i++) {
    let isEquipped = false;
    if (slots) {
      if (Array.isArray(slots)) {
        isEquipped = i < slots.length && slots[i] !== undefined && slots[i] !== null;
      } else if (typeof slots === 'object') {
        isEquipped = Object.hasOwn(slots, String(i)) || Object.hasOwn(slots, i);
      }
    }

    const gearId = gearIds[i] ? Number(gearIds[i]) : null;
    const itemName = gearId ? (getItemName('gear', gearId) || `Gear #${gearId}`) : `Slot ${i + 1}`;
    const iconPath = gearId ? getItemIcon('gear', gearId) : null;
    const iconUrl = resolveItemIcon(iconPath);
    const borderClass = getGearBorderClass(gearId, heroColor);

    result.push({
      id: i + 1,
      gearId,
      itemName,
      iconUrl,
      borderClass,
      isEquipped,
    });
  }
  return result;
});

// Skills deltas and threshold calculation (Skill 1: 0, Skill 2: 0, Skill 3: 20, Skill 4: 40)
const SKILL_DELTAS = [0, 0, 20, 40];

const skillsList = computed(() => {
  const skills = props.hero?.skills;
  if (!skills || typeof skills !== 'object') return [];
  const heroLevel = Number(props.hero?.level) || 1;
  const sortedKeys = Object.keys(skills).sort((a, b) => Number(a) - Number(b));

  return sortedKeys.map((k, idx) => {
    const rawLvl = Number(skills[k]) || 0;
    const delta = SKILL_DELTAS[idx] ?? 0;
    // Display level adjusts by delta offset (e.g. Skill 3 -20, Skill 4 -40)
    const displayLvl = rawLvl > delta ? rawLvl - delta : rawLvl;
    const maxLvl = Math.max(0, heroLevel - delta);
    // Reached threshold if displayLvl reaches maxLvl or rawLvl reaches heroLevel
    const isThreshold = maxLvl > 0 && (displayLvl >= maxLvl || rawLvl >= heroLevel);

    return {
      slot: idx + 1,
      level: displayLvl,
      rawLevel: rawLvl,
      maxLevel: maxLvl,
      isThreshold,
      title: `Skill ${idx + 1}: Lv. ${displayLvl} / ${maxLvl}${isThreshold ? ' (MAX)' : ''}`,
    };
  });
});

const skinsList = computed(() => {
  const skins = props.hero?.skins;
  if (!skins || typeof skins !== 'object') return [];
  const entries = Object.entries(skins).sort(([a], [b]) => Number(a) - Number(b));
  const statsMap = (typeof skinStats !== 'undefined' ? skinStats : undefined) || {};
  return entries.map(([skinId, level]) => {
    let stat = statsMap[skinId];
    if (!stat || stat === 'MAIN') {
      const mStat = getHeroMainStat(props.hero?.id || props.heroId);
      stat = mStat === 'strength' ? 'Str' : mStat === 'agility' ? 'Agi' : 'Int';
    }
    if (stat === 'Dodge') stat = 'Ddg';
    return {
      stat,
      level,
      isCurrent: Number(skinId) === Number(props.hero?.currentSkin),
    };
  });
});

const glyphsList = computed(() => {
  const rawRunes = props.hero?.hero_runes || props.hero?.runes;
  const runes = Array.isArray(rawRunes)
    ? rawRunes
    : (rawRunes && typeof rawRunes === 'object' ? Object.values(rawRunes) : null);
  if (!Array.isArray(runes) || runes.length === 0 || !runes.some((r: any) => Number(r) > 0)) {
    return [];
  }
  const glyphStats = getHeroGlyphs(props.heroId) || ['PA', 'Arm', 'HP', 'MD', 'Str'];
  return runes.map((lvl: any, idx: number) => {
    let stat = glyphStats[idx] || `G${idx + 1}`;
    if (stat === 'Dodge') stat = 'Ddg';
    return {
      stat,
      level: Number(lvl) || 0,
    };
  });
});

const artifactsList = computed(() => {
  const arts = props.hero?.artifacts;
  if (!Array.isArray(arts) || arts.length === 0) return [];
  const typeAbbr: Record<string, string> = { weapon: 'Wpn', book: 'Book', ring: 'Ring' };
  return arts.map((art: any) => {
    const artLvl = Number(art.level) || 0;
    const tierStyle = getHeroArtifactTierStyle(artLvl);
    const name = typeAbbr[art.artifactType] || art.artifactType || 'Art';
    return {
      name,
      star: Number(art.star) || 0,
      level: artLvl,
      badgeClass: tierStyle.badge,
    };
  });
});
</script>

<template>
  <span ref="anchorRef" class="hidden" aria-hidden="true"></span>
  <Teleport to="body">
    <div
      v-if="isVisible"
      class="hero-hover-card text-left select-none pointer-events-none"
      :style="cardPositionStyle"
    >
      <!-- Header: Avatar + Identity + Star + Power -->
      <div class="flex items-center gap-2.5">
        <!-- Big Avatar with Star Glow -->
        <div class="relative size-12 shrink-0 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center" :class="largeGlow">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="heroName"
            class="size-full object-cover"
          />
          <div
            v-else
            class="size-full flex items-center justify-center font-bold text-lg text-white bg-gradient-to-br"
            :class="factionTheme.gradient"
          >
            {{ heroName.charAt(0).toUpperCase() }}
          </div>
        </div>

        <!-- Info Column -->
        <div class="min-w-0 flex-1 space-y-0.5">
          <div class="flex items-center justify-between gap-1">
            <div class="font-bold text-xs text-white truncate" :title="heroName">
              {{ heroName }}
            </div>
            <span class="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
              #{{ heroId }}
            </span>
          </div>

          <!-- Stars Display -->
          <div class="flex items-center gap-1 text-[11px]">
            <UnitStars :count="starCount" />
          </div>

          <!-- Power -->
          <div class="text-[11px] text-amber-300 font-semibold tabular-nums flex items-center gap-1">
            <span>⚡ Power:</span>
            <span>{{ formatNumber(hero?.power || 0) }}</span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-slate-700/80 my-2"></div>

      <!-- Metadata Grid -->
      <div class="grid grid-cols-2 gap-1.5 text-[11px]">
        <!-- Role Box -->
        <div class="rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60">
          <span class="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Role</span>
          <span class="font-medium text-slate-200 block truncate text-[11px]">
            {{ meta?.class || 'Other' }} <template v-if="meta?.role">({{ meta.role }})</template>
          </span>
        </div>

        <!-- Faction Box -->
        <div class="rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60">
          <span class="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Faction</span>
          <span class="font-medium text-slate-200 flex items-center gap-1.5 truncate text-[11px]">
            <span class="size-1.5 rounded-full shrink-0" :class="factionTheme.dot"></span>
            <span class="truncate">{{ (meta?.faction || 'Unknown').replace('Way of ', '') }}</span>
          </span>
        </div>

        <!-- Unified Equipment Rank & Gear Slots Box -->
        <div class="col-span-2 rounded-md bg-slate-800/80 px-2.5 py-1.5 ring-1 ring-slate-700/60 space-y-1.5">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-slate-400 uppercase tracking-wider font-semibold">Equipment</span>
            <span
              v-if="equipmentRank"
              class="font-bold text-xs"
              :style="{ color: equipmentRank.color, textShadow: equipmentRank.textShadow }"
            >
              {{ equipmentRank.label }}
            </span>
          </div>

          <!-- 6 Gear Slot Thumbnails -->
          <div class="grid grid-cols-6 gap-1 pt-0.5">
            <div
              v-for="s in equipmentSlots"
              :key="s.id"
              class="relative aspect-square rounded-md bg-slate-900/90 flex items-center justify-center overflow-hidden border transition-all"
              :class="[
                s.borderClass,
                s.isEquipped ? 'opacity-100 shadow-2xs' : 'opacity-35 grayscale',
              ]"
              :title="`Slot ${s.id}: ${s.itemName} (${s.isEquipped ? 'Equipped' : 'Not equipped'})`"
            >
              <img
                v-if="s.iconUrl"
                :src="s.iconUrl"
                :alt="s.itemName"
                class="size-full object-contain p-0.5"
                loading="lazy"
              />
              <span v-else class="text-[9px] font-bold text-slate-400">
                {{ s.id }}
              </span>
              <span
                v-if="s.isEquipped"
                class="absolute bottom-0.5 right-0.5 size-1 rounded-full bg-emerald-400 shadow-xs"
              ></span>
            </div>
          </div>
        </div>

        <!-- Soul Stones Progress -->
        <div class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-slate-400 uppercase tracking-wider font-semibold">Soul Stones</span>
            <span
              class="font-mono font-semibold"
              :class="soulProgress.canEvolve ? 'text-emerald-400' : 'text-slate-300'"
            >
              {{ formatNumber(soulProgress.owned) }} / {{ typeof soulProgress.needed === 'number' ? formatNumber(soulProgress.needed) : soulProgress.needed }}
              <span v-if="soulProgress.canEvolve" class="ml-1 text-emerald-400 font-bold">✨ Ready</span>
            </span>
          </div>
          <div v-if="typeof soulProgress.needed === 'number'" class="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="soulProgress.canEvolve ? 'bg-emerald-400' : 'bg-blue-500'"
              :style="{ width: `${soulProgress.percent}%` }"
            ></div>
          </div>
        </div>

        <!-- Spark of Power -->
        <div v-if="hero?.titanGiftLevel" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 flex items-center justify-between text-[10px]">
          <span class="text-slate-400 uppercase tracking-wider font-semibold">Spark of Power</span>
          <span class="font-semibold text-purple-300 text-xs tabular-nums">
            Lv. {{ hero.titanGiftLevel }} / 30
          </span>
        </div>

        <!-- Skills: No S1/S2/S3/S4, 1-line layout, threshold highlighted -->
        <div v-if="skillsList.length > 0" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 flex items-center justify-between gap-1.5">
          <span class="text-slate-400 text-[10px] uppercase tracking-wider font-semibold shrink-0">Skills</span>
          <div class="flex items-center gap-1 flex-wrap justify-end">
            <span
              v-for="sk in skillsList"
              :key="sk.slot"
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums border transition-colors"
              :class="
                sk.isThreshold
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-2xs font-bold ring-1 ring-amber-500/30'
                  : 'bg-slate-700/80 text-sky-300 border-slate-600/50'
              "
              :title="sk.title"
            >
              {{ sk.level }}
            </span>
          </div>
        </div>

        <!-- Skins: inline compact layout -->
        <div v-if="skinsList.length > 0" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 flex items-center justify-between gap-1.5">
          <span class="text-slate-400 text-[10px] uppercase tracking-wider font-semibold shrink-0">Skins</span>
          <div class="flex items-center gap-1 flex-wrap justify-end">
            <span
              v-for="(sk, idx) in skinsList"
              :key="idx"
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              :class="sk.isCurrent ? 'bg-amber-900/60 text-amber-200 ring-1 ring-amber-500/50' : 'bg-slate-700/80 text-amber-300'"
            >
              {{ sk.stat }}: {{ sk.level }}
            </span>
          </div>
        </div>

        <!-- Glyphs: inline compact layout -->
        <div v-if="glyphsList.length > 0" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 flex items-center justify-between gap-1.5">
          <span class="text-slate-400 text-[10px] uppercase tracking-wider font-semibold shrink-0">Glyphs</span>
          <div class="flex items-center gap-1 flex-wrap justify-end">
            <span
              v-for="g in glyphsList"
              :key="g.stat"
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              :class="g.level > 0 ? 'bg-slate-700/80 text-emerald-300' : 'bg-slate-800 text-slate-500'"
            >
              {{ g.stat }}: {{ g.level }}
            </span>
          </div>
        </div>

        <!-- Artifacts: inline compact layout -->
        <div v-if="artifactsList.length > 0" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60 flex items-center justify-between gap-1.5">
          <span class="text-slate-400 text-[10px] uppercase tracking-wider font-semibold shrink-0">Artifacts</span>
          <div class="flex items-center gap-1 flex-wrap justify-end">
            <span
              v-for="art in artifactsList"
              :key="art.name"
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              :class="art.badgeClass"
            >
              {{ art.name }}: {{ art.star }}★ Lv.{{ art.level }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
