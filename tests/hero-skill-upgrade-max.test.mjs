import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('HeroDetailModal.vue implements Max All and per-skill Max upgrade with batched RPC calls', async () => {
  const modalContent = await readFile(resolve(root, 'src/components/dialogs/HeroDetailModal.vue'), 'utf8');

  // Verify UI buttons and classes exist
  assert.ok(modalContent.includes('btn-upgrade-all-skills-max'), 'HeroDetailModal must have Max All button');
  assert.ok(modalContent.includes('btn-upgrade-skill-max'), 'HeroDetailModal must have per-skill +Max button');
  assert.ok(modalContent.includes('upgradeAllSkillsMax'), 'HeroDetailModal must have upgradeAllSkillsMax function');
  assert.ok(modalContent.includes('upgradeSkillMax'), 'HeroDetailModal must have upgradeSkillMax function');

  // Verify UI blocking flag to prevent duplicate calls
  assert.ok(modalContent.includes('isUpgradingSkills'), 'HeroDetailModal must track isUpgradingSkills');
  assert.ok(modalContent.includes(':disabled="isUpgradingSkills'), 'Upgrade buttons must be disabled when isUpgradingSkills is true');

  // Verify batch RPC construction
  assert.ok(modalContent.includes("name: 'heroUpgradeSkill'"), 'Must call heroUpgradeSkill');
  assert.ok(modalContent.includes("name: 'heroGetAll'"), 'Must sync heroGetAll after upgrade');
  assert.ok(modalContent.includes("name: 'inventoryGet'"), 'Must sync inventoryGet after upgrade');
  assert.ok(modalContent.includes("name: 'userGetInfo'"), 'Must sync userGetInfo after upgrade');

  // Simulation test for batching logic
  const heroLevel = 89;
  const heroColor = 10; // high enough for all 4 skills
  const skills = {
    1: 85, // White: max is 89 -> needs 4
    2: 80, // Green: max is 89 -> needs 9
    3: 85, // Blue: raw is 85, delta is 20 -> display is 65 / max 69 -> needs 4
    4: 85, // Violet: raw is 85, delta is 40 -> display is 45 / max 49 -> needs 4
  };

  const skillSlots = [
    { slot: 1, delta: 0, maxLvl: heroLevel, rankReq: 1 },
    { slot: 2, delta: 0, maxLvl: heroLevel, rankReq: 2 },
    { slot: 3, delta: 20, maxLvl: heroLevel - 20, rankReq: 4 },
    { slot: 4, delta: 40, maxLvl: heroLevel - 40, rankReq: 7 },
  ];

  function getDisplayLevel(s) {
    const raw = skills[s.slot] || 1;
    return Math.max(1, raw - s.delta);
  }

  function getNeeded(s) {
    return Math.max(0, s.maxLvl - getDisplayLevel(s));
  }

  assert.equal(getNeeded(skillSlots[0]), 4);
  assert.equal(getNeeded(skillSlots[1]), 9);
  assert.equal(getNeeded(skillSlots[2]), 4);
  assert.equal(getNeeded(skillSlots[3]), 4);

  // If player has 10 skill points:
  let available = 10;
  const calls = [];
  for (const s of skillSlots) {
    if (available <= 0) break;
    const needed = getNeeded(s);
    if (needed > 0) {
      const toAdd = Math.min(available, needed);
      for (let i = 0; i < toAdd; i++) {
        calls.push({ name: 'heroUpgradeSkill', args: { heroId: 1, skill: s.slot } });
      }
      available -= toAdd;
    }
  }

  // Should allocate 4 points to Skill 1 and 6 points to Skill 2
  assert.equal(calls.length, 10);
  const skill1Calls = calls.filter(c => c.args.skill === 1);
  const skill2Calls = calls.filter(c => c.args.skill === 2);
  const skill3Calls = calls.filter(c => c.args.skill === 3);

  assert.equal(skill1Calls.length, 4);
  assert.equal(skill2Calls.length, 6);
  assert.equal(skill3Calls.length, 0);
  assert.equal(available, 0);
});
