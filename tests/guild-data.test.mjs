import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as Vue from 'vue';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import { currentGuild, guildMembers, guildRole } from '../src/utils/guildData.ts';
import { formatNumber } from '../src/utils/formatters.ts';

import { rpcCacheService as reducer } from '../src/core/cache/index.ts';
const at = '2026-11-14T01:00:00Z';
function rpc(name, response, feature, timestamp = at) {
  return { method: 'POST', status: 200, endpoint: 'https://api.hero-wars-alliance.com/api/rpc', timestamp,
    requestBody: JSON.stringify({ calls: [{ name, feature, args: {}, ident: name }] }),
    responseBody: JSON.stringify({ results: [{ ident: name, result: { response } }] }) };
}
const base = { accountStatus: { data: { id: 1 } } };
const roster = (guildId = '10', members = {
  1: { id: '1', name: 'Alpha', level: '80', clanId: guildId, clanRole: '255', lastLoginTime: '1794600000' },
  2: { id: '2', name: 'Beta', level: '90', clanId: guildId, clanRole: '3' },
}) => rpc('user_getClanInfo', { clanData: { clan: { id: guildId, title: 'Test Guild', ownerId: '1', level: '1', membersCount: '2', members,
  roleNames: { officer: 'Elder' } }, membersStat: [{ userId: '2', todayActivity: 0, activitySum: 500,
    todayDungeonActivity: 75, dungeonActivitySum: 900, wasChampion: true, raidDamage: { 7: 100, 10: 200 } }] }, clanRole: 255 });
const outposts = rpc('getUserClanMembersOutposts', { outposts: [
  { userId: 2, username: 'Beta', outpostId: 'private-outpost-id', mapId: 'private-map-id', outpostLevel: 21, coordinates: { x: 615, y: 386 } },
  { userId: 999, username: 'Foreign', outpostId: 'foreign-outpost', coordinates: { x: 1, y: 2 } },
] }, 'globalMap');

test('Guild captures member basics/stats and outposts in either arrival order while filtering nonmembers', () => {
  for (const records of [[roster(), outposts], [outposts, roster()]]) {
    const state = reducer.merge(base, records).cache, rows = guildMembers(state);
    assert.equal(currentGuild(state).guild.title, 'Test Guild'); assert.equal(rows.length, 2);
    const member = rows.find(row => row.name === 'Beta');
    assert.equal(member.role, 'Elder'); assert.equal(member.level, 90);
    assert.equal(member.activityToday, 0); assert.equal(member.titaniteToday, 75);
    assert.equal(member.outpostLevel, 21); assert.deepEqual({ ...member.coordinates }, { x: 615, y: 386 });
    assert.equal(member.raidDamageTotal, 300);
    assert.equal(state.guildStatus.data.outposts[999], undefined);
  }
});

test('Guild and account transitions cannot expose former member or outpost data', () => {
  const initial = reducer.merge(base, [roster(), outposts]).cache;
  const changed = reducer.merge(initial, [roster('20', { 1: { id: '1', name: 'Alpha', clanId: '20', clanRole: 255 } })]).cache;
  assert.equal(guildMembers(changed).length, 1); assert.equal(guildMembers(changed)[0].outpost, null);
  const otherAccount = reducer.merge(initial, [rpc('userGetInfo', { id: 3, name: 'New player', level: 1 }, undefined, '2026-11-14T02:00:00Z')]).cache;
  assert.equal(currentGuild(otherAccount), null); assert.equal(otherAccount.guildOutposts, undefined);
  const left = reducer.merge(initial, [rpc('user_getClanInfo', { clanData: null }, undefined, '2026-11-14T02:00:00Z')]).cache;
  assert.equal(currentGuild(left).guild, null); assert.deepEqual(guildMembers(left), []);
  assert.equal(reducer.merge(initial, [rpc('user_getClanInfo', {})]).cache.guildStatus.data.guild.id, '10');
  assert.equal(guildRole({ id: 5, clanRole: 77 }, {}), 'Role unavailable');
  assert.equal(guildRole({ id: 1, clanRole: 255 }, { ownerId: 1 }), 'Guild Master');
  assert.equal(guildRole({ id: 1, clanRole: 255 }, { ownerId: 1, roleNames: { leader: 'Master' } }), 'Master');
  assert.equal(guildRole({ id: 2, clanRole: 4 }, {}), 'Warlord');
  assert.equal(guildRole({ id: 2, clanRole: 4 }, { roleNames: { warlord: 'Champion' } }), 'Champion');
  assert.equal(guildRole({ id: 3, clanRole: 3 }, {}), 'Officer');
  assert.equal(guildRole({ id: 3, clanRole: 3 }, { roleNames: { officer: 'Elder' } }), 'Elder');
  assert.equal(guildRole({ id: 4, clanRole: 2 }, {}), 'Member');
  assert.equal(guildRole({ id: 4, clanRole: 2 }, { roleNames: { member: 'Novice' } }), 'Novice');
  assert.equal(initial.guildStatus.data.members['2'].role, 'Elder');
  assert.equal(initial.guildStatus.data.selfRoleTitle, 'Guild Master');
});

test('actual Guild tab renders useful member/outpost fields, filters and exports without printing technical IDs', async () => {
  const source = await readFile(new URL('../src/components/tabs/GuildTab.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?/g, '');
  const cache = Vue.ref(reducer.merge(base, [roster(), outposts]).cache), exports = [], calls = [];
  const boundary = { cache, ref: Vue.ref, computed: Vue.computed, onMounted() {}, currentGuild, guildMembers, formatNumber,
    useRpcCache: () => ({ cache, dispatchRpc: async batch => { calls.push(batch); return { ok: true, queued: true }; } }),
    downloadJson: (...args) => exports.push(args),
  };
  vm.runInNewContext(js + '\nglobalThis.api = { rows, search, outpostFilter, sort, refresh, exportMembers, expanded, data, guild, members, busy, message, date, amount, outpostCount };', boundary);
  const render = new Function('Vue', compile(source.match(/<template>([\s\S]*)<\/template>/)[1], { mode: 'function', prefixIdentifiers: true }).code)(Vue);
  const html = await renderToString(Vue.createSSRApp({ setup: () => ({ ...boundary, ...boundary.api }), render }));
  assert.match(html, /Test Guild/); assert.match(html, /Beta/); assert.match(html, /Elder/); assert.match(html, /615/); assert.match(html, /Lv.21/);
  assert.doesNotMatch(html, /private-outpost-id|private-map-id|Foreign/);
  boundary.api.outpostFilter.value = 'known'; assert.equal(boundary.api.rows.value.length, 1);
  boundary.api.search.value = 'alpha'; assert.equal(boundary.api.rows.value.length, 0);
  boundary.api.search.value = ''; boundary.api.exportMembers(); assert.equal(exports[0][1].members.length, 1);
  await boundary.api.refresh(); assert.equal(calls[0][1].name, 'user_getClanInfo');
  assert.equal(calls[0][2].feature, 'globalMap');
});
