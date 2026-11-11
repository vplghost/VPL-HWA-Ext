<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { formatDuration } from '@/src/utils/formatters';

const { cache, dispatchRpc } = useRpcCache();
const now = ref(Date.now());
let timer: any = null;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// Building Queue
const buildingQueue = computed(() => {
  const status = cache.value.buildingStatus?.data || cache.value.building_getQueue?.data;
  if (!status) return null;
  const queue = Array.isArray(status) ? status : (status.queue || []);
  const active = queue.find((q: any) => {
    const end = q.finishTime || (q.startDate && q.duration ? q.startDate + q.duration : null);
    return end && end > now.value;
  });
  if (!active) return null;
  const end = active.finishTime || (active.startDate + active.duration);
  const remainingSec = Math.max(0, Math.ceil((end - now.value) / 1000));
  return {
    name: active.name || `Building #${active.buildingId || active.id || 'Upgrade'}`,
    level: active.level || active.targetLevel,
    remainingSec,
    timerText: formatDuration(remainingSec),
  };
});

// Research Queue
const researchQueue = computed(() => {
  const status = cache.value.researchStatus?.data || cache.value.research_getQueue?.data;
  if (!status) return null;
  const queue = Array.isArray(status) ? status : (status.queue || []);
  const active = queue.find((q: any) => {
    const end = q.finishTime || (q.startDate && q.duration ? q.startDate + q.duration : null);
    return end && end > now.value;
  });
  if (!active) return null;
  const end = active.finishTime || (active.startDate + active.duration);
  const remainingSec = Math.max(0, Math.ceil((end - now.value) / 1000));
  return {
    name: active.name || `Research #${active.researchId || active.id || 'Tech'}`,
    level: active.level || active.targetLevel,
    remainingSec,
    timerText: formatDuration(remainingSec),
  };
});

// Active Marches
const marches = computed(() => {
  const list = cache.value.marchStatus?.data?.marches || [];
  return list
    .filter((m: any) => {
      const end = m.endTime || (m.startTime && m.duration ? m.startTime + m.duration : null);
      return end && end > now.value;
    })
    .map((m: any) => {
      const end = m.endTime || (m.startTime + m.duration);
      const remainingSec = Math.max(0, Math.ceil((end - now.value) / 1000));
      return {
        id: m.id || m.marchId,
        type: m.type || 'March',
        target: m.targetName || `Target #${m.targetId || ''}`,
        remainingSec,
        timerText: formatDuration(remainingSec),
      };
    });
});
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
    <!-- Active Queues (Building & Research) -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 space-y-2 shadow-2xs">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span>⏱️</span> Queues Status
        </h4>
        <span class="text-[10px] text-slate-400">Construction & Academy</span>
      </div>

      <div class="space-y-1.5 text-xs">
        <!-- Building Queue -->
        <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">🏗️</span>
            <div>
              <div class="font-semibold text-slate-800 dark:text-slate-200">
                {{ buildingQueue ? `${buildingQueue.name} (Lv.${buildingQueue.level || '?'})` : 'Building Queue' }}
              </div>
              <div class="text-[10px] text-slate-400">
                {{ buildingQueue ? 'In progress' : 'Idle · Ready to upgrade' }}
              </div>
            </div>
          </div>
          <span
            class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold"
            :class="buildingQueue ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
          >
            {{ buildingQueue ? buildingQueue.timerText : 'Idle' }}
          </span>
        </div>

        <!-- Research Queue -->
        <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">🔬</span>
            <div>
              <div class="font-semibold text-slate-800 dark:text-slate-200">
                {{ researchQueue ? `${researchQueue.name} (Lv.${researchQueue.level || '?'})` : 'Research Queue' }}
              </div>
              <div class="text-[10px] text-slate-400">
                {{ researchQueue ? 'In progress' : 'Idle · Ready to research' }}
              </div>
            </div>
          </div>
          <span
            class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold"
            :class="researchQueue ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
          >
            {{ researchQueue ? researchQueue.timerText : 'Idle' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Active Marches -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 space-y-2 shadow-2xs">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span>🚩</span> Active Marches
        </h4>
        <span class="text-[10px] text-slate-400 tabular-nums">{{ marches.length }} deploying</span>
      </div>

      <div v-if="marches.length === 0" class="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 text-center text-xs text-slate-400">
        No active squad marches outside city
      </div>

      <div v-else class="space-y-1.5 max-h-32 overflow-y-auto pr-1">
        <div
          v-for="m in marches"
          :key="m.id"
          class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between text-xs"
        >
          <div class="flex items-center gap-2">
            <span>⚔️</span>
            <div>
              <div class="font-semibold text-slate-800 dark:text-slate-200">{{ m.type }}</div>
              <div class="text-[10px] text-slate-400 truncate max-w-40">{{ m.target }}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-mono font-semibold text-[11px]">
            {{ m.timerText }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

