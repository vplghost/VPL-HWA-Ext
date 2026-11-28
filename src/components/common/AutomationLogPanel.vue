<script setup lang="ts">
import { ref, computed } from 'vue';

export interface AutomationLogEntry {
  ts?: string;
  time?: string;
  level?: 'info' | 'warn' | 'error';
  tone?: 'info' | 'ok' | 'warn' | 'err';
  text: string;
}

const props = withDefaults(
  defineProps<{
    entries?: AutomationLogEntry[];
    logs?: AutomationLogEntry[];
    title?: string;
    maxHeight?: string;
    emptyText?: string;
  }>(),
  {
    entries: undefined,
    logs: undefined,
    title: 'Automation Log',
    maxHeight: 'max-h-44',
    emptyText: 'No log entries yet.',
  }
);

const emit = defineEmits<{
  (e: 'clear'): void;
}>();

const filterLevel = ref<'all' | 'warn' | 'error'>('all');
const copied = ref(false);

function normalizeLevel(entry: AutomationLogEntry): 'info' | 'warn' | 'error' {
  if (entry.level === 'error' || entry.tone === 'err') return 'error';
  if (entry.level === 'warn' || entry.tone === 'warn') return 'warn';
  return 'info';
}

const normalizedEntries = computed<Array<{ ts?: string; level: 'info' | 'warn' | 'error'; text: string }>>(() => {
  const raw = Array.isArray(props.entries) ? props.entries : Array.isArray(props.logs) ? props.logs : [];
  return raw
    .filter((e): e is AutomationLogEntry => Boolean(e && typeof e === 'object'))
    .map((e) => ({
      ts: e.ts || e.time,
      level: normalizeLevel(e),
      text: String(e.text ?? ''),
    }));
});

const filteredEntries = computed(() => {
  if (filterLevel.value === 'all') return normalizedEntries.value;
  if (filterLevel.value === 'warn') {
    return normalizedEntries.value.filter((e) => e.level === 'warn' || e.level === 'error');
  }
  return normalizedEntries.value.filter((e) => e.level === 'error');
});

async function copyLog() {
  try {
    const text = filteredEntries.value
      .map((e) => `${e.ts ? `[${e.ts}] ` : ''}[${(e.level || 'info').toUpperCase()}] ${e.text}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1800);
  } catch (_) {}
}
</script>

<template>
  <div class="rounded-xl border border-slate-800 bg-slate-950 text-slate-200 overflow-hidden">
    <div class="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-900/80 text-[11px]">
      <span class="font-bold text-slate-300">{{ title }} ({{ filteredEntries.length }})</span>
      <div class="flex items-center gap-1.5">
        <select
          v-model="filterLevel"
          aria-label="Filter log level"
          class="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-200"
        >
          <option value="all">All</option>
          <option value="warn">Warn+</option>
          <option value="error">Error</option>
        </select>
        <button
          type="button"
          class="cursor-pointer px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-medium"
          @click="copyLog"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <button
          type="button"
          class="cursor-pointer px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-700 text-[10px] font-medium"
          @click="emit('clear')"
        >
          Clear
        </button>
      </div>
    </div>
    <div :class="maxHeight" class="overflow-y-auto p-2.5 font-mono text-[11px] space-y-1">
      <div v-if="filteredEntries.length === 0" class="text-slate-500 italic">{{ emptyText }}</div>
      <div
        v-for="(entry, idx) in filteredEntries"
        :key="idx"
        class="leading-relaxed break-words"
        :class="
          entry.level === 'error'
            ? 'text-rose-400'
            : entry.level === 'warn'
              ? 'text-amber-300'
              : 'text-emerald-300'
        "
      >
        <span v-if="entry.ts" class="text-slate-500 mr-1.5">[{{ entry.ts }}]</span>
        <span>{{ entry.text }}</span>
      </div>
    </div>
  </div>
</template>
