<script setup lang="ts">
import { computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { useModals } from '@/src/composables/useModals';
import { useNow } from '@/src/composables/useNow';
import { dashboardQueues, dashboardMarches, calculateAccountMaxMarches } from '@/src/utils/dashboardState';
import { getBuildingName, getResearchName } from '@/src/utils/metadata';
import { formatMarchTooltip } from '@/src/utils/marchTooltip';
import { formatCompact } from '@/src/utils/formatters';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';

const { cache } = useRpcCache();
const { openModal } = useModals();
const now = useNow();

const maxMarches = computed(() => calculateAccountMaxMarches(cache.value));

const buildingQueue = computed(() => dashboardQueues(cache.value, 'building', now.value));
const researchQueue = computed(() => dashboardQueues(cache.value, 'research', now.value));
const queueGroups = computed(() => [
  {
    id: 'building',
    title: 'Building Queue',
    icon: '🏗️',
    ...buildingQueue.value,
    slots: buildingQueue.value.slots.map((s) => ({ ...s, name: s.entityId ? getBuildingName(s.entityId) : 'Empty Slot' })),
    rows: buildingQueue.value.rows.map((row) => ({ ...row, name: getBuildingName(row.entityId) })),
  },
  {
    id: 'research',
    title: 'Research Queue',
    icon: '🔬',
    ...researchQueue.value,
    slots: researchQueue.value.slots.map((s) => ({ ...s, name: s.entityId ? getResearchName(s.entityId) : 'Empty Slot' })),
    rows: researchQueue.value.rows.map((row) => ({ ...row, name: getResearchName(row.entityId) })),
  },
]);

const marches = computed(() => dashboardMarches(cache.value, now.value));
const marchesKnown = computed(() => cache.value.marchStatus?.data?.marches != null);

function handleMarchClick(category: string) {
  if (category === 'raid') openModal('raid');
  else if (category === 'gather') openModal('gathering');
  else if (category === 'monster') openModal('monster');
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-stretch">
    <!-- LEFT: Queue Status Section -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 flex flex-col justify-between shadow-2xs">
      <!-- Header -->
      <div class="flex items-center justify-between pb-2">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span>⏱️</span> Queue Status
        </h4>
        <span class="text-[10px] text-slate-400">Construction & Academy</span>
      </div>

      <!-- Queue Cards (Building multi-slot + Research) -->
      <div class="space-y-2 flex-1 flex flex-col justify-between">
        <template v-for="group in queueGroups" :key="group.id">
          <!-- Multi-slot view: Render parallel columns for building slots -->
          <div v-if="group.slots && group.slots.length > 1" class="grid grid-cols-2 gap-2 h-[76px] w-full">
            <button
              v-for="slot in group.slots"
              :key="slot.id || slot.slotIndex"
              type="button"
              class="relative overflow-hidden h-[76px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-left cursor-pointer transition-colors border flex flex-col justify-between"
              :class="
                slot.isIdle
                  ? 'border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                  : group.id === 'research'
                  ? 'border-transparent hover:border-purple-300 dark:hover:border-purple-700/60'
                  : 'border-transparent hover:border-amber-300 dark:hover:border-amber-700/60'
              "
              :aria-label="`Open ${group.title} Slot ${slot.slotIndex}`"
              @click="group.id === 'building' ? openModal('building') : openModal('research')"
            >
              <!-- Background Progress Bar Fill for Active / Ready Items -->
              <div
                v-if="!slot.isIdle && slot.state === 'active' && (slot.progressPercent ?? 0) > 0"
                class="absolute inset-y-0 left-0 pointer-events-none transition-all duration-500 ease-out"
                :class="
                  group.id === 'research'
                    ? 'bg-purple-500/15 dark:bg-purple-400/20'
                    : 'bg-amber-500/15 dark:bg-amber-400/20'
                "
                :style="{ width: `${slot.progressPercent}%` }"
              />
              <div
                v-else-if="!slot.isIdle && slot.state === 'ready'"
                class="absolute inset-y-0 left-0 bg-emerald-500/10 dark:bg-emerald-400/15 pointer-events-none transition-all duration-500 ease-out w-full"
              />

              <!-- Line 1: Title & Icon on Left, Timer / Status Badge on Right -->
              <div class="relative z-10 flex items-center justify-between gap-1">
                <span class="flex items-center gap-1 font-semibold text-[11px] text-slate-800 dark:text-slate-200 truncate">
                  <span>{{ group.icon }}</span>
                  <span class="truncate">Slot {{ slot.slotIndex }}</span>
                </span>
                <span
                  class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums"
                  :class="
                    slot.state === 'ready'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : !slot.isIdle && group.id === 'research'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                      : !slot.isIdle
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  "
                >
                  {{ slot.timerText }}
                </span>
              </div>

              <!-- Line 2: Target Name & Level on Left, Status State on Right -->
              <div class="relative z-10 flex items-center justify-between gap-1 text-[11px]">
                <div v-if="!slot.isIdle" class="font-medium text-slate-800 dark:text-slate-200 truncate min-w-0">
                  {{ slot.name }}<span v-if="slot.level != null" class="text-slate-500 dark:text-slate-400 font-normal"> (Lv.{{ slot.level }})</span>
                </div>
                <div v-else class="text-slate-400 dark:text-slate-500 font-normal truncate min-w-0">
                  {{ slot.state === 'unknown' ? 'Syncing...' : 'Available' }}
                </div>
                <span class="shrink-0 text-[9px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                  {{
                    !slot.isIdle
                      ? slot.state === 'ready'
                        ? '100%'
                        : `${slot.progressPercent ?? 0}%`
                      : 'Idle'
                  }}
                </span>
              </div>

              <!-- Line 3: Action Hint & Arrow -->
              <div class="relative z-10 h-3 flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500">
                <span class="truncate">
                  {{
                    !slot.isIdle
                      ? slot.state === 'ready'
                        ? '✓ Ready to finish'
                        : 'Upgrading'
                      : 'Available slot'
                  }}
                </span>
                <span
                  class="shrink-0 font-medium transition-colors"
                  :class="
                    slot.isIdle
                      ? 'text-slate-500 dark:text-slate-400'
                      : group.id === 'research'
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-amber-600 dark:text-amber-400'
                  "
                >
                  {{ slot.isIdle ? '+ Build →' : 'Manage →' }}
                </span>
              </div>
            </button>
          </div>

          <!-- Single-slot view: Render full-width card -->
          <button
            v-else
            type="button"
            class="relative overflow-hidden w-full h-[76px] p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-left cursor-pointer transition-colors border border-transparent flex flex-col justify-between"
            :class="
              group.id === 'research'
                ? 'hover:border-purple-300 dark:hover:border-purple-700/60'
                : 'hover:border-amber-300 dark:hover:border-amber-700/60'
            "
            :aria-label="`Open ${group.title}`"
            @click="group.id === 'building' ? openModal('building') : openModal('research')"
          >
            <!-- Background Progress Bar Fill for Active / Ready Items -->
            <div
              v-if="group.rows.length && group.rows[0]?.state === 'active' && (group.rows[0]?.progressPercent ?? 0) > 0"
              class="absolute inset-y-0 left-0 pointer-events-none transition-all duration-500 ease-out"
              :class="
                group.id === 'research'
                  ? 'bg-purple-500/15 dark:bg-purple-400/20'
                  : 'bg-amber-500/15 dark:bg-amber-400/20'
              "
              :style="{ width: `${group.rows[0].progressPercent}%` }"
            />
            <div
              v-else-if="group.rows.length && group.rows[0]?.state === 'ready'"
              class="absolute inset-y-0 left-0 bg-emerald-500/10 dark:bg-emerald-400/15 pointer-events-none transition-all duration-500 ease-out w-full"
            />

            <!-- Line 1: Title & Icon on Left, Timer / Status Badge on Right -->
            <div class="relative z-10 flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                <span>{{ group.icon }}</span>
                <span class="truncate">{{ group.title }}</span>
              </span>
              <span
                v-if="group.rows.length && group.rows[0]"
                class="shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums"
                :class="
                  group.rows[0].state === 'ready'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : group.id === 'research'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                "
              >
                {{ group.rows[0].timerText }}
              </span>
              <span
                v-else
                class="shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              >
                {{ group.state === 'unknown' ? 'Syncing' : 'Idle' }}
              </span>
            </div>

            <!-- Line 2: Target Name & Level on Left, Status State on Right -->
            <div class="relative z-10 flex items-center justify-between gap-2 text-xs">
              <div v-if="group.rows.length && group.rows[0]" class="font-medium text-slate-800 dark:text-slate-200 truncate min-w-0">
                {{ group.rows[0].name }}<span v-if="group.rows[0].level != null" class="text-slate-500 dark:text-slate-400 font-normal"> (Lv.{{ group.rows[0].level }})</span>
              </div>
              <div v-else class="text-slate-400 dark:text-slate-500 font-normal truncate min-w-0">
                {{ group.state === 'unknown' ? 'Waiting for game data' : group.id === 'building' ? 'No construction running' : 'No technology researching' }}
              </div>

              <span class="shrink-0 text-[10px] text-slate-400 dark:text-slate-500 font-medium font-mono tabular-nums">
                {{
                  group.rows.length && group.rows[0]
                    ? group.rows[0].state === 'ready'
                      ? 'Ready (100%)'
                      : group.rows[0].progressPercent != null
                        ? `${group.rows[0].progressPercent}%`
                        : 'In progress'
                    : 'Available'
                }}
              </span>
            </div>

            <!-- Line 3: Action Hint & Arrow -->
            <div class="relative z-10 h-3.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
              <span class="truncate">
                {{
                  group.rows.length && group.rows[0]
                    ? group.rows[0].state === 'ready'
                      ? '✓ Ready to finish · Click to collect'
                      : 'Upgrading · Click to manage'
                    : 'Idle · Click to manage'
                }}
              </span>
              <span
                class="shrink-0 text-[9px] font-medium transition-colors"
                :class="
                  group.id === 'research'
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-amber-600 dark:text-amber-400'
                "
              >
                Manage →
              </span>
            </div>
          </button>
        </template>
      </div>
    </div>

    <!-- RIGHT: Active Marches Section -->
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3 flex flex-col justify-between shadow-2xs">
      <!-- Header -->
      <div class="flex items-center justify-between pb-2">
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <span>🚩</span> Active Marches
        </h4>
        <span class="text-[10px] text-slate-400 tabular-nums">{{ marches.length }} / {{ maxMarches }} active</span>
      </div>

      <!-- Marches Cards Container: Height locked to exactly 160px (matching the 2 queue cards) -->
      <div v-if="marches.length === 0" class="h-[160px] flex flex-col justify-center items-center rounded-lg bg-slate-50 dark:bg-slate-900/40 text-center text-xs text-slate-400 p-4 border border-dashed border-slate-200 dark:border-slate-800">
        <span class="text-base mb-1">🚩</span>
        <span class="font-medium text-slate-600 dark:text-slate-300">{{ marchesKnown ? 'No active squad marches outside city' : 'Waiting for game data' }}</span>
        <span class="text-[10px] text-slate-400/80 mt-0.5">All {{ maxMarches }} squad slots are idle in outpost</span>
      </div>

      <!-- Marches List: Exactly 160px height in a 2-column grid, eliminating scroll for <= 4 marches -->
      <div
        v-else
        class="h-[160px] grid grid-cols-2 gap-2 content-start"
        :class="marches.length > maxMarches || marches.length > 4 ? 'overflow-y-auto pr-0.5' : 'overflow-hidden'"
      >
        <BaseTooltip
          v-for="m in marches"
          :key="m.id"
          class="w-full min-w-0 block"
          :content="formatMarchTooltip(m.march, now, cache)"
          placement="bottom"
        >
          <button
            type="button"
            class="w-full h-[76px] p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 text-left transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 flex flex-col justify-between"
            :class="{ 'cursor-pointer': m.category !== 'other' }"
            @click="handleMarchClick(m.category)"
          >
            <!-- Line 1: March Icon & Title on Left, Timer Badge on Right -->
            <div class="flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                <span>{{ m.icon }}</span>
                <span class="truncate">{{ m.title }}</span>
              </span>
              <span
                class="shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums"
                :class="
                  m.stage === 'In battle'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : m.category === 'gather'
                      ? (m.gathering?.type === 'food'
                        ? 'bg-lime-100 text-lime-900 dark:bg-lime-950/70 dark:text-lime-200'
                        : m.gathering?.type === 'wood'
                          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200'
                          : m.gathering?.type === 'stone'
                            ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                            : m.gathering?.type === 'iron'
                              ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/70 dark:text-cyan-200'
                              : 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300')
                      : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                "
              >
                {{ m.timerText }}
              </span>
            </div>

            <!-- Line 2: Target on Left, Stage on Right -->
            <div class="flex items-center justify-between gap-2 text-xs">
              <div class="font-medium text-slate-800 dark:text-slate-200 truncate min-w-0" :title="m.target">
                {{ m.target }}
              </div>
              <span class="shrink-0 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                {{ m.stage }}
              </span>
            </div>

            <!-- Line 3: Progress Bar (if gathering) or Stage Details & Arrow -->
            <div class="h-3.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
              <template v-if="m.gathering && m.gathering.progress != null">
                <div class="w-full flex items-center gap-2">
                  <div
                    class="grow h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700"
                    role="progressbar"
                    :aria-label="`${m.gathering.resource || 'Resource'} progress`"
                    :aria-valuenow="m.gathering.progress"
                    :aria-valuemin="0"
                    :aria-valuemax="100"
                  >
                    <div
                      class="h-full transition-[width]"
                      :class="
                        m.gathering.type === 'food'
                          ? 'bg-lime-500'
                          : m.gathering.type === 'wood'
                            ? 'bg-emerald-500'
                            : m.gathering.type === 'stone'
                              ? 'bg-slate-500'
                              : m.gathering.type === 'iron'
                                ? 'bg-cyan-500'
                                : 'bg-teal-500'
                      "
                      :style="{ width: `${m.gathering.progress}%` }"
                    />
                  </div>
                  <span
                    class="shrink-0 tabular-nums font-mono text-[9px] font-semibold"
                    :class="
                      m.gathering.type === 'food'
                        ? 'text-lime-700 dark:text-lime-300'
                        : m.gathering.type === 'wood'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : m.gathering.type === 'stone'
                            ? 'text-slate-700 dark:text-slate-300'
                            : m.gathering.type === 'iron'
                              ? 'text-cyan-700 dark:text-cyan-300'
                              : 'text-teal-700 dark:text-teal-300'
                    "
                  >
                    {{ m.gathering.progress }}%<template v-if="m.gathering.collected != null"> ({{ formatCompact(m.gathering.collected) }}<template v-if="m.gathering.total != null">/{{ formatCompact(m.gathering.total) }}</template>)</template>
                  </span>
                </div>
              </template>
              <template v-else>
                <span class="truncate">
                  {{
                    m.stage === 'In battle'
                      ? '⚔️ Battle underway · Awaiting report'
                      : m.stage === 'Returning'
                        ? '↩️ Squad returning to outpost'
                        : m.stage === 'Preparing rally'
                          ? '⏳ Assembling rally members'
                          : '🏹 Traveling to coordinates'
                  }}
                </span>
                <span v-if="m.category !== 'other'" class="shrink-0 text-[9px] opacity-70">View →</span>
              </template>
            </div>
          </button>
        </BaseTooltip>

        <!-- Placeholders up to account maxMarches (to maintain visual symmetry without false slots) -->
        <div
          v-for="idx in Math.max(0, maxMarches - marches.length)"
          :key="`march-slot-${idx}`"
          class="w-full h-[76px] p-2.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex flex-col justify-between text-xs text-slate-400"
        >
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400 truncate">
              <span>🚩</span> Squad Slot {{ marches.length + idx }}
            </span>
            <span class="shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-400">
              Idle
            </span>
          </div>
          <div class="text-[11px] text-slate-400/90 truncate">Ready for gathering, boss raid, or monster hunt</div>
          <div class="h-3.5 flex items-center justify-between text-[10px] text-slate-400/70">
            <span class="truncate">Dispatched squads will appear here</span>
            <span class="shrink-0 text-[9px]">Outpost ready</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
