#!/usr/bin/env node
/**
 * Curate compact, deduplicated, sanitized sample datasets from `temp/tracking-data/**`
 * into `sample-data/<domain>/*.json` + `sample-data/index.json`.
 *
 * Usage:
 *   node scripts/curate-sample-data.mjs build [--source temp/tracking-data] [--out sample-data]
 *   node scripts/curate-sample-data.mjs ingest <log-file> [--out sample-data]
 *   node scripts/curate-sample-data.mjs verify [--out sample-data]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULT_SOURCE_DIR = path.join(ROOT_DIR, 'temp', 'tracking-data');
const DEFAULT_OUT_DIR = path.join(ROOT_DIR, 'sample-data');

const SENSITIVE_KEY_RE =
  /^(x-auth-token|x-auth-session-id|x-auth-signature|authorization|cookie|set-cookie|accessToken|refreshToken|sessionId|sessionToken|password|secret|apiKey|privateKey|pushToken|token|signature|email)$/i;

const LIVE_DRAFT_CONST_KEY =
  'YL@i9y7YgvTqMWsKUw4M9aAeY7d2DJ&rK2!bSUqsKZbZgNZjHaRwbz$uwk6JPmML7@&NqnwXFajZ^ER#Tr5XJeK2Af!ddf^FMqW$matmTCa4nCD8JGRmKP37U9pj*pDT';
const DRAFT_KNOWN_EMPTY_PT = '{"base":null,"swap":null}';

/**
 * Domain routing rules mapping all 241+ observed RPC methods into 12 functional folders.
 * First matching rule wins. Add new rules here when introducing new domains.
 */
export const CATEGORY_RULES = [
  {
    domain: 'legends-draft',
    file: 'draft-lifecycle-samples.json',
    description: 'Legends Draft RPC lifecycle (Stage 0..7), register, saveDefence, saveAttack, startBattle, result',
    match: (name) => /^randomDraft_/i.test(name),
  },
  {
    domain: 'arena-grand-arena',
    file: 'arena-session.json',
    description: 'Arena matchmaking, league info, custom arena, brawl, and battle history/team configuration',
    match: (name) =>
      /^(arena|customArena_|League_|brawl_|battleGetByType|battle_team|teamGetAll|getCurrentBattle|getRatingInfo|topGet|getUserPlace|getLeaderboardPowerSummary)/i.test(name),
  },
  {
    domain: 'arena-grand-arena',
    file: 'grand-arena-session.json',
    description: 'Grand Arena 3-team matchmaking and ranking RPCs',
    match: (name) => /^grand/i.test(name),
  },
  {
    domain: 'dungeon-titans',
    file: 'dungeon-session.json',
    description: 'Titan Dungeon room battles, save progress, and dungeon info',
    match: (name) => /^dungeon/i.test(name),
  },
  {
    domain: 'tower-frontier',
    file: 'tower-session.json',
    description: 'Magic Tower floors, rooms, buffs, chests, and battles',
    match: (name) => /^magicTower_/i.test(name),
  },
  {
    domain: 'tower-frontier',
    file: 'frontier-and-campaign.json',
    description: 'Campaign missions/raids, Eternal Story (Frontier), Adventure, IsometricRPG, Town Gate, Hero Story',
    match: (name) =>
      /^(mission|eternalStory_|adventure|modularAdventure_|IsometricRPG_|isometricRPG_|townGate_|heroStoryChapter_|getChapters|getMaps|getUserProgress|worldStars_|playable_)/i.test(name),
  },
  {
    domain: 'guild-hydra-war',
    file: 'hydra-samples.json',
    description: 'Guild Hydra (clanBoss) history, day history, and boss encounters',
    match: (name) => /^(clanBoss_|bossGet|eventBoss_)/i.test(name),
  },
  {
    domain: 'guild-hydra-war',
    file: 'guild-and-versus.json',
    description: 'Guild/Clan info, Clan Clash, Clan War, Global Championship, Clan Trainings, Clan Inventory',
    match: (name) => /^(clan|user_getClanInfo|getWars|getUserClanMembersOutposts)/i.test(name),
  },
  {
    domain: 'world-map-gather-rally',
    file: 'gather-and-mines.json',
    description: 'World Map mine search, gathering, stop gathering, mine summary, resource collection',
    match: (name) => /^(searchMine|attackMine|stopMineGathering|getMine|collectResource|getOutpost)/i.test(name),
  },
  {
    domain: 'world-map-gather-rally',
    file: 'rally-and-raid.json',
    description: 'World Map rally creation, joining, rally details, defenders, fortresses, and solo attacks',
    match: (name) => /^(createRally|joinRally|getRally|getSoloAttackDefenders|getAllFortresses|getCampSummary|winCampBattle|getShieldSummary|getGarrisonWallSummary)/i.test(name),
  },
  {
    domain: 'world-map-gather-rally',
    file: 'monsters-and-march-events.json',
    description: 'World Map mob/monster search & attack, marches, incoming marches, routes, map chunks, markers',
    match: (name) => /^(searchMob|attackMob|getMobSummary|getMarches|getIncomingMarches|getRoutesByIds|getChunks|getMarkers|getSummary|getPage|robberGetAll)/i.test(name),
  },
  {
    domain: 'city-buildings-research',
    file: 'buildings-and-queue.json',
    description: 'City building construction start, completion, speedup, and resident summary',
    match: (name) => /^(startConstruction|completeConstruction|speedUpConstruction|getResidentSummary)/i.test(name),
  },
  {
    domain: 'city-buildings-research',
    file: 'research-and-queue.json',
    description: 'City research start, completion, and speedup',
    match: (name) => /^(startResearch|completeResearch|speedUpResearch)/i.test(name),
  },
  {
    domain: 'city-buildings-research',
    file: 'troops-train-and-heal.json',
    description: 'Troop unit summary, training queue, hospital healing queue, and speedups',
    match: (name) => /^(getUnitSummary|getTrainings|startTraining|completeTraining|getHealing|startHealing|completeHealing|speedUpHealing)/i.test(name),
  },
  {
    domain: 'roster-inventory',
    file: 'heroes-and-upgrades.json',
    description: 'Hero roster, evolution, promotion, skills, skins, runes, artifacts, talismans, hero chest, hero way',
    match: (name) =>
      /^(hero|getHeroSummary|artifact|skin_|rune_|talisman_|set_getAll)/i.test(name),
  },
  {
    domain: 'roster-inventory',
    file: 'titans-and-evolution.json',
    description: 'Titan roster, evolution, summoning circle, titan artifacts',
    match: (name) => /^titan/i.test(name),
  },
  {
    domain: 'roster-inventory',
    file: 'inventory-resources-chests.json',
    description: 'Inventory, crafting, shops, refillables, lootboxes, lucky chest, gacha',
    match: (name) =>
      /^(inventory|getInventory|shop|refillable|openLootbox|getLuckyChestInfo|gacha|claimChest)/i.test(name),
  },
  {
    domain: 'events-rewards-mail',
    file: 'claims-and-rewards.json',
    description: 'Quests, daily bonuses, mail claims, battlepass rewards, zeppelin gift, cinema/video rewards, subscriptions',
    match: (name) =>
      /^(quest|getDailyQuests|getGrowthQuests|getSpecialQuestState|completeQuest|startQuest|mail|readAndClaimAll|deleteAllRead|dailyBonus|battlePass_|getBattlepassState|claimBattlepass|zeppelinGift|cinema|attentionBonus|subscription|resourceSubscription|getRewardList)/i.test(name),
  },
  {
    domain: 'events-rewards-mail',
    file: 'events-and-expeditions.json',
    description: 'Expeditions, special events, offers, monthly hero, liveOps, billing & webshop',
    match: (name) =>
      /^(expedition|getEventInfo|eventPicker_|offer|monthlyHero_|liveOps|billing|Webshop_|common_getCustomStores|upsaleHeroBundle)/i.test(name),
  },
  {
    domain: 'account-session',
    file: 'bootstrap-fresh-reload.json',
    description: 'Login, migrations, remoteConfig, splitGetMap, time sync, server list, game info, stashClient',
    match: (name) =>
      /^(mobileLogin|onLogin|misc_preLogin|applyMigrations|remoteConfig|splitGetMap|getGameInfo|getInfo|getTime|serverGetAll|indexGet|stashClient|getPushdCredentials|tutorialGetInfo)/i.test(name),
  },
  {
    domain: 'account-session',
    file: 'user-profile-and-settings.json',
    description: 'User profile, avatars, settings, chat, consent/cookies, activity markers',
    match: (name) =>
      /^(user|settings|chat|sendConsent|sendCookie|getEmailInfo|getNameChangedCount|rateUsGetCooldown)/i.test(name),
  },
];

export function classifyRpc(rpcName) {
  for (const rule of CATEGORY_RULES) {
    if (rule.match(rpcName)) {
      return { domain: rule.domain, file: rule.file, description: rule.description };
    }
  }
  return {
    domain: 'unclassified',
    file: 'unclassified-rpcs.json',
    description: 'RPC methods not yet mapped in CATEGORY_RULES',
  };
}

export function sanitizeTopic(topic) {
  if (typeof topic !== 'string') return topic;
  return topic
    .replace(/(\/user\/)[^/]+/g, '$1<REDACTED_USER_ID>')
    .replace(/(\/account\/)[^/]+/g, '$1<REDACTED_ACCOUNT_ID>')
    .replace(/(\/clan\/)\d+/g, '$1<REDACTED_CLAN_ID>')
    .replace(/(\/global-map\/)[0-9a-f-]{8,}/gi, '$1<REDACTED_MAP_UUID>');
}

/**
 * Recursively sanitize sensitive fields and compact oversized collections so sample files stay tiny & readable.
 */
export function sanitizeAndCompact(value, opts = {}) {
  const maxArray = opts.maxArray ?? 6;
  const maxObjectKeys = opts.maxObjectKeys ?? 12;
  const maxStringLen = opts.maxStringLen ?? 1200;
  const maxDepth = opts.maxDepth ?? 8;

  const walk = (node, depth, keyName) => {
    if (keyName && SENSITIVE_KEY_RE.test(keyName)) {
      return '[REDACTED]';
    }
    if (node === null || node === undefined) return node;
    if (typeof node === 'string') {
      if (node.length > maxStringLen && !opts.preserveStrings) {
        return `${node.slice(0, maxStringLen)}... [truncated ${node.length} chars]`;
      }
      return node;
    }
    if (typeof node !== 'object') return node;
    if (depth >= maxDepth) {
      return Array.isArray(node) ? `[Array(${node.length})]` : `[Object(${Object.keys(node).length} keys)]`;
    }
    if (Array.isArray(node)) {
      const sliced = node.slice(0, maxArray).map((el) => walk(el, depth + 1, null));
      if (node.length > maxArray) {
        sliced.push({ _truncatedArrayItems: node.length - maxArray, _totalLength: node.length });
      }
      return sliced;
    }
    const keys = Object.keys(node);
    const out = {};
    const limit = keys.length > maxObjectKeys ? maxObjectKeys : keys.length;
    for (let i = 0; i < limit; i++) {
      const k = keys[i];
      out[k] = walk(node[k], depth + 1, k);
    }
    if (keys.length > maxObjectKeys) {
      out._truncatedKeys = keys.length - maxObjectKeys;
      out._totalKeys = keys.length;
    }
    return out;
  };

  return walk(value, 0, null);
}

function recoverDraftDynamicKey(base64Payload) {
  if (!base64Payload || typeof base64Payload !== 'string') return null;
  try {
    const raw = Buffer.from(base64Payload, 'base64').toString('binary');
    if (raw.length !== DRAFT_KNOWN_EMPTY_PT.length) return null;
    const derived = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      derived[i] =
        raw.charCodeAt(i) ^
        DRAFT_KNOWN_EMPTY_PT.charCodeAt(i) ^
        LIVE_DRAFT_CONST_KEY.charCodeAt(i % LIVE_DRAFT_CONST_KEY.length);
    }
    for (const kLen of [14, 12, 13, 15, 16]) {
      let ok = true;
      for (let i = 0; i < kLen; i++) {
        if (derived[i] < 0x21 || derived[i] > 0x7e) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (let i = kLen; i < raw.length; i++) {
        if (derived[i] !== derived[i % kLen]) {
          ok = false;
          break;
        }
      }
      if (ok) return String.fromCharCode(...derived.slice(0, kLen));
    }
  } catch (_) {}
  return null;
}

function xorDecryptDraft(base64Payload, dynKey) {
  if (!base64Payload || !dynKey) return null;
  try {
    const raw = Buffer.from(base64Payload, 'base64').toString('binary');
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(
        raw.charCodeAt(i) ^
          LIVE_DRAFT_CONST_KEY.charCodeAt(i % LIVE_DRAFT_CONST_KEY.length) ^
          dynKey.charCodeAt(i % dynKey.length)
      );
    }
    return out;
  } catch (_) {
    return null;
  }
}

function extractRawHeroIdsFromDraftText(pt, stopBeforeSwap = false) {
  if (!pt || typeof pt !== 'string') return [];
  const slice = stopBeforeSwap && pt.includes('"swap"') ? pt.slice(0, pt.indexOf('"swap"')) : pt;
  const ids = [];
  const seen = new Set();
  const re = /"id":(\d+)/g;
  let m;
  while ((m = re.exec(slice))) {
    const id = Number(m[1]);
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function listFilesRecursive(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFilesRecursive(full, out);
    else out.push(full);
  }
  return out;
}

function toRelPath(fullPath) {
  return path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
}

function loadExistingJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonPretty(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/**
 * Extract RPC call/result pairs, MQTT events, errors, and snapshot summaries from a single file.
 */
export function extractFromSourceFile(filePath, state) {
  const rel = toRelPath(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath);

  if (ext === '.md') {
    const text = fs.readFileSync(filePath, 'utf8').trim();
    if (/error|healing/i.test(baseName)) {
      state.errors.markdownNotes[baseName] = {
        _meta: { sourceFile: rel, kind: 'markdown-error-note' },
        excerpt: text.slice(0, 1200),
      };
    } else if (/draft/i.test(baseName)) {
      state.draftVerifiedNotes[baseName] = {
        _meta: { sourceFile: rel, kind: 'in-game-draft-log' },
        content: text,
      };
    }
    return;
  }

  if (ext !== '.json') return;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return;
  }

  // Flat snapshot arrays (heroes, titans, inventory, resources)
  if (Array.isArray(parsed) && parsed.length > 0 && !parsed[0]?.endpoint && !parsed[0]?.requestBody) {
    const first = parsed[0];
    if (first && typeof first === 'object') {
      const keys = Object.keys(first);
      const snapshotKey = baseName.replace(/\.json$/i, '');
      state.snapshots[snapshotKey] = {
        _meta: { sourceFile: rel, totalEntries: parsed.length, itemKeys: keys },
        sampleItems: sanitizeAndCompact(parsed.slice(0, 3), { maxArray: 3, maxObjectKeys: 20 }),
      };
    }
    return;
  }

  // Full extension snapshot export (`hwa-full-data-*.json`)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed._format && parsed.data) {
    state.snapshots[baseName.replace(/\.json$/i, '')] = {
      _meta: {
        sourceFile: rel,
        format: parsed._format,
        version: parsed._version,
        exportedAt: parsed._exportedAt,
        topKeys: Object.keys(parsed.data),
      },
      dataPreview: sanitizeAndCompact(parsed.data, { maxArray: 2, maxObjectKeys: 8, maxDepth: 4 }),
    };
    return;
  }

  // Legend draft session snapshot
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.candidates && parsed.matchId !== undefined) {
    if (!state.draftSessionSample) {
      state.draftSessionSample = {
        _meta: { sourceFile: rel, format: parsed._format || 'legend-draft-session' },
        sample: sanitizeAndCompact(parsed, { maxArray: 5, maxObjectKeys: 12, maxDepth: 5 }),
      };
    }
    return;
  }

  const timeline = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.timeline)
      ? parsed.timeline
      : Array.isArray(parsed?.records)
        ? parsed.records
        : [];

  let draftDynKey = null;

  for (const entry of timeline) {
    if (!entry || typeof entry !== 'object') continue;

    // 1. MQTT events
    if (entry.transport === 'mqtt' || entry.topic || entry.eventType) {
      let payloadObj = entry.payload ?? entry.data ?? null;
      if (typeof payloadObj === 'string') {
        try {
          payloadObj = JSON.parse(payloadObj);
        } catch (_) {}
      }
      const evType =
        entry.eventType ||
        payloadObj?.result?.type ||
        payloadObj?.type ||
        payloadObj?.event ||
        entry.eventMethod ||
        'unknown';
      const key = String(evType);
      const existing = state.mqttByType[key];
      const isTruncated = Boolean(entry.payloadTruncated);
      if (!existing || (existing._meta.truncated && !isTruncated)) {
        state.mqttByType[key] = {
          _meta: {
            sourceFile: rel,
            capturedAt: entry.timestamp || null,
            topic: sanitizeTopic(entry.topic || ''),
            eventMethod: entry.eventMethod || null,
            truncated: isTruncated,
          },
          payload: sanitizeAndCompact(payloadObj, { maxArray: 5, maxObjectKeys: 12, maxDepth: 6 }),
        };
      }
      continue;
    }

    // 2. HTTP RPC calls
    const reqStr = entry.requestBody || entry.reqBody || (typeof entry.request === 'string' ? entry.request : null);
    const resStr = entry.responseBody || entry.resBody || (typeof entry.response === 'string' ? entry.response : null);
    if (typeof reqStr !== 'string' || !reqStr.includes('calls')) continue;

    let reqJson;
    let resJson = null;
    try {
      reqJson = JSON.parse(reqStr);
    } catch (_) {
      continue;
    }
    if (typeof resStr === 'string') {
      try {
        resJson = JSON.parse(resStr);
      } catch (_) {}
    }

    const calls = Array.isArray(reqJson?.calls) ? reqJson.calls : [];
    const results = Array.isArray(resJson?.results) ? resJson.results : [];
    const resByIdent = new Map();
    for (const r of results) {
      if (r?.ident != null) resByIdent.set(String(r.ident), r);
    }

    for (const call of calls) {
      const name = call?.name;
      if (!name || typeof name !== 'string') continue;

      const matched = call.ident != null ? resByIdent.get(String(call.ident)) : null;
      const resultObj = matched?.result ?? null;
      const errorObj = matched?.error ?? resultObj?.error ?? (resJson?.error || null);
      const hasError = Boolean(errorObj) || entry.outcome === 'error' || (entry.status && entry.status >= 400);

      // Capture error samples into errors-diagnostics
      if (hasError) {
        const errKey = `${name}::${errorObj?.name || errorObj?.code || entry.status || 'error'}`;
        if (!state.errors.rpcErrors[errKey]) {
          state.errors.rpcErrors[errKey] = {
            _meta: { sourceFile: rel, capturedAt: entry.timestamp || null, rpcName: name, status: entry.status ?? null },
            args: sanitizeAndCompact(call.args ?? {}, { maxArray: 6, maxObjectKeys: 12 }),
            error: sanitizeAndCompact(errorObj || { status: entry.status, outcome: entry.outcome }, {
              maxArray: 6,
              maxObjectKeys: 12,
            }),
          };
        }
      }

      // Special Legends Draft raw-order verification extraction
      if (name === 'randomDraft_getInfo' && resultObj?.response) {
        const resp = resultObj.response;
        if (!draftDynKey && typeof resp.draft === 'string') {
          draftDynKey = recoverDraftDynamicKey(resp.draft);
        }
        const stageKey = `stage_${resp.stageId ?? 'unknown'}`;
        if (!state.draftStages[stageKey] && !entry.responseBodyTruncated) {
          const stageRecord = {
            _meta: {
              sourceFile: rel,
              capturedAt: entry.timestamp || null,
              stageId: resp.stageId ?? null,
              matchId: resp.matchId ?? null,
              draftBase64Len: typeof resp.draft === 'string' ? resp.draft.length : 0,
              draftEnemyBase64Len: typeof resp.draftEnemy === 'string' ? resp.draftEnemy.length : 0,
            },
            responseSummary: sanitizeAndCompact(
              {
                ...resp,
                draft: typeof resp.draft === 'string' ? `<base64 len=${resp.draft.length}>` : resp.draft,
                draftEnemy:
                  typeof resp.draftEnemy === 'string' ? `<base64 len=${resp.draftEnemy.length}>` : resp.draftEnemy,
              },
              { maxArray: 5, maxObjectKeys: 15 }
            ),
          };
          if (draftDynKey && typeof resp.draft === 'string') {
            const pt = xorDecryptDraft(resp.draft, draftDynKey);
            if (pt && pt.startsWith('{')) {
              stageRecord.decryptedRawOrderBaseHeroIds = extractRawHeroIdsFromDraftText(pt, true);
              if (pt.includes('"swap":[')) {
                const swapPart = pt.slice(pt.indexOf('"swap":['));
                stageRecord.decryptedRawOrderSwapHeroIds = extractRawHeroIdsFromDraftText(swapPart, false);
              }
            }
          }
          if (draftDynKey && typeof resp.draftEnemy === 'string' && resp.draftEnemy.length > 10) {
            const ptE = xorDecryptDraft(resp.draftEnemy, draftDynKey);
            if (ptE && ptE.startsWith('{')) {
              stageRecord.decryptedRawOrderEnemyHeroIds = extractRawHeroIdsFromDraftText(ptE, false);
            }
          }
          state.draftStages[stageKey] = stageRecord;
        }
      }

      const route = classifyRpc(name);
      const bucketKey = `${route.domain}/${route.file}`;
      if (!state.rpcBuckets[bucketKey]) {
        state.rpcBuckets[bucketKey] = {
          domain: route.domain,
          file: route.file,
          description: route.description,
          methods: {},
        };
      }
      const methods = state.rpcBuckets[bucketKey].methods;
      const existing = methods[name];
      const isTruncated = Boolean(entry.responseBodyTruncated || entry.requestBodyTruncated);
      const hasResp = resultObj !== null && resultObj !== undefined;

      // Prefer non-truncated successful response with payload over empty/truncated ones
      const shouldReplace =
        !existing ||
        (existing._meta.truncated && !isTruncated && hasResp) ||
        (!existing._meta.hasResponse && hasResp) ||
        (existing._meta.hasError && !hasError && hasResp);

      if (shouldReplace) {
        methods[name] = {
          _meta: {
            sourceFile: rel,
            capturedAt: entry.timestamp || null,
            status: entry.status ?? 200,
            hasResponse: hasResp,
            hasError,
            truncated: isTruncated,
          },
          args: sanitizeAndCompact(call.args ?? {}, { maxArray: 6, maxObjectKeys: 12 }),
          response: sanitizeAndCompact(resultObj?.response ?? resultObj ?? null, {
            maxArray: 5,
            maxObjectKeys: 12,
            maxDepth: 6,
          }),
        };
      }
    }
  }
}

function createEmptyState() {
  return {
    rpcBuckets: {},
    mqttByType: {},
    errors: { rpcErrors: {}, markdownNotes: {} },
    draftStages: {},
    draftVerifiedNotes: {},
    draftSessionSample: null,
    snapshots: {},
  };
}

function loadStateFromOutDir(outDir) {
  const state = createEmptyState();
  const idx = loadExistingJson(path.join(outDir, 'index.json'), null);
  if (!idx || !Array.isArray(idx.files)) return state;

  for (const f of idx.files) {
    const full = path.join(outDir, f.path);
    const data = loadExistingJson(full, null);
    if (!data) continue;
    if (f.kind === 'rpc-domain' && data.methods) {
      state.rpcBuckets[f.path] = {
        domain: data.domain || path.dirname(f.path),
        file: path.basename(f.path),
        description: data.description || '',
        methods: data.methods,
      };
    } else if (f.kind === 'mqtt-events' && data.eventsByType) {
      state.mqttByType = data.eventsByType;
    } else if (f.kind === 'errors-diagnostics') {
      state.errors = {
        rpcErrors: data.rpcErrors || {},
        markdownNotes: data.markdownNotes || {},
      };
    } else if (f.kind === 'draft-verified') {
      state.draftStages = data.stages || {};
      state.draftVerifiedNotes = data.inGameNotes || {};
      state.draftSessionSample = data.sessionSnapshot || null;
    } else if (f.kind === 'snapshots' && data.snapshots) {
      state.snapshots = data.snapshots;
    }
  }
  return state;
}

function writeCuratedOutput(outDir, state, sourceStats) {
  fs.mkdirSync(outDir, { recursive: true });
  const indexFiles = [];

  // 1. Write RPC domain files
  const sortedBuckets = Object.entries(state.rpcBuckets).sort(([a], [b]) => a.localeCompare(b));
  for (const [relFile, bucket] of sortedBuckets) {
    const sortedMethods = {};
    for (const k of Object.keys(bucket.methods).sort()) {
      sortedMethods[k] = bucket.methods[k];
    }
    const payload = {
      _schema: 'hwa-sample-data/v1',
      kind: 'rpc-domain',
      domain: bucket.domain,
      description: bucket.description,
      methodCount: Object.keys(sortedMethods).length,
      methods: sortedMethods,
    };
    const full = path.join(outDir, relFile);
    writeJsonPretty(full, payload);
    indexFiles.push({
      path: relFile.replace(/\\/g, '/'),
      domain: bucket.domain,
      kind: 'rpc-domain',
      description: bucket.description,
      methodCount: payload.methodCount,
      methods: Object.keys(sortedMethods),
      bytes: fs.statSync(full).size,
    });
  }

  // 2. Write Legends Draft verified stages & in-game notes
  if (Object.keys(state.draftStages).length > 0 || Object.keys(state.draftVerifiedNotes).length > 0) {
    const relFile = 'legends-draft/draft-verified-rounds.json';
    const full = path.join(outDir, relFile);
    const payload = {
      _schema: 'hwa-sample-data/v1',
      kind: 'draft-verified',
      domain: 'legends-draft',
      description:
        'Verified Legends Draft Stage 0..7 decrypted raw-order hero IDs (pre-JSON.parse order) + in-game round notes',
      stages: state.draftStages,
      inGameNotes: state.draftVerifiedNotes,
      sessionSnapshot: state.draftSessionSample,
    };
    writeJsonPretty(full, payload);
    indexFiles.push({
      path: relFile,
      domain: 'legends-draft',
      kind: 'draft-verified',
      description: payload.description,
      stageCount: Object.keys(state.draftStages).length,
      bytes: fs.statSync(full).size,
    });
  }

  // 3. Write Roster / Full Snapshot previews
  if (Object.keys(state.snapshots).length > 0) {
    const relFile = 'roster-inventory/exported-snapshots-preview.json';
    const full = path.join(outDir, relFile);
    const payload = {
      _schema: 'hwa-sample-data/v1',
      kind: 'snapshots',
      domain: 'roster-inventory',
      description: 'Compact previews & schemas of exported hero, titan, inventory, resource, and full-data snapshots',
      snapshotCount: Object.keys(state.snapshots).length,
      snapshots: state.snapshots,
    };
    writeJsonPretty(full, payload);
    indexFiles.push({
      path: relFile,
      domain: 'roster-inventory',
      kind: 'snapshots',
      description: payload.description,
      snapshotCount: payload.snapshotCount,
      bytes: fs.statSync(full).size,
    });
  }

  // 4. Write MQTT events
  {
    const relFile = 'mqtt-events/mqtt-events-by-type.json';
    const full = path.join(outDir, relFile);
    const sortedMqtt = {};
    for (const k of Object.keys(state.mqttByType).sort()) {
      sortedMqtt[k] = state.mqttByType[k];
    }
    const payload = {
      _schema: 'hwa-sample-data/v1',
      kind: 'mqtt-events',
      domain: 'mqtt-events',
      description: 'Deduplicated sanitized MQTT event payloads grouped by eventType',
      eventTypeCount: Object.keys(sortedMqtt).length,
      eventsByType: sortedMqtt,
    };
    writeJsonPretty(full, payload);
    indexFiles.push({
      path: relFile,
      domain: 'mqtt-events',
      kind: 'mqtt-events',
      description: payload.description,
      eventTypeCount: payload.eventTypeCount,
      eventTypes: Object.keys(sortedMqtt),
      bytes: fs.statSync(full).size,
    });
  }

  // 5. Write Errors & Diagnostics
  {
    const relFile = 'errors-diagnostics/observed-errors.json';
    const full = path.join(outDir, relFile);
    const sortedRpcErrs = {};
    for (const k of Object.keys(state.errors.rpcErrors).sort()) {
      sortedRpcErrs[k] = state.errors.rpcErrors[k];
    }
    const payload = {
      _schema: 'hwa-sample-data/v1',
      kind: 'errors-diagnostics',
      domain: 'errors-diagnostics',
      description: 'Observed RPC errors (e.g. gather deadlock, invalid heroes, healing/claim errors) and diagnostic notes',
      rpcErrorCount: Object.keys(sortedRpcErrs).length,
      markdownNoteCount: Object.keys(state.errors.markdownNotes).length,
      rpcErrors: sortedRpcErrs,
      markdownNotes: state.errors.markdownNotes,
    };
    writeJsonPretty(full, payload);
    indexFiles.push({
      path: relFile,
      domain: 'errors-diagnostics',
      kind: 'errors-diagnostics',
      description: payload.description,
      rpcErrorCount: payload.rpcErrorCount,
      markdownNoteCount: payload.markdownNoteCount,
      bytes: fs.statSync(full).size,
    });
  }

  const totalBytes = indexFiles.reduce((acc, f) => acc + (f.bytes || 0), 0);
  const totalMethods = indexFiles.reduce((acc, f) => acc + (f.methodCount || 0), 0);
  const unclassifiedFile = indexFiles.find((f) => f.domain === 'unclassified');

  const indexPayload = {
    _schema: 'hwa-sample-data-index/v1',
    generatedAt: new Date().toISOString(),
    sourceStats,
    summary: {
      fileCount: indexFiles.length,
      domainCount: new Set(indexFiles.map((f) => f.domain)).size,
      totalRpcMethods: totalMethods,
      mqttEventTypes: Object.keys(state.mqttByType).length,
      rpcErrors: Object.keys(state.errors.rpcErrors).length,
      unclassifiedMethods: unclassifiedFile ? unclassifiedFile.methods : [],
      totalBytes,
    },
    files: indexFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };

  writeJsonPretty(path.join(outDir, 'index.json'), indexPayload);
  return indexPayload;
}

export function verifySampleData(outDir = DEFAULT_OUT_DIR) {
  const errors = [];
  const indexPath = path.join(outDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return { ok: false, errors: [`Missing index.json at ${indexPath}`] };
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (e) {
    return { ok: false, errors: [`Invalid index.json: ${e.message}`] };
  }

  const indexedPaths = new Set((index.files || []).map((f) => f.path));
  const diskFiles = listFilesRecursive(outDir)
    .filter((f) => f.endsWith('.json') && path.basename(f) !== 'index.json')
    .map((f) => path.relative(outDir, f).replace(/\\/g, '/'));

  for (const p of indexedPaths) {
    if (!fs.existsSync(path.join(outDir, p))) {
      errors.push(`Indexed file missing on disk: ${p}`);
    }
  }
  for (const p of diskFiles) {
    if (!indexedPaths.has(p)) {
      errors.push(`Orphan JSON file not registered in index.json: ${p}`);
    }
  }

  const leakRe = /"(x-auth-token|x-auth-session-id|x-auth-signature|authorization|cookie|accessToken|refreshToken)"\s*:\s*"(?!\[REDACTED\])[^"]{6,}"/i;
  for (const p of diskFiles) {
    const full = path.join(outDir, p);
    const raw = fs.readFileSync(full, 'utf8');
    try {
      JSON.parse(raw);
    } catch (e) {
      errors.push(`Invalid JSON in ${p}: ${e.message}`);
      continue;
    }
    if (leakRe.test(raw)) {
      errors.push(`Potential unredacted auth secret detected in ${p}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    fileCount: diskFiles.length,
    totalRpcMethods: index.summary?.totalRpcMethods ?? 0,
    totalBytes: index.summary?.totalBytes ?? 0,
  };
}

function parseCliArgs(argv) {
  const cmd = argv[2] && !argv[2].startsWith('--') ? argv[2] : 'build';
  const positional = [];
  const opts = { source: DEFAULT_SOURCE_DIR, out: DEFAULT_OUT_DIR };
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) opts.source = path.resolve(argv[++i]);
    else if (argv[i] === '--out' && argv[i + 1]) opts.out = path.resolve(argv[++i]);
    else if (!argv[i].startsWith('--')) positional.push(argv[i]);
  }
  return { cmd, positional, opts };
}

function main() {
  const { cmd, positional, opts } = parseCliArgs(process.argv);

  if (cmd === 'verify') {
    const res = verifySampleData(opts.out);
    if (!res.ok) {
      console.error('sample-data verify FAILED:\n  - ' + res.errors.join('\n  - '));
      process.exit(1);
    }
    console.log(
      `sample-data verify OK: ${res.fileCount} files, ${res.totalRpcMethods} RPC methods, ${(res.totalBytes / 1024).toFixed(1)} KB`
    );
    return;
  }

  if (cmd === 'ingest') {
    const target = positional[0];
    if (!target) {
      console.error('Usage: node scripts/curate-sample-data.mjs ingest <path-to-log> [--out sample-data]');
      process.exit(1);
    }
    const resolvedTarget = path.resolve(target);
    if (!fs.existsSync(resolvedTarget)) {
      console.error(`File not found: ${resolvedTarget}`);
      process.exit(1);
    }
    const state = loadStateFromOutDir(opts.out);
    const beforeMethods = new Set(
      Object.values(state.rpcBuckets).flatMap((b) => Object.keys(b.methods))
    );
    const beforeMqtt = new Set(Object.keys(state.mqttByType));

    const stat = fs.statSync(resolvedTarget);
    const files = stat.isDirectory() ? listFilesRecursive(resolvedTarget) : [resolvedTarget];
    for (const f of files) extractFromSourceFile(f, state);

    const afterMethods = new Set(
      Object.values(state.rpcBuckets).flatMap((b) => Object.keys(b.methods))
    );
    const addedMethods = [...afterMethods].filter((m) => !beforeMethods.has(m));
    const addedMqtt = Object.keys(state.mqttByType).filter((m) => !beforeMqtt.has(m));

    const index = writeCuratedOutput(opts.out, state, {
      mode: 'ingest',
      ingestedPath: toRelPath(resolvedTarget),
      ingestedFiles: files.length,
    });
    console.log(
      `Ingested ${files.length} file(s): +${addedMethods.length} new RPCs, +${addedMqtt.length} new MQTT types. Total: ${index.summary.totalRpcMethods} RPCs, ${(index.summary.totalBytes / 1024).toFixed(1)} KB.`
    );
    if (addedMethods.length > 0) console.log('  New RPCs:', addedMethods.join(', '));
    if (index.summary.unclassifiedMethods.length > 0) {
      console.log('  Unclassified RPCs:', index.summary.unclassifiedMethods.join(', '));
    }
    return;
  }

  // Default: build from scratch
  if (!fs.existsSync(opts.source)) {
    console.error(`Source directory not found: ${opts.source}`);
    process.exit(1);
  }
  const files = listFilesRecursive(opts.source).sort();
  const state = createEmptyState();
  let sourceBytes = 0;
  for (const f of files) {
    sourceBytes += fs.statSync(f).size;
    extractFromSourceFile(f, state);
  }
  const index = writeCuratedOutput(opts.out, state, {
    mode: 'build',
    sourceDir: toRelPath(opts.source),
    scannedFiles: files.length,
    scannedBytes: sourceBytes,
  });
  console.log(
    `Curated ${files.length} source files (${(sourceBytes / 1024 / 1024).toFixed(2)} MB) -> ${index.summary.fileCount} sample files (${(index.summary.totalBytes / 1024).toFixed(1)} KB), ${index.summary.totalRpcMethods} RPC methods, ${index.summary.mqttEventTypes} MQTT event types, ${index.summary.rpcErrors} RPC errors.`
  );
  if (index.summary.unclassifiedMethods.length > 0) {
    console.warn('Unclassified RPCs:', index.summary.unclassifiedMethods.join(', '));
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  main();
}
