<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Props {
  message?: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  canRefresh?: boolean;
  refreshTitle?: string;
  onRefresh?: () => Promise<boolean | void>;
}

const props = withDefaults(defineProps<Props>(), {
  message: '',
  type: undefined,
  canRefresh: true,
  refreshTitle: 'Refresh marches and troops',
  onRefresh: undefined
});

const emit = defineEmits<{
  (e: 'refreshed'): void;
}>();

const actionState = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
const localSuccessMessage = ref<string>('');

watch(() => props.message, (newVal) => {
  if (actionState.value !== 'loading') {
    actionState.value = 'idle';
    localSuccessMessage.value = '';
  }
});

const bannerType = computed<'info' | 'warning' | 'error' | 'success'>(() => {
  if (actionState.value === 'success') return 'success';
  if (actionState.value === 'error') return 'error';
  if (props.type) return props.type;

  const msg = (props.message || '').toLowerCase();
  if (props.message?.startsWith('✓')) return 'success';
  if (msg.includes('error') || msg.includes('failed') || msg.includes('could not')) return 'error';
  if (props.message?.includes('⚠️') || msg.includes('refresh') || msg.includes('wait') || msg.includes('invalid')) return 'warning';
  return 'info';
});

const displayMessage = computed(() => {
  if (actionState.value === 'success' && localSuccessMessage.value) {
    return localSuccessMessage.value;
  }
  return props.message;
});

const containerClasses = computed(() => {
  switch (bannerType.value) {
    case 'success':
      return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200';
    case 'error':
      return 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200';
    case 'warning':
      return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200';
    case 'info':
    default:
      return 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200';
  }
});

const buttonClasses = computed(() => {
  switch (bannerType.value) {
    case 'success':
      return 'border-emerald-300 dark:border-emerald-700 bg-white/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-white dark:hover:bg-emerald-900/50';
    case 'error':
      return 'border-rose-300 dark:border-rose-700 bg-white/70 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-white dark:hover:bg-rose-900/50';
    case 'warning':
      return 'border-amber-300 dark:border-amber-700 bg-white/70 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-white dark:hover:bg-amber-900/50';
    case 'info':
    default:
      return 'border-indigo-300 dark:border-indigo-700 bg-white/70 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-900/50';
  }
});

const showRefresh = computed(() => {
  return props.canRefresh && typeof props.onRefresh === 'function';
});

const buttonTitle = computed(() => {
  if (actionState.value === 'loading') return 'Refreshing data from game...';
  if (actionState.value === 'success') return 'Refreshed successfully';
  if (actionState.value === 'error') return 'Refresh failed (click to retry)';
  return props.refreshTitle;
});

async function handleAction() {
  if (actionState.value === 'loading' || !props.onRefresh) return;
  actionState.value = 'loading';
  try {
    const result = await props.onRefresh();
    if (result === false) {
      actionState.value = 'error';
    } else {
      actionState.value = 'success';
      localSuccessMessage.value = '✓ Marches and troops refreshed successfully.';
      emit('refreshed');
      setTimeout(() => {
        if (actionState.value === 'success') {
          actionState.value = 'idle';
        }
      }, 3500);
    }
  } catch (_) {
    actionState.value = 'error';
    setTimeout(() => {
      if (actionState.value === 'error') {
        actionState.value = 'idle';
      }
    }, 4000);
  }
}
</script>

<template>
  <div
    v-if="message || (actionState === 'success' && localSuccessMessage)"
    :class="containerClasses"
    role="alert"
    class="relative flex items-center justify-between gap-2.5 p-2.5 rounded-lg border text-xs transition-colors shadow-2xs"
  >
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <span class="leading-relaxed break-words flex-1">{{ displayMessage }}</span>
    </div>
    <div v-if="showRefresh" class="shrink-0 flex items-center">
      <button
        type="button"
        :disabled="actionState === 'loading'"
        :aria-busy="actionState === 'loading'"
        :title="buttonTitle"
        :class="buttonClasses"
        class="inline-flex size-6 items-center justify-center rounded-md border transition-all cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-1"
        @click="handleAction"
      >
        <!-- Loading spinner -->
        <svg
          v-if="actionState === 'loading'"
          class="size-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>

        <!-- Success checkmark -->
        <svg
          v-else-if="actionState === 'success'"
          class="size-3.5 text-emerald-600 dark:text-emerald-400 stroke-emerald-600 dark:stroke-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>

        <!-- Error cross -->
        <svg
          v-else-if="actionState === 'error'"
          class="size-3.5 text-rose-600 dark:text-rose-400 stroke-rose-600 dark:stroke-rose-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>

        <!-- Default idle refresh icon -->
        <svg
          v-else
          class="size-3.5 hover:rotate-180 transition-transform duration-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
      </button>
    </div>
  </div>
</template>
