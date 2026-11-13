<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { cache, dispatchRpc } = useRpcCache();

const inputText = ref('');
const isRefreshing = ref(false);
const isSending = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);

const chatData = computed(() => cache.value.guildChat?.data || cache.value.chatGetAll?.data || {});
const users = computed<Record<string, any>>(() => chatData.value.users || {});

const myId = computed(() => String(cache.value.accountStatus?.data?.id || 'me'));

interface ChatMsg {
  id: string | number;
  userId: string;
  name: string;
  text: string;
  time: string;
  isMe: boolean;
  ctime: number;
}

const displayLimit = ref(50);

const allMessages = computed<ChatMsg[]>(() => {
  const raw = Array.isArray(chatData.value.messages)
    ? chatData.value.messages
    : (chatData.value.messages && typeof chatData.value.messages === 'object' ? Object.values(chatData.value.messages) : []);
  
  const cutoffSec = Math.floor(Date.now() / 1000) - (7 * 86400); // 7-day retention
  const valid = raw.filter((m: any) => {
    const ctime = Number(m?.ctime || 0);
    return !ctime || ctime >= cutoffSec;
  });

  // Sort chronologically ascending: oldest at top, newest at bottom
  valid.sort((a: any, b: any) => Number(a?.ctime || 0) - Number(b?.ctime || 0));

  return valid.map((m: any, idx: number) => {
    const uId = String(m.userId ?? m.authorId ?? '');
    const user = users.value[uId] || {};
    const name = user.name || (uId === myId.value ? 'You' : `Player #${uId}`);
    const text = m.data?.text || m.text || '';
    const ctime = Number(m.ctime) || 0;
    const ts = ctime * 1000 || Date.now();
    const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isMe = uId === myId.value;

    return {
      id: m.id || idx,
      userId: uId,
      name,
      text,
      time,
      isMe,
      ctime,
    };
  });
});

const hasMoreOlder = computed(() => allMessages.value.length > displayLimit.value);

const messages = computed<ChatMsg[]>(() => {
  if (allMessages.value.length <= displayLimit.value) {
    return allMessages.value;
  }
  return allMessages.value.slice(-displayLimit.value);
});

const messageCount = computed(() => allMessages.value.length);

function close() {
  emit('update:modelValue', false);
}

function loadOlderMessages() {
  if (!messagesContainer.value || !hasMoreOlder.value) return;
  const container = messagesContainer.value;
  const previousScrollHeight = container.scrollHeight;
  const previousScrollTop = container.scrollTop;
  displayLimit.value = Math.min(allMessages.value.length, displayLimit.value + 50);
  nextTick(() => {
    container.scrollTop = container.scrollHeight - previousScrollHeight + previousScrollTop;
  });
}

function handleScroll() {
  if (!messagesContainer.value) return;
  const container = messagesContainer.value;
  if (container.scrollTop <= 15 && hasMoreOlder.value) {
    loadOlderMessages();
  }
}

async function refreshChat() {
  isRefreshing.value = true;
  try {
    await dispatchRpc([{ name: 'chatGetAll', args: { chatType: 'clan' } }]);
  } finally {
    setTimeout(() => {
      isRefreshing.value = false;
      scrollToBottom();
    }, 500);
  }
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || isSending.value) return;

  isSending.value = true;
  try {
    await dispatchRpc([
      { name: 'chatSendText', args: { chatType: 'clan', text } },
      { name: 'chatGetAll', args: { chatType: 'clan' } },
    ]);
    inputText.value = '';
    scrollToBottom();
  } finally {
    isSending.value = false;
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      displayLimit.value = 50;
      scrollToBottom();
    }
  }
);

watch(
  () => allMessages.value.length,
  (newCount, oldCount) => {
    if (newCount > oldCount && props.modelValue && messagesContainer.value) {
      const container = messagesContainer.value;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
      if (isNearBottom) {
        scrollToBottom();
      }
    }
  }
);
</script>

<template>
  <div
    v-if="modelValue"
    id="guild-chat-panel"
    class="fixed bottom-18 right-4 z-40 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col transition-all dark:border-slate-800 dark:bg-slate-900 animate-in fade-in slide-in-from-bottom-2 duration-150"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/80">
      <div class="flex items-center gap-2">
        <span class="inline-flex size-2.5 rounded-full bg-emerald-500"></span>
        <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">Guild Chat</h3>
        <span
          id="guild-chat-count"
          class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300"
        >
          {{ messageCount }}
        </span>
      </div>

      <div class="flex items-center gap-1">
        <button
          id="guild-chat-refresh"
          type="button"
          class="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          :class="{ 'animate-spin': isRefreshing }"
          title="Refresh messages"
          aria-label="Refresh messages"
          @click="refreshChat"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>

        <button
          id="guild-chat-close"
          type="button"
          class="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          aria-label="Close chat"
          @click="close"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Messages Container -->
    <div
      id="guild-chat-messages"
      ref="messagesContainer"
      class="h-80 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50 dark:bg-slate-900/40 text-xs"
      @scroll="handleScroll"
    >
      <div v-if="hasMoreOlder" class="text-center py-1">
        <button
          type="button"
          class="rounded-lg bg-slate-200/60 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700/80 cursor-pointer transition-colors"
          @click="loadOlderMessages"
        >
          ↑ Load older messages ({{ allMessages.length - messages.length }} older)
        </button>
      </div>

      <div v-if="messages.length === 0" class="h-full flex items-center justify-center text-center text-slate-400 text-xs p-4">
        No guild messages yet. Chat messages received from game or sent here will appear in real time.
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="flex flex-col"
        :class="msg.isMe ? 'items-end' : 'items-start'"
      >
        <div class="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5 px-1">
          <span class="font-semibold text-slate-600 dark:text-slate-300">{{ msg.name }}</span>
          <span>•</span>
          <span>{{ msg.time }}</span>
        </div>

        <div
          class="rounded-2xl px-3 py-1.5 max-w-[85%] break-words shadow-2xs leading-relaxed"
          :class="
            msg.isMe
              ? 'bg-blue-600 text-white rounded-br-xs'
              : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-xs'
          "
        >
          {{ msg.text }}
        </div>
      </div>
    </div>

    <!-- Chat input form -->
    <form
      id="guild-chat-form"
      class="border-t border-slate-200 bg-white p-2.5 flex items-center gap-2 dark:border-slate-800 dark:bg-slate-900"
      @submit.prevent="sendMessage"
    >
      <input
        id="guild-chat-input"
        v-model="inputText"
        type="text"
        placeholder="Send a message to guild..."
        maxlength="250"
        autocomplete="off"
        class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-800"
      />

      <button
        id="guild-chat-send"
        type="submit"
        :disabled="!inputText.trim() || isSending"
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 active:scale-95 disabled:opacity-50 cursor-pointer transition-all shadow-xs"
        title="Send message"
        aria-label="Send message"
      >
        <svg class="size-4 translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </form>
  </div>
</template>
