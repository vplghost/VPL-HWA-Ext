#!/usr/bin/env node
/**
 * One-Command Battle Log Replay Harness (`debug-bridge/replay-battle-log.js`).
 * Extracts paired startBattle / endBattle records (Dungeon, Arena, Tower) from
 * extension recording JSON files, replays them on the live Unity WebGL engine
 * via bridge-cli.js, and prints a structured diff against ground-truth outcomes.
 */

const fs = require('node:fs');
const path = require('node:path');
const { evalInGame } = require('./bridge-cli.js');

const START_END_MAP = {
  dungeonStartBattle: { type: 'dungeon', endMethod: 'dungeonEndBattle' },
  customArena_startBattle: { type: 'arena', endMethod: 'customArena_endBattle' },
  arenaStartBattle: { type: 'arena', endMethod: 'arenaEndBattle' },
  towerStartBattle: { type: 'tower', endMethod: 'towerEndBattle' },
};

function safeJsonParse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function extractExpectedFromEndArgs(endArgs) {
  if (!endArgs || typeof endArgs !== 'object') return null;
  const rawResult = Array.isArray(endArgs.result) ? endArgs.result[0] : endArgs.result;
  const rawProgressArr = Array.isArray(endArgs.progress) ? endArgs.progress[0] : endArgs.progress;
  const progress = Array.isArray(rawProgressArr) ? rawProgressArr[0] : rawProgressArr;

  return {
    win: rawResult?.win != null ? Boolean(rawResult.win) : null,
    stars: rawResult?.stars != null ? Number(rawResult.stars) : null,
    duration: progress?.duration != null ? Number(progress.duration) : null,
    seed: progress?.seed != null ? Number(progress.seed) : null,
    attackers: progress?.attackers?.heroes || {},
  };
}

/**
 * Pure parser: extracts paired startBattle + endBattle records from an extension log JSON.
 */
function extractBattlePairsFromLog(logJson, filterType = 'all') {
  const list = Array.isArray(logJson)
    ? logJson
    : (Array.isArray(logJson?.timeline)
      ? logJson.timeline
      : (Array.isArray(logJson?.records) ? logJson.records : []));

  const pendingByEndMethod = new Map();
  const pairs = [];

  for (const item of list) {
    if (!item || !item.requestBody) continue;
    const req = safeJsonParse(item.requestBody);
    const res = safeJsonParse(item.responseBody);
    const calls = Array.isArray(req?.calls) ? req.calls : [];
    const results = Array.isArray(res?.results) ? res.results : [];

    for (const c of calls) {
      const name = String(c?.name || '');
      const matchedStart = START_END_MAP[name];
      if (matchedStart) {
        if (filterType !== 'all' && matchedStart.type !== filterType) continue;
        const r = results.find((x) => x && x.ident === c.ident);
        const rawBattle = r?.result?.response || r?.response || null;
        if (!rawBattle || typeof rawBattle !== 'object') continue;
        const seed = Number(rawBattle.seed) || 0;
        pendingByEndMethod.set(matchedStart.endMethod, {
          index: pairs.length,
          type: matchedStart.type,
          startMethod: name,
          endMethod: matchedStart.endMethod,
          timestamp: item.timestamp || null,
          seed,
          rawBattle,
          expected: null,
        });
        continue;
      }

      if (pendingByEndMethod.has(name)) {
        const pair = pendingByEndMethod.get(name);
        pendingByEndMethod.delete(name);
        pair.expected = extractExpectedFromEndArgs(c.args);
        if (!pair.seed && pair.expected?.seed) pair.seed = pair.expected.seed;
        pairs.push(pair);
      }
    }
  }

  // Keep unpaired startBattles (e.g., retreated or unfinished) at the end
  for (const leftover of pendingByEndMethod.values()) {
    pairs.push(leftover);
  }

  return pairs;
}

/**
 * Pure diff comparator between ground-truth endBattle and simulated WASM outcome.
 */
function diffBattleOutcome(expected, simulated) {
  if (!simulated || typeof simulated !== 'object') {
    return { status: 'ERROR', winMatch: false, starsMatch: false, durationDeltaSec: null, maxHpDelta: null, maxEnergyDelta: null };
  }
  if (!expected) {
    return {
      status: 'NO_GROUND_TRUTH',
      winMatch: null,
      starsMatch: null,
      durationDeltaSec: null,
      maxHpDelta: null,
      maxEnergyDelta: null,
      simulatedWin: Boolean(simulated.win),
      simulatedStars: Number(simulated.stars) || 0,
    };
  }

  const winMatch = expected.win === null ? true : Boolean(simulated.win) === Boolean(expected.win);
  const starsMatch = expected.stars === null ? true : Number(simulated.stars) === Number(expected.stars);
  const durationDeltaSec =
    expected.duration != null && simulated.duration != null
      ? Math.round(Math.abs(Number(simulated.duration) - Number(expected.duration)) * 100) / 100
      : null;

  let maxHpDelta = 0;
  let maxEnergyDelta = 0;
  const expAttackers = expected.attackers || {};
  const simAttackers = simulated.attackers || {};
  for (const [id, expHero] of Object.entries(expAttackers)) {
    const simHero = simAttackers[id];
    if (!simHero) continue;
    if (expHero?.hp != null && simHero?.hp != null) {
      maxHpDelta = Math.max(maxHpDelta, Math.abs(Number(simHero.hp) - Number(expHero.hp)));
    }
    if (expHero?.energy != null && simHero?.energy != null) {
      maxEnergyDelta = Math.max(maxEnergyDelta, Math.abs(Number(simHero.energy) - Number(expHero.energy)));
    }
  }

  let status = 'EXACT_MATCH';
  if (!winMatch) status = 'MISMATCH';
  else if (!starsMatch || maxHpDelta > 5 || (durationDeltaSec != null && durationDeltaSec > 0.5)) {
    status = 'WIN_MATCH_DRIFT';
  }

  return {
    status,
    winMatch,
    starsMatch,
    durationDeltaSec,
    maxHpDelta,
    maxEnergyDelta,
  };
}

module.exports = {
  extractBattlePairsFromLog,
  diffBattleOutcome,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const jsonOut = args.includes('--json');
  const typeIdx = args.indexOf('--type');
  const filterType = typeIdx >= 0 && args[typeIdx + 1] ? args[typeIdx + 1] : 'all';
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? Math.max(1, Number(args[limitIdx + 1]) || 10) : 10;

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node debug-bridge/replay-battle-log.js <record.json> [--type dungeon|arena|tower|all] [--limit 10] [--dry-run] [--json]');
    process.exit(1);
  }

  (async () => {
    const rawJson = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
    const pairs = extractBattlePairsFromLog(rawJson, filterType).slice(0, limit);

    if (dryRun) {
      const summary = pairs.map((p, idx) => ({
        idx,
        type: p.type,
        startMethod: p.startMethod,
        seed: p.seed,
        hasGroundTruth: Boolean(p.expected),
        expectedWin: p.expected?.win ?? null,
        expectedStars: p.expected?.stars ?? null,
        expectedDuration: p.expected?.duration ?? null,
      }));
      console.log(JSON.stringify({ ok: true, dryRun: true, count: summary.length, battles: summary }, null, 2));
      return;
    }

    const report = [];
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const code = `window.__hwaSimulateBattle(${JSON.stringify(p.rawBattle)}, ${Number(p.seed) || 0})`;
      const evalRes = await evalInGame(code, 20000);
      const diff = evalRes?.ok ? diffBattleOutcome(p.expected, evalRes.result) : { status: 'ERROR', error: evalRes?.error || 'Eval failed' };
      report.push({ idx: i, type: p.type, seed: p.seed, ...diff });
    }

    if (jsonOut) {
      console.log(JSON.stringify({ ok: true, count: report.length, results: report }, null, 2));
    } else {
      console.table(report);
    }
  })().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err.message || String(err) }));
    process.exit(1);
  });
}
