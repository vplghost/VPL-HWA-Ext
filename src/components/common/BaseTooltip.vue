<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';

const props = withDefaults(
  defineProps<{
    content?: string | null;
    placement?: 'top' | 'bottom';
    delay?: number;
  }>(),
  {
    content: '',
    placement: 'bottom',
    delay: 100,
  }
);

const isVisible = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const tooltipEl = ref<HTMLElement | null>(null);
const coords = ref<{ left: number; top?: number; bottom?: number }>({ left: 0 });
let showTimeout: any = null;

const hasContent = computed(() => Boolean(props.content && props.content.trim().length > 0));

function updatePosition() {
  if (!triggerRef.value || typeof window === 'undefined') return;
  const rect = triggerRef.value.getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  const width = tooltipEl.value?.offsetWidth || 200;
  const height = tooltipEl.value?.offsetHeight || 36;

  // Center horizontally relative to trigger, clamped to screen edges
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(8, Math.min(winW - width - 8, left));

  const spaceBelow = winH - rect.bottom;
  const spaceAbove = rect.top;

  if (props.placement === 'top' || (spaceBelow < height + 12 && spaceAbove > spaceBelow)) {
    coords.value = {
      left: Math.round(left),
      bottom: Math.round(winH - rect.top + 6),
    };
  } else {
    coords.value = {
      left: Math.round(left),
      top: Math.round(rect.bottom + 6),
    };
  }
}

function handleMouseEnter() {
  if (!hasContent.value) return;
  if (showTimeout) clearTimeout(showTimeout);
  showTimeout = setTimeout(() => {
    isVisible.value = true;
    nextTick(updatePosition);
  }, props.delay);
}

function handleMouseLeave() {
  if (showTimeout) clearTimeout(showTimeout);
  isVisible.value = false;
}

function handleScroll() {
  if (isVisible.value) {
    updatePosition();
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
  }
});

onUnmounted(() => {
  if (showTimeout) clearTimeout(showTimeout);
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('resize', handleScroll);
  }
});
</script>

<template>
  <div
    ref="triggerRef"
    class="inline-flex items-center"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @focusin="handleMouseEnter"
    @focusout="handleMouseLeave"
  >
    <slot />

    <Teleport to="body">
      <div
        v-if="isVisible && hasContent"
        ref="tooltipEl"
        :style="{
          position: 'fixed',
          left: `${coords.left}px`,
          top: coords.top !== undefined ? `${coords.top}px` : 'auto',
          bottom: coords.bottom !== undefined ? `${coords.bottom}px` : 'auto',
          zIndex: 99999,
        }"
        class="pointer-events-none rounded-lg border border-slate-700/60 dark:border-slate-600/60 bg-slate-900/95 dark:bg-slate-800/95 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-slate-100 shadow-xl backdrop-blur-sm whitespace-pre-line text-left max-w-xs transition-opacity duration-150"
        role="tooltip"
      >
        {{ content }}
      </div>
    </Teleport>
  </div>
</template>
