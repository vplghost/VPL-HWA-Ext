<script setup lang="ts">
import { computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const { cache } = useRpcCache();

interface ActivityRow {
  id: string;
  title: string;
  icon: string;
  state: 'pending' | 'done' | 'info' | 'unknown';
  detail: string;
}

const activities = computed<ActivityRow[]>(() => {
  const rows: ActivityRow[] = [];
  const unknown = 'Waiting for game data';

  // Tower
  const tower = cache.value.towerStatus?.data;
  rows.push({
    id: 'tower',
    title: 'Tower',
    icon: '🗼',
    state: !tower ? 'unknown' : tower.isCleared ? 'done' : 'pending',
    detail: !tower ? unknown : tower.isCleared ? 'Cleared today' : tower.floorNumber ? `Floor ${tower.floorNumber} / 25` : 'Ready to enter',
  });

  // Arena
  const arena = cache.value.arenaGetAll?.data;
  const arenaBattles = cache.value['resource:refillable:6']?.data?.amount;
  rows.push({
    id: 'arena',
    title: 'Arena',
    icon: '⚔️',
    state: typeof arenaBattles === 'number' && arenaBattles > 0 ? 'pending' : 'info',
    detail: arena ? `Rank ${arena.arenaPlace ?? '—'} · ${arenaBattles ?? '—'} battles left today` : unknown,
  });

  // Grand Arena
  const grandBattles = cache.value['resource:refillable:21']?.data?.amount;
  rows.push({
    id: 'grand-arena',
    title: 'Grand Arena',
    icon: '🛡️',
    state: typeof grandBattles === 'number' && grandBattles > 0 ? 'pending' : 'info',
    detail: arena ? `Rank ${arena.grandPlace ?? '—'} · ${grandBattles ?? '—'} battles left today` : unknown,
  });

  // Guild Dungeon
  const dungeon = cache.value.dungeonStatus?.data;
  rows.push({
    id: 'dungeon',
    title: 'Guild Dungeon',
    icon: '🏰',
    state: dungeon ? 'pending' : 'unknown',
    detail: !dungeon ? unknown : `${Number(dungeon.dungeonActivity) || 0} activity points · Floor ${dungeon.floorNumber ?? '—'}`,
  });

  // Hydra
  const hydra = cache.value.clanBoss_getAll?.data;
  const tries = hydra ? (Number(hydra.tries) || 0) + (Number(hydra.superTries) || 0) : 0;
  rows.push({
    id: 'hydra',
    title: 'Hydra',
    icon: '🐉',
    state: !hydra ? 'unknown' : tries > 0 ? 'pending' : 'info',
    detail: !hydra ? unknown : `${hydra.tries ?? 0} regular · ${hydra.superTries ?? 0} super tries left`,
  });

  return rows;
});
</script>

<template>
  <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 space-y-2.5 shadow-2xs">
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <span>🎯</span> Daily Activities & Progress
      </h4>
      <span class="text-[10px] text-slate-400">Tracked from game packets</span>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div
        v-for="act in activities"
        :key="act.id"
        class="p-2 rounded-lg border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between text-xs"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base">{{ act.icon }}</span>
          <div class="min-w-0">
            <div class="font-semibold text-slate-800 dark:text-slate-200 truncate">{{ act.title }}</div>
            <div class="text-[10px] text-slate-400 truncate">{{ act.detail }}</div>
          </div>
        </div>

        <span
          class="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
          :class="{
            'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300': act.state === 'pending',
            'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300': act.state === 'done',
            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400': act.state === 'info',
            'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500': act.state === 'unknown',
          }"
        >
          {{ act.state }}
        </span>
      </div>
    </div>
  </div>
</template>

