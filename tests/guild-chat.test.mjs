import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

test('GuildChatPanel implements 7-day retention, 50-item limit, scroll to bottom, and dark theme input', async () => {
  const panelPath = join(root, 'src/components/common/GuildChatPanel.vue');
  const code = await readFile(panelPath, 'utf8');

  // Retention: 7-day cutoff (7 * 86400)
  assert.match(code, /7\s*\*\s*86400/, 'Must enforce 7-day retention cutoff');

  // Chronological sort: oldest at top, newest at bottom
  assert.match(code, /ctime.*-.*ctime/, 'Must sort messages chronologically');

  // Default limit: 50
  assert.match(code, /displayLimit\s*=\s*ref\(50\)/, 'Must initialize display limit to 50');

  // Slice newest messages
  assert.match(code, /slice\(-displayLimit\.value\)/, 'Must slice the newest messages based on displayLimit');

  // Scroll handler & load older
  assert.match(code, /handleScroll/, 'Must have handleScroll listener');
  assert.match(code, /loadOlderMessages/, 'Must have loadOlderMessages handler');
  assert.match(code, /@scroll="handleScroll"/, 'Must bind scroll event on messages container');

  // Auto-scroll to bottom on opening
  assert.match(code, /scrollToBottom/, 'Must have scrollToBottom logic');

  // Dark theme input styling: must support dark focus without bright white background hijack
  assert.match(code, /dark:focus:bg-slate-800/, 'Input must have dark:focus:bg-slate-800 for dark theme compatibility');
  assert.match(code, /dark:text-slate-100/, 'Input must have dark:text-slate-100');
});

test('rpc-cache applies 7-day message retention to guildChat merges and prunes', async () => {
  const rpcCachePath = join(root, 'extension/rpc-cache.js');
  const code = await readFile(rpcCachePath, 'utf8');

  // Merge cutoff
  assert.match(code, /7\s*\*\s*24\s*\*\s*60\s*\*\s*60/, 'Merge must clear messages older than 7 days');

  // Prune cutoff
  assert.match(code, /7\s*\*\s*86400/, 'Prune must clear messages older than 7 days');
});
