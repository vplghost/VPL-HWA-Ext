<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import pickerData from '@/src/data/campaign-picker.json';
import MissionDropTooltip from './MissionDropTooltip.vue';

const props = defineProps<{ modelValue: number; disabled?: boolean; isMissionDisabled: (id: number) => boolean; missionStatus: (id: number) => string }>();
const emit = defineEmits<{ (e: 'update:modelValue', id: number): void }>();
interface Mission { id: number; chapter: number; index: number; isHeroic: boolean }
const missions = Object.values((globalThis as any).hwaHelperCampaignMissions?.missions || {}) as Mission[];
const names = pickerData.missions as Record<string, { name: string }>;
const chapters = Object.entries(pickerData.chapters).map(([id, name]) => ({ id: Number(id), name }));
const chapter = ref(missions.find(m => m.id === props.modelValue)?.chapter || chapters[0]?.id || 1);
const open = ref(false);
const list = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
function closeList() { open.value = false; trigger.value?.focus(); }
function escapeList(event: KeyboardEvent) {
  if (!open.value) return;
  event.stopPropagation();
  event.preventDefault();
  closeList();
}
const chapterMissions = computed(() => missions.filter(m => m.chapter === chapter.value).sort((a, b) => a.index - b.index));
const missionName = (id: number) => names[id]?.name || `Mission #${id}`;
watch(() => props.modelValue, id => {
  const mission = missions.find(m => m.id === id);
  if (mission) chapter.value = mission.chapter;
});
watch(() => props.disabled, disabled => { if (disabled) open.value = false; });
function selectMission(id: number) {
  if (props.disabled || props.isMissionDisabled(id)) return;
  emit('update:modelValue', id);
  closeList();
}
function changeChapter() {
  if (props.disabled) return;
  const first = chapterMissions.value[0];
  if (first && !props.disabled) emit('update:modelValue', first.id);
  open.value = true;
}
async function openList() {
  if (props.disabled) return;
  open.value = true;
  await nextTick();
  list.value?.querySelector<HTMLButtonElement>('button[aria-selected="true"]')?.focus();
  if (!list.value?.contains(document.activeElement)) list.value?.querySelector<HTMLButtonElement>('button[data-mission]')?.focus();
}
function navigate(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const rows = [...(list.value?.querySelectorAll<HTMLButtonElement>('button[data-mission]') || [])];
  const index = rows.findIndex(row => row === document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
    : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
  rows[next]?.focus();
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" @keydown.esc="escapeList">
    <div>
      <label for="campaign-chapter-select" class="block text-xs text-slate-500 mb-1">Chapter</label>
      <select id="campaign-chapter-select" v-model.number="chapter" :disabled="disabled" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs" @change="changeChapter">
        <option v-for="entry in chapters" :key="entry.id" :value="entry.id">{{ entry.id }} · {{ entry.name }}</option>
      </select>
    </div>
    <div class="relative" @focusout="!($event.currentTarget as HTMLElement)?.contains($event.relatedTarget as Node) && (open = false)">
      <label id="campaign-mission-label" class="block text-xs text-slate-500 mb-1">Mission</label>
      <MissionDropTooltip :mission-id="modelValue" :status="missionStatus(modelValue)" class="w-full">
        <button id="campaign-mission-input" ref="trigger" type="button" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="open" aria-controls="campaign-mission-options" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-left" @click="open = !open" @keydown.down.prevent="openList">{{ missionName(modelValue) }} ▾</button>
      </MissionDropTooltip>
      <div v-if="open" id="campaign-mission-options" ref="list" role="listbox" aria-labelledby="campaign-mission-label" class="absolute right-0 top-full z-20 mt-1 w-full min-w-56 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1" @keydown="navigate">
        <MissionDropTooltip v-for="mission in chapterMissions" :key="mission.id" :mission-id="mission.id" :status="missionStatus(mission.id)" class="w-full">
          <button type="button" role="option" :aria-selected="modelValue === mission.id" :aria-disabled="isMissionDisabled(mission.id)" :data-mission="mission.id" class="w-full rounded px-2 py-2 text-left text-xs hover:bg-indigo-50 focus:bg-indigo-50 dark:hover:bg-slate-800 dark:focus:bg-slate-800 focus:outline-hidden" :class="[isMissionDisabled(mission.id) ? 'opacity-50' : '', modelValue === mission.id ? 'font-bold text-indigo-600 dark:text-indigo-400' : '']" @click="selectMission(mission.id)">
            {{ missionName(mission.id) }}<span v-if="mission.isHeroic" class="ml-1 text-[10px]">· Hero</span>
          </button>
        </MissionDropTooltip>
      </div>
    </div>
  </div>
</template>
