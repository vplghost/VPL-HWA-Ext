<script setup lang="ts">
import type { RecipeNode } from '@/src/utils/recipeTree';

defineProps<{ node: RecipeNode; selectedKey: string | null; isCrafting: boolean; isRunning: boolean }>();
const emit = defineEmits<{ select: [node: RecipeNode]; craft: [node: RecipeNode] }>();
</script>

<template>
  <div class="space-y-1.5" role="treeitem" :aria-label="node.name" :aria-selected="selectedKey === node.key" :data-recipe-key="node.key">
    <div class="p-2 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 transition-colors"
      :class="selectedKey === node.key ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'">
      <button type="button" :disabled="isRunning" class="text-left flex items-center gap-2 min-w-0 cursor-pointer disabled:opacity-50" @click="emit('select', node)">
        <span>{{ node.isScroll ? '📜' : '🧩' }}</span>
        <span class="font-medium">{{ node.name }}</span>
        <span class="text-slate-400 text-2xs">Req: {{ node.requiredCount }} · Available: {{ node.owned }}</span>
      </button>
      <div class="flex items-center gap-1.5">
        <span v-if="node.fragment" class="text-2xs font-semibold px-1.5 py-0.5 rounded"
          :class="node.fragment.isFulfilled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'">
          Fragments: {{ node.fragment.owned }}/{{ node.fragment.required }}
        </span>
        <span v-if="node.cycle" class="text-amber-600">Recipe unavailable</span>
        <button v-else-if="node.canCraft" type="button" :disabled="isCrafting || isRunning"
          class="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-3xs cursor-pointer disabled:opacity-50" @click="emit('craft', node)">Craft</button>
        <span v-else-if="node.isFulfilled" class="text-2xs font-bold text-emerald-600 dark:text-emerald-400">✓ Ready</span>
      </div>
    </div>
    <div v-if="node.children.length" role="group" class="pl-3 sm:pl-4 space-y-1.5 border-l-2 border-indigo-200 dark:border-indigo-800">
      <RecipeTreeNode v-for="child in node.children" :key="child.key" :node="child" :selected-key="selectedKey" :is-crafting="isCrafting" :is-running="isRunning"
        @select="emit('select', $event)" @craft="emit('craft', $event)" />
    </div>
  </div>
</template>
