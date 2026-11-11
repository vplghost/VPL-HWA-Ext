<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const isRegistering = ref(false);

const draftStatus = computed(() => cache.value.legendDraftStatus?.data || {});
const stageId = computed(() => (Number.isInteger(draftStatus.value.stageId) ? draftStatus.value.stageId : 0));

const stageDescription = computed(() => {
  const sId = stageId.value;
  const stages: Record<number, string> = {
    0: 'Not Registered',
    1: 'Searching Match',
    2: 'Defense Draft (Round 1)',
    3: 'Defense Draft (Round 2)',
    4: 'Attack Draft',
    5: 'Battle Ready',
    6: 'In Combat',
    7: 'Match Finished',
  };
  return stages[sId] || 'Draft Active';
});

const matchId = computed(() => draftStatus.value.matchId ?? draftStatus.value.lastResult?.matchId ?? null);
const draftChips = computed(() => cache.value['resource:consumable:40103']?.data?.amount ?? 0);

const lastResult = computed(() => draftStatus.value.lastResult || null);

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

async function registerDraft() {
  isRegistering.value = true;
  try {
    await dispatchRpc([
      { name: 'randomDraft_register' },
      { name: 'randomDraft_getInfo' },
    ]);
  } finally {
    isRegistering.value = false;
  }
}

function getHeroName(id: number | string): string {
  const meta = getHeroMetadata(id);
  return meta?.name || `Hero #${id}`;
}

function handleImgError(e: Event) {
  const target = e.target as HTMLImageElement;
  if (target) target.style.display = 'none';
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      id="draft-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-modal-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      @click.self="close"
    >
      <div
        class="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/80">
          <div class="flex items-center gap-2">
            <span class="inline-flex size-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <h2 id="draft-modal-title" class="text-base font-bold text-slate-900 dark:text-slate-100">
              Legend Draft
            </h2>
            <span
              id="draft-modal-stage-badge"
              class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300 dark:border dark:border-red-700/50"
            >
              {{ stageDescription }}
            </span>
          </div>

          <button
            id="draft-modal-close"
            type="button"
            class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:outline-none dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close dialog"
            @click="close"
          >
            <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div id="draft-modal-body" class="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <!-- Overview Status Banner -->
          <div class="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20 flex items-center justify-between gap-3 flex-wrap">
            <div class="space-y-1">
              <div class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>⚔️</span>
                <span>Legend Draft Arena</span>
                <span v-if="matchId" class="text-xs font-mono font-normal text-slate-500">
                  Match #{{ matchId }}
                </span>
              </div>
              <div class="text-[11px] text-slate-600 dark:text-slate-400">
                Draft counter heroes, lock team lineups, and battle players in real-time draft matches.
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div class="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-bold text-xs text-slate-800 border border-slate-200 shadow-2xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                <span>🎟️ Draft Chips:</span>
                <span class="font-extrabold text-red-600 dark:text-red-400">{{ formatNumber(draftChips) }}</span>
              </div>

              <button
                v-if="stageId === 0 || stageId === 7"
                type="button"
                :disabled="isRegistering"
                class="cursor-pointer px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold shadow-xs transition-colors disabled:opacity-50"
                @click="registerDraft"
              >
                {{ isRegistering ? 'Registering...' : 'Register (1 Chip)' }}
              </button>
            </div>
          </div>

          <!-- Last Result -->
          <div
            v-if="lastResult"
            class="rounded-xl border p-3 flex items-center justify-between text-xs shadow-2xs"
            :class="
              lastResult.win !== false
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200'
            "
          >
            <div class="flex items-center gap-2">
              <span class="font-bold">{{ lastResult.win !== false ? '🏆 Victory' : '❌ Defeat' }}</span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">Previous match outcome</span>
            </div>
            <div v-if="lastResult.score" class="font-mono font-semibold">
              Score: {{ lastResult.score }}
            </div>
          </div>

          <!-- Stage Info & Lineup -->
          <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/60">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>🛡️</span> Stage Lineup & Hero Pool
              </h3>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                Stage ID: {{ stageId }} · {{ stageDescription }}
              </span>
            </div>

            <div v-if="stageId === 0" class="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
              No active draft match. Click Register above or enter Legend Draft in game to start drafting.
            </div>

            <div v-else class="space-y-3">
              <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 space-y-1">
                <div class="font-semibold text-slate-800 dark:text-slate-200">Draft Status:</div>
                <div>{{ stageDescription }}. Select your heroes or counter draft picks in the active game window.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
