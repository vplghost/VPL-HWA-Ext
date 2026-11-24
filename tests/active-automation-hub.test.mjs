import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeActiveAutomations } from '../src/composables/useActiveAutomations.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('computeActiveAutomations returns empty list when idle and aggregates active jobs with stop descriptors', () => {
  assert.deepEqual(computeActiveAutomations({}), []);

  const items = computeActiveAutomations({
    raidQueue: { status: 'waiting_rally', completedRounds: 2, totalRounds: 5 },
    monsterQueue: { status: 'running', completedRounds: 1, totalRounds: 3 },
    autoGatherSettings: { enabled: true, smartEnabled: true },
    troopTrainSettings: { autoTrainEnabled: true },
    buildingQueue: { active: true, items: [{ id: 1 }, { id: 2 }] },
    researchQueue: { active: true, items: [{ id: 10 }] },
    towerRun: { status: 'running', floor: 25 },
    dungeonRun: { status: 'waiting' },
    activeResourceLocks: [{ owner: 'raidQueue', heroIds: [1, 2, 3, 4, 5], marchSlots: 1 }],
  });

  assert.equal(items.length, 8);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.raid.statusTone, 'waiting');
  assert.match(byId.raid.label, /Raid: 2\/5/);
  assert.equal(byId.raid.stopMessage?.kind, 'raid-queue-stop');

  assert.equal(byId.gather.statusTone, 'waiting');
  assert.match(byId.gather.label, /Yielding to Raid/);
  assert.equal(byId.gather.storageDisableKey?.key, 'autoGatherSettings');

  assert.equal(byId.building.label, 'Build Queue: 2 left');
  assert.equal(byId.research.label, 'Research Queue: 1 left');
  assert.equal(byId.tower.label, 'Tower Auto: Floor 25');
});

test('ActiveAutomationStrip is mounted in App.vue and shared dialog primitives exist', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'entrypoints', 'popup', 'App.vue'), 'utf8');
  assert.match(appSrc, /import ActiveAutomationStrip from '@\/src\/components\/common\/ActiveAutomationStrip\.vue'/);
  assert.match(appSrc, /<ActiveAutomationStrip \/>/);

  for (const file of [
    'ActiveAutomationStrip.vue',
    'AutomationLogPanel.vue',
    'HeroTeamPicker.vue',
    'DiagnosticsBanner.vue',
  ]) {
    const fullPath = path.join(ROOT, 'src', 'components', 'common', file);
    assert.ok(fs.existsSync(fullPath), `${file} must exist in src/components/common/`);
  }
});

test('All Vue UI components under src/components/ use 100% English strings without stray Vietnamese diacritics', () => {
  const vnRegex = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđĐ]/;
  const violations = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.vue')) {
        const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
          if (vnRegex.test(line)) {
            violations.push(`${path.relative(ROOT, full)}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }

  walk(path.join(ROOT, 'src', 'components'));
  assert.deepEqual(violations, [], `Found Vietnamese strings in Vue components:\n${violations.join('\n')}`);
});
