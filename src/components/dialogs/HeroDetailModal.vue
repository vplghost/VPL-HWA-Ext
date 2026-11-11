<script setup lang="ts">
import { computed } from 'vue';
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';

const props = defineProps<{
  modelValue: boolean;
  hero: any | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const meta = computed(() => {
  if (!props.hero) return null;
  return getHeroMetadata(props.hero.id);
});

const heroSkills = computed(() => meta.value?.skills || []);

async function upgradeSkill(skillIdx: number) {
  if (!props.hero) return;
  await dispatchRpc([
    {
      name: 'heroUpgradeSkill',
      args: { heroId: props.hero.id, skillId: skillIdx },
      feature: 'hero',
    },
    { name: 'heroGetAll' },
  ]);
}
</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    :title="hero ? `${hero.name} (Lv.${hero.level})` : 'Hero Details'"
    icon="🦸"
    max-width="max-w-xl"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="hero" class="space-y-4">
      <!-- Hero Header Card -->
      <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
        <div class="size-14 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-300 dark:border-slate-600">
          <img
            v-if="hero.avatarFile"
            :src="hero.avatarFile"
            :alt="hero.name"
            class="size-full object-cover"
          />
          <span v-else class="text-2xl">🦸</span>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100">{{ hero.name }}</h4>
            <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              Power: {{ formatNumber(hero.power) }}
            </span>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span>{{ hero.class }} · {{ meta?.faction || 'Hero' }}</span>
            <div class="flex items-center text-amber-400 text-[10px]">
              <span v-for="s in hero.star" :key="s">★</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Equipment Slots -->
      <div class="space-y-2">
        <h5 class="text-xs font-bold text-slate-700 dark:text-slate-300">
          Equipment Slots (6 Slots)
        </h5>
        <div class="grid grid-cols-6 gap-2">
          <div
            v-for="slot in 6"
            :key="slot"
            class="aspect-square rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 text-xs font-mono"
            :title="`Equipment Slot #${slot}`"
          >
            🛡️
          </div>
        </div>
      </div>

      <!-- Skills -->
      <div v-if="heroSkills.length > 0" class="space-y-2">
        <h5 class="text-xs font-bold text-slate-700 dark:text-slate-300">
          Hero Skills
        </h5>
        <div class="space-y-1.5">
          <div
            v-for="(skill, idx) in heroSkills"
            :key="idx"
            class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
          >
            <div class="flex items-center gap-2">
              <span class="text-base">✨</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ skill }}</span>
            </div>
            <button
              type="button"
              class="cursor-pointer px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-semibold"
              @click="upgradeSkill(idx)"
            >
              +1 Skill
            </button>
          </div>
        </div>
      </div>
    </div>
  </ModalDialog>
</template>
