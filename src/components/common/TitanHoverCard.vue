<script setup lang="ts">
import { computed } from 'vue';
import { getTitanMetadata, getTitanSoulProgress, starGlowClass } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import { useHoverCardPosition } from '@/src/composables/useHoverCardPosition';

const props = defineProps<{
  titanId: number | string;
  titan: any;
  inventory?: any;
}>();

const { isVisible, cardPositionStyle, anchorRef } = useHoverCardPosition();

const meta = computed(() => getTitanMetadata(props.titanId));

const titanName = computed(() => {
  return meta.value?.name || `Titan #${props.titanId}`;
});

const starCount = computed(() => Number(props.titan?.star) || 1);
const largeGlow = computed(() => starGlowClass(starCount.value, true));

const avatarUrl = computed(() => {
  const file = meta.value?.avatarFile || (meta.value?.hasAvatar ? `assets/titans/${props.titanId}.png` : null);
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(file);
  }
  return file;
});

const ELEMENT_THEMES: Record<string, { dot: string; gradient: string; border: string; bg: string }> = {
  Water: { dot: 'bg-sky-400', gradient: 'from-sky-500 to-blue-700', border: 'border-sky-400/40', bg: 'bg-sky-500/10' },
  Fire: { dot: 'bg-red-500', gradient: 'from-amber-600 to-red-700', border: 'border-red-400/40', bg: 'bg-red-500/10' },
  Earth: { dot: 'bg-emerald-500', gradient: 'from-emerald-600 to-green-800', border: 'border-emerald-400/40', bg: 'bg-emerald-500/10' },
  Darkness: { dot: 'bg-purple-400', gradient: 'from-purple-800 to-slate-900', border: 'border-purple-400/40', bg: 'bg-purple-500/10' },
  Light: { dot: 'bg-amber-300', gradient: 'from-amber-400 to-yellow-600', border: 'border-amber-400/40', bg: 'bg-amber-500/10' },
  Spirit: { dot: 'bg-indigo-400', gradient: 'from-indigo-500 to-violet-700', border: 'border-indigo-400/40', bg: 'bg-indigo-500/10' },
};

const elementTheme = computed(() => {
  const el = meta.value?.element || '';
  return ELEMENT_THEMES[el] || { dot: 'bg-slate-400', gradient: 'from-slate-600 to-slate-800', border: 'border-slate-500/40', bg: 'bg-slate-500/10' };
});

const soulProgress = computed(() => {
  const prog = getTitanSoulProgress(props.titanId, props.titan, props.inventory);
  if (!prog) return { owned: 0, needed: '—', canEvolve: false, percent: 0 };
  const owned = Number(prog.owned) || 0;
  const needed = prog.needed;
  const canEvolve = typeof needed === 'number' && owned >= needed;
  const percent = typeof needed === 'number' && needed > 0 ? Math.min(100, Math.round((owned / needed) * 100)) : 100;
  return { owned, needed, canEvolve, percent };
});

const skillsList = computed(() => {
  const skills = props.titan?.skills;
  if (!skills || typeof skills !== 'object') return [];
  const sortedKeys = Object.keys(skills).sort((a, b) => Number(a) - Number(b));
  return sortedKeys.map((k, idx) => ({
    label: `S${idx + 1}`,
    level: skills[k],
  }));
});

const skinsList = computed(() => {
  const skins = props.titan?.skins;
  if (!skins || typeof skins !== 'object') return [];
  const entries = Object.entries(skins).sort(([a], [b]) => Number(a) - Number(b));
  const skinStats = (globalThis as any).hwaHelperSkinStats || {};
  return entries.map(([skinId, level]) => {
    let stat = skinStats[skinId];
    if (!stat || stat === 'MAIN') stat = 'HP';
    return {
      stat,
      level,
      isCurrent: Number(skinId) === Number(props.titan?.currentSkin),
    };
  });
});

const artifactsList = computed(() => {
  const arts = props.titan?.artifacts;
  if (!Array.isArray(arts) || arts.length === 0) return [];
  const typeNames = ['Wpn', 'Crown', 'Seal'];
  const popupData = (globalThis as any).hwaHelperPopupData;
  return arts.map((art, idx) => {
    const isUpgradable = popupData?.isTitanArtifactUpgradable?.(props.titanId, idx, props.titan, {
      inventoryGet: { data: props.inventory },
      titanGetAll: { data: { [String(props.titanId)]: props.titan } },
    });
    return {
      type: typeNames[idx] || `Art${idx + 1}`,
      star: art?.star ?? 0,
      level: art?.level ?? 1,
      isUpgradable: Boolean(isUpgradable),
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
    <div class="flex items-center gap-3">
      <!-- Big Avatar with Star Glow -->
      <div class="relative size-14 shrink-0 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center" :class="largeGlow">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="titanName"
          class="size-full object-cover"
        />
        <div
          v-else
          class="size-full flex items-center justify-center font-bold text-xl text-white bg-gradient-to-br"
          :class="elementTheme.gradient"
        >
          {{ titanName.charAt(0).toUpperCase() }}
        </div>
      </div>

      <!-- Info Column -->
      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex items-center justify-between gap-1">
          <div class="font-bold text-sm text-white truncate" :title="titanName">
            {{ titanName }}
          </div>
          <span class="text-[10px] font-mono px-1 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
            #{{ titanId }}
          </span>
        </div>

        <!-- Stars Display -->
        <div class="flex items-center gap-1 text-xs">
          <template v-if="starCount >= 6">
            <span class="text-amber-400 font-bold flex items-center gap-0.5">
              <span>★★★★★</span>
              <span class="text-amber-300 font-black">★</span>
              <span class="text-[10px] text-amber-200 ml-1 font-semibold">Absolute</span>
            </span>
          </template>
          <template v-else-if="starCount >= 1">
            <span class="text-amber-400 tracking-wider">
              {{ '★'.repeat(starCount) }}
            </span>
          </template>
          <span v-else class="text-slate-400">Stars: —</span>
        </div>

        <!-- Power -->
        <div class="text-xs text-amber-300 font-semibold tabular-nums flex items-center gap-1">
          <span>⚡ Power:</span>
          <span>{{ formatNumber(titan?.power || 0) }}</span>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-slate-700/80 my-2.5"></div>

    <!-- Metadata Grid -->
    <div class="grid grid-cols-2 gap-2 text-[11px]">
      <!-- Role Box -->
      <div class="rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60">
        <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Role</span>
        <span class="font-medium text-slate-200 block truncate">
          {{ meta?.role || 'Titan' }}
        </span>
      </div>

      <!-- Element Box -->
      <div class="rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60">
        <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Element</span>
        <span class="font-medium text-slate-200 flex items-center gap-1.5 truncate">
          <span class="size-1.5 rounded-full shrink-0" :class="elementTheme.dot"></span>
          <span class="truncate">{{ meta?.element || 'Unknown' }}</span>
        </span>
      </div>

      <!-- Soul Stones Progress -->
      <div class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1.5 ring-1 ring-slate-700/60 space-y-1">
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-slate-400 uppercase tracking-wider font-semibold">Soul Stones</span>
          <span
            class="font-mono font-semibold"
            :class="soulProgress.canEvolve ? 'text-emerald-400' : 'text-slate-300'"
          >
            {{ formatNumber(soulProgress.owned) }} / {{ typeof soulProgress.needed === 'number' ? formatNumber(soulProgress.needed) : soulProgress.needed }}
            <span v-if="soulProgress.canEvolve" class="ml-1 text-[9px] font-bold text-emerald-400">⚡ READY</span>
          </span>
        </div>
        <div class="h-1.5 w-full bg-slate-700/70 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="soulProgress.canEvolve ? 'bg-emerald-400' : 'bg-blue-500'"
            :style="{ width: `${soulProgress.percent}%` }"
          ></div>
        </div>
      </div>

      <!-- Skills Box -->
      <div v-if="skillsList.length > 0" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60">
        <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Skills</span>
        <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            v-for="s in skillsList"
            :key="s.label"
            class="rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300 tabular-nums"
          >
            {{ s.label }}: {{ s.level }}
          </span>
        </div>
      </div>

      <!-- Skins Box -->
      <div v-if="skinsList.length > 0" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60">
        <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Skins</span>
        <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            v-for="s in skinsList"
            :key="s.stat"
            class="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            :class="s.isCurrent ? 'bg-amber-900/60 text-amber-200 ring-1 ring-amber-500/50' : 'bg-slate-700/80 text-amber-300'"
          >
            {{ s.stat }}: {{ s.level }}
          </span>
        </div>
      </div>

      <!-- Artifacts Box -->
      <div v-if="artifactsList.length > 0" class="col-span-2 rounded-md bg-slate-800/80 px-2 py-1 ring-1 ring-slate-700/60">
        <span class="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Artifacts</span>
        <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span
            v-for="a in artifactsList"
            :key="a.type"
            class="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            :class="a.isUpgradable ? 'bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-500/50' : 'bg-slate-700/80 text-violet-300'"
            :title="a.isUpgradable ? 'Artifact ready to upgrade' : ''"
          >
            {{ a.type }}: {{ a.star }}★ Lv.{{ a.level }}
          </span>
        </div>
      </div>
    </div>
  </div>
</Teleport>
</template>
