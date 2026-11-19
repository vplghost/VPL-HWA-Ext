import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getGearBorderClass } from '../src/utils/metadata.ts';

const root = resolve(import.meta.dirname, '..');

test('getGearBorderClass accurately maps gear tiers to color borders', () => {
  // Rank 1: Gray / White
  assert.equal(getGearBorderClass(1, 1), 'border-slate-400/80');
  // Rank 4: Blue
  assert.equal(getGearBorderClass(50, 4), 'border-sky-400');
  // Rank 7: Purple
  assert.equal(getGearBorderClass(100, 7), 'border-purple-400');
  // Fallback by hero rank
  assert.equal(getGearBorderClass(null, 2), 'border-emerald-400');
  assert.equal(getGearBorderClass(null, 12), 'border-amber-400');
  assert.equal(getGearBorderClass(null, 16), 'border-rose-400');
});

test('HeroHoverCard component implements unified equipment frame, gear thumbnails, and compact skills layout', async () => {
  const cardPath = join(root, 'src/components/common/HeroHoverCard.vue');
  const content = await readFile(cardPath, 'utf8');

  // 1. Unified Equipment Rank and Gear Slots Frame
  assert.match(content, /Unified Equipment Rank & Gear Slots Box/, 'Must have unified equipment and gear frame');
  assert.match(content, /equipmentRank\.label/, 'Must display equipment rank label');
  assert.match(content, /equipmentSlots/, 'Must compute equipmentSlots with gear icons and borders');
  assert.match(content, /s\.iconUrl/, 'Must render gear item image icon');
  assert.match(content, /s\.borderClass/, 'Must apply rarity border to gear slot');
  assert.match(content, /opacity-100/, 'Must use full opacity for equipped gear');
  assert.match(content, /opacity-35 grayscale/, 'Must use reduced opacity and grayscale for unequipped gear');

  // 2. Skills threshold and compact 1-line layout
  assert.match(content, /isThreshold/, 'Must calculate skill threshold reached');
  assert.match(content, /bg-amber-500\/20 text-amber-300 border-amber-500\/50/, 'Must highlight threshold skills with amber border/bg');
  assert.match(content, /SKILL_DELTAS\s*=\s*\[0,\s*0,\s*20,\s*40\]/, 'Must define skill deltas for skills 3 & 4');
  assert.doesNotMatch(content, /label:\s*`S\$\{idx \+ 1\}`/, 'Must not generate S1, S2, S3, S4 labels');

  // 3. Compact inline sections for scrollbar prevention
  assert.match(content, /flex items-center justify-between gap-1\.5/, 'Must use 1-line flex layouts for skills, skins, glyphs, and artifacts');
});

test('TitanHoverCard component implements compact 1-line layouts and threshold skill highlights', async () => {
  const cardPath = join(root, 'src/components/common/TitanHoverCard.vue');
  const content = await readFile(cardPath, 'utf8');

  // 1. Skills threshold and compact 1-line layout
  assert.match(content, /isThreshold/, 'Must calculate skill threshold reached');
  assert.match(content, /bg-amber-500\/20 text-amber-300 border-amber-500\/50/, 'Must highlight threshold skills with amber border/bg');
  assert.doesNotMatch(content, /label:\s*`S\$\{idx \+ 1\}`/, 'Must not generate S1, S2 labels');

  // 2. Compact 1-line flex layouts
  assert.match(content, /flex items-center justify-between gap-1\.5/, 'Must use 1-line flex layouts for skills, skins, and artifacts');
  assert.match(content, /Lv\.\s*\{\{\s*titan(?:\?\.|\.)level\s*\}\}/, 'Must display titan level in header');
});
