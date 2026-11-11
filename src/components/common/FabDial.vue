<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useModals } from '@/src/composables/useModals';
import { useRpcCache } from '@/src/composables/useRpcCache';

const { openModal } = useModals();
const { cache } = useRpcCache();

const isOpen = ref(false);

function toggle() {
  isOpen.value = !isOpen.value;
}

function close() {
  isOpen.value = false;
}

function handleAction(action: 'chat' | 'tower' | 'dungeon') {
  close();
  if (action === 'chat') openModal('guildChat');
  else if (action === 'tower') openModal('tower');
  else if (action === 'dungeon') openModal('dungeon');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    close();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div>
    <!-- Backdrop -->
    <div
      v-if="isOpen"
      id="fab-backdrop"
      class="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
      aria-hidden="true"
      @click="close"
    ></div>

    <!-- FAB Dial Container -->
    <div id="fab-dial" class="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2.5">
      <!-- Actions Menu -->
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-2 scale-90"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-2 scale-90"
      >
        <nav
          v-if="isOpen"
          id="fab-actions"
          aria-label="Game shortcuts"
          class="flex flex-col items-end gap-2"
        >
          <!-- Guild Chat -->
          <div class="flex items-center gap-2">
            <span class="rounded bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
              Guild Chat
            </span>
            <button
              id="guild-chat-fab"
              type="button"
              title="Guild Chat"
              aria-label="Open Guild Chat"
              class="cursor-pointer flex size-10 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-transform hover:scale-105"
              @click="handleAction('chat')"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>

          <!-- Tower -->
          <div class="flex items-center gap-2">
            <span class="rounded bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
              Tower
            </span>
            <button
              id="tower-fab"
              type="button"
              title="Tower"
              aria-label="Open Tower dialog"
              class="cursor-pointer flex size-10 items-center justify-center rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-md text-base transition-transform hover:scale-105"
              @click="handleAction('tower')"
            >
              🗼
            </button>
          </div>

          <!-- Titan Dungeon -->
          <div class="flex items-center gap-2">
            <span class="rounded bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-white shadow-xs">
              Titan Dungeon
            </span>
            <button
              id="dungeon-fab"
              type="button"
              title="Titan Dungeon"
              aria-label="Open Titan Dungeon dialog"
              class="cursor-pointer flex size-10 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-md text-base transition-transform hover:scale-105"
              @click="handleAction('dungeon')"
            >
              🏰
            </button>
          </div>
        </nav>
      </transition>

      <!-- FAB Trigger Button -->
      <button
        id="fab-trigger"
        type="button"
        aria-label="Open shortcuts"
        :aria-expanded="isOpen"
        class="cursor-pointer relative flex size-12 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-transform hover:scale-105 focus:outline-none"
        @click="toggle"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          class="transition-transform duration-200"
          :class="isOpen ? 'rotate-45' : 'rotate-0'"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  </div>
</template>
