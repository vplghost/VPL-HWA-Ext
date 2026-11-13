<script setup lang="ts">
import { computed, ref } from 'vue';
import BaseTooltip from '@/src/components/common/BaseTooltip.vue';
import pickerData from '@/src/data/campaign-picker.json';
import { getItemName } from '@/src/utils/metadata';
import { getItemIcon } from '@/src/utils/itemResources';

const props = defineProps<{ missionId: number; status?: string }>();
const failedImages = ref<Set<string>>(new Set());
const mission = computed(() => (pickerData.missions as Record<string, { name: string; drops: Array<{ category: string; id: number }> }>)[props.missionId]);
const drops = computed(() => (mission.value?.drops || []).map(drop => ({ ...drop,
  key: `${drop.category}:${drop.id}`, name: getItemName(drop.category, drop.id),
  image: getItemIcon(drop.category, drop.id),
})));
function imageFailed(key: string) { failedImages.value = new Set(failedImages.value).add(key); }
</script>

<template>
  <BaseTooltip :content="mission?.name || `Mission #${missionId}`">
    <slot />
    <template #content>
      <div class="w-64 max-w-[calc(100vw-3rem)] space-y-2 whitespace-normal">
        <div class="font-bold">{{ mission?.name || `Mission #${missionId}` }}</div>
        <p v-if="status" class="text-[10px] text-slate-300">{{ status }}</p>
        <div class="text-[10px] text-slate-300">Possible item drops</div>
        <div v-if="drops.length" class="grid grid-cols-2 gap-2">
          <div v-for="drop in drops" :key="drop.key" class="flex items-center gap-1.5 min-w-0">
            <img v-if="drop.image && !failedImages.has(drop.key)" :src="drop.image" alt="" class="size-7 shrink-0 object-contain" @error="imageFailed(drop.key)" />
            <span v-else class="inline-flex size-7 shrink-0 items-center justify-center" aria-hidden="true">📦</span>
            <span class="text-[10px] leading-tight">{{ drop.name }}</span>
          </div>
        </div>
        <p v-else class="text-xs text-slate-400">No item drop information available.</p>
      </div>
    </template>
  </BaseTooltip>
</template>
