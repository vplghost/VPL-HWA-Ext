<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { currentGuild, guildMembers } from '@/src/utils/guildData';
import { formatNumber } from '@/src/utils/formatters';
import { downloadJson } from '@/src/utils/metadata';

const { cache, dispatchRpc } = useRpcCache();
const data = computed(() => currentGuild(cache.value));
const guild = computed(() => data.value?.guild);
const members = computed(() => guildMembers(cache.value));
const search = ref('');
const outpostFilter = ref('all');
const sort = ref('name');
const busy = ref(false);
const message = ref('');
const expanded = ref<string | null>(null);
const rows = computed(() => members.value.filter(member => {
  const query = search.value.trim().toLowerCase();
  return (!query || `${member.name} ${member.role}`.toLowerCase().includes(query)) &&
    (outpostFilter.value === 'all' || (outpostFilter.value === 'known' ? !!member.outpost : !member.outpost));
}).sort((a, b) => sort.value === 'level' ? (b.level ?? -1) - (a.level ?? -1)
  : sort.value === 'activity' ? (b.activityToday ?? -1) - (a.activityToday ?? -1)
  : sort.value === 'outpost' ? (b.outpostLevel ?? -1) - (a.outpostLevel ?? -1)
  : a.name.localeCompare(b.name)));
const outpostCount = computed(() => members.value.filter(member => member.outpost).length);
const date = (value: string | number | null | undefined) => {
  if (value == null) return 'Not recorded';
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toLocaleString() : 'Not recorded';
};
const amount = (value: number | null) => value == null ? '—' : formatNumber(value);
async function refresh() {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await dispatchRpc([{ name: 'userGetInfo' }, { name: 'user_getClanInfo' },
      { name: 'getUserClanMembersOutposts', feature: 'globalMap', args: {} }]);
    message.value = !response?.ok ? response?.error || 'Could not refresh Guild information.'
      : response.queued ? 'Guild refresh queued. Waiting for game traffic.' : 'Guild refresh requested.';
  } catch (error) { message.value = error instanceof Error ? error.message : String(error); }
  finally { busy.value = false; }
}
function exportMembers() {
  if (!guild.value) return;
  downloadJson('hwa-guild-members.json', { guild: guild.value, observedAt: cache.value.guildStatus?.updatedAt, members: rows.value });
}
onMounted(() => { if (!data.value) void refresh(); });
</script>

<template>
  <div class="space-y-3">
    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="font-bold text-base text-slate-900 dark:text-slate-100">🛡️ {{ guild?.title || 'Guild' }}</h2>
          <p v-if="guild?.description" class="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{{ guild.description }}</p>
          <p v-if="data" class="text-[10px] text-slate-400 mt-1">Roster updated {{ date(cache.guildStatus?.updatedAt) }}</p>
        </div>
        <div class="flex gap-2 text-xs">
          <button type="button" :disabled="busy" class="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-2 font-semibold text-white disabled:opacity-50" @click="refresh">{{ busy ? 'Refreshing…' : 'Refresh Guild' }}</button>
          <button type="button" :disabled="!guild" class="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 disabled:opacity-50" @click="exportMembers">Export JSON</button>
        </div>
      </div>
      <p v-if="message" role="status" class="text-xs text-slate-500">{{ message }}</p>
      <div v-if="guild" class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">Members <strong class="block text-base">{{ members.length }}<span v-if="guild.membersCount != null" class="text-xs text-slate-400"> / {{ guild.membersCount }}</span></strong></div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">Outposts recorded <strong class="block text-base">{{ outpostCount }}</strong></div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">Guild level <strong class="block text-base">{{ guild.level ?? '—' }}</strong></div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">Minimum player level <strong class="block text-base">{{ guild.minLevel ?? '—' }}</strong></div>
      </div>
    </div>

    <div v-if="!guild" class="rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
      {{ data ? 'You are not currently in a Guild.' : 'Open your Guild in-game or refresh to record members and their outposts.' }}
    </div>
    <template v-else>
      <div class="flex flex-wrap gap-2 text-xs">
        <input v-model="search" type="search" aria-label="Search Guild members" placeholder="Search members or roles…" class="min-w-44 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
        <select v-model="outpostFilter" aria-label="Filter members by outpost" class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2"><option value="all">All members</option><option value="known">Outpost recorded</option><option value="missing">Outpost not recorded</option></select>
        <select v-model="sort" aria-label="Sort Guild members" class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2"><option value="name">Name</option><option value="level">Player level</option><option value="activity">Activity today</option><option value="outpost">Outpost level</option></select>
      </div>
      <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 dark:bg-slate-800 text-slate-500"><tr><th class="p-3">Member</th><th class="p-3">Role</th><th class="p-3 text-right">Activity today</th><th class="p-3 text-right">Titanite today</th><th class="p-3">Outpost</th><th class="p-3">Last login</th></tr></thead>
          <tbody>
            <template v-for="member in rows" :key="member.id">
              <tr class="border-t border-slate-100 dark:border-slate-800">
                <td class="p-3"><button type="button" class="text-left font-semibold text-indigo-600 dark:text-indigo-300 hover:underline" :aria-expanded="expanded === member.id" @click="expanded = expanded === member.id ? null : member.id">{{ member.name }}</button><div class="text-[10px] text-slate-400">Lv.{{ member.level ?? '—' }}<span v-if="member.wasChampion"> · Champion</span></div></td>
                <td class="p-3">{{ member.role }}</td><td class="p-3 text-right font-mono">{{ amount(member.activityToday) }}</td><td class="p-3 text-right font-mono">{{ amount(member.titaniteToday) }}</td>
                <td class="p-3"><template v-if="member.outpost"><div>Lv.{{ member.outpostLevel ?? '—' }}</div><div v-if="member.coordinates" class="font-mono text-[10px] text-slate-400">({{ member.coordinates.x }}, {{ member.coordinates.y }})</div></template><span v-else class="text-slate-400">Not recorded</span></td>
                <td class="p-3 text-[10px] text-slate-400 whitespace-nowrap">{{ date(member.lastLoginAt) }}</td>
              </tr>
              <tr v-if="expanded === member.id" class="bg-slate-50 dark:bg-slate-800/50"><td colspan="6" class="p-3"><div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]"><div>Total activity: <strong>{{ amount(member.activityTotal) }}</strong></div><div>Total Titanite: <strong>{{ amount(member.titaniteTotal) }}</strong></div><div>Server: <strong>{{ member.server ?? '—' }}</strong></div><div>Member data: {{ date(member.observedAt) }}</div><div>Outpost data: {{ date(member.outpost?.observedAt) }}</div><div>Hydra damage: {{ amount(member.raidDamageTotal) }}</div></div></td></tr>
            </template>
            <tr v-if="!rows.length"><td colspan="6" class="p-6 text-center text-slate-400">No matching members.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
