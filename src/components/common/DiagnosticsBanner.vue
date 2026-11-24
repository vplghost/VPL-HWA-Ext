<script setup lang="ts">
import { ref, computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    error: string;
    detail?: string | Record<string, any> | null;
    snapshot?: Record<string, any> | null;
    copyButtonId?: string;
    panelId?: string;
  }>(),
  {
    detail: null,
    snapshot: null,
    copyButtonId: undefined,
    panelId: undefined,
  }
);

const showDetails = ref(false);
const copied = ref(false);

const formattedDetail = computed(() => {
  if (!props.detail) return '';
  return typeof props.detail === 'string' ? props.detail : JSON.stringify(props.detail, null, 2);
});

const copyPayload = computed(() => {
  if (props.snapshot) return JSON.stringify(props.snapshot, null, 2);
  return JSON.stringify(
    {
      title: props.title,
      error: props.error,
      detail: props.detail,
      timestamp: new Date().toISOString(),
    },
    null,
    2
  );
});

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(copyPayload.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch (_) {}
}
</script>

<template>
  <div class="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200 space-y-2 text-xs">
    <div class="flex flex-wrap items-center justify-between gap-2 font-semibold">
      <span class="flex items-center gap-1.5">
        <span>⚠️</span>
        <span>{{ title }}</span>
      </span>
      <div class="flex items-center gap-2">
        <button
          :id="copyButtonId"
          type="button"
          class="cursor-pointer px-2 py-0.5 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-800 dark:text-rose-200 text-[10px] font-semibold transition-colors"
          @click="copyDiagnostics"
        >
          {{ copied ? '✓ Copied' : 'Copy Diagnostics' }}
        </button>
        <button
          v-if="detail || snapshot"
          type="button"
          class="cursor-pointer px-2 py-0.5 rounded border border-rose-300 dark:border-rose-700 bg-white/60 dark:bg-slate-900/60 hover:bg-white text-[10px] font-semibold"
          @click="showDetails = !showDetails"
        >
          {{ showDetails ? 'Hide Details' : 'Show Diagnostics' }}
        </button>
      </div>
    </div>

    <p class="font-mono text-[11px] break-words">{{ error }}</p>

    <div
      v-if="showDetails && (detail || snapshot)"
      :id="panelId"
      class="bg-slate-950 text-emerald-300 p-2.5 rounded-lg font-mono text-[10px] leading-relaxed overflow-auto max-h-48 border border-slate-800 whitespace-pre-wrap break-all"
    >
      {{ snapshot ? JSON.stringify(snapshot, null, 2) : formattedDetail }}
    </div>
  </div>
</template>
