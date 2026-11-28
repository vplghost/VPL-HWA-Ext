import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useModals } from './useModals.ts';
import {
  hasAutopilotDialogRunner,
  runAutopilotStepViaDialog,
  stopActiveAutopilotDialogRunner,
} from './useAutopilotDialogBridge.ts';
import {
  planFavoriteSoulStoneSweep,
  DEFAULT_SOUL_SWEEP_RESERVE_ENERGY,
  SOUL_SWEEP_RESERVE_STORAGE_KEY,
} from '../services/heroSoulSweepService.ts';
import {
  buildGrandFarmCoinsCall,
  buildShopBuyCall,
  buildShopRefreshCall,
  findFreeRenewableFavoriteShops,
  parseShopCatalog,
  planFavoriteShopPurchases,
  shouldClaimGrandArenaCoins,
} from '../services/shopService.ts';
import {
  DAILY_AUTOPILOT_SETTINGS_KEY,
  DAILY_AUTOPILOT_STATE_KEY,
  DAILY_STEP_LABELS,
  getDefaultDailyAutopilotSettings,
  normalizeDailyAutopilotSettings,
  createDefaultDailyRuntimeState,
  resolveDailyResetAnchor,
  buildDailyExecutionPlan,
  isDailyActivityAlreadyDone,
  computeExpeditionNextWakeMs,
  computeHeroicChestNextWakeMs,
  computeRealmProductionPending,
  computeFreeGiftStripItems,
  formatShortTime,
  type DailyAutopilotSettings,
  type DailyAutopilotRuntimeState,
  type DailyActivityId,
  type FreeGiftId,
} from '../services/dailyAutopilotService.ts';
import { towerActivityState, arenaActivityState } from './activityState.ts';
import { getAttentionBonusAvailability } from '../utils/freeChestHelper.ts';
import { freeAlchemyAvailability } from '../utils/freeAlchemySpin.ts';

const settings = ref<DailyAutopilotSettings>(getDefaultDailyAutopilotSettings());
const runtimeState = reactive<DailyAutopilotRuntimeState>(createDefaultDailyRuntimeState());
const runningFreeGiftIds = ref<Set<string>>(new Set());
const freeGiftErrors = ref<Record<string, string | null>>({});

let abortRequested = false;
let initialized = false;

function persistSettings(next: DailyAutopilotSettings) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      const plain = JSON.parse(JSON.stringify(next));
      chrome.storage.local.set({ [DAILY_AUTOPILOT_SETTINGS_KEY]: plain }).catch?.(() => {});
    } catch (_) {}
  }
}

function persistRuntime() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
    try {
      const plain = JSON.parse(JSON.stringify(runtimeState));
      chrome.storage.local.set({ [DAILY_AUTOPILOT_STATE_KEY]: plain }).catch?.(() => {});
    } catch (_) {}
  }
}

function setGiftRunning(id: FreeGiftId, active: boolean) {
  const next = new Set(runningFreeGiftIds.value);
  if (active) next.add(id);
  else next.delete(id);
  runningFreeGiftIds.value = next;
}

function setGiftError(id: FreeGiftId, err: string | null) {
  freeGiftErrors.value = { ...freeGiftErrors.value, [id]: err };
}

function extractRpcError(res: any): string | null {
  if (!res) return 'Empty RPC response';
  if (res.ok === false) return String(res.error || 'RPC dispatch failed');
  const first = res.results?.[0];
  const err = first?.result?.error || first?.result?.response?.error || first?.error;
  if (err) {
    return typeof err === 'object' ? String(err.description || err.name || err.message || JSON.stringify(err)) : String(err);
  }
  return null;
}

export function useDailyAutopilot(
  cacheRef: { value: Record<string, any> },
  dispatchRpc?: (calls: any[]) => Promise<any>,
  nowRef?: { value: number }
) {
  async function loadFromStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      try {
        const stored: any = await chrome.storage.local.get([
          DAILY_AUTOPILOT_SETTINGS_KEY,
          DAILY_AUTOPILOT_STATE_KEY,
        ]);
        if (stored?.[DAILY_AUTOPILOT_SETTINGS_KEY]) {
          settings.value = normalizeDailyAutopilotSettings(stored[DAILY_AUTOPILOT_SETTINGS_KEY]);
        }
        if (stored?.[DAILY_AUTOPILOT_STATE_KEY] && typeof stored[DAILY_AUTOPILOT_STATE_KEY] === 'object') {
          Object.assign(runtimeState, createDefaultDailyRuntimeState(), stored[DAILY_AUTOPILOT_STATE_KEY]);
          // Never leave stale running=true across popup reloads
          runtimeState.running = false;
          runtimeState.activeStepId = null;
        }
      } catch (_) {}
    }
  }

  function onStorageChanged(changes: any, area: string) {
    if (area !== 'local') return;
    if (changes[DAILY_AUTOPILOT_SETTINGS_KEY]?.newValue) {
      settings.value = normalizeDailyAutopilotSettings(changes[DAILY_AUTOPILOT_SETTINGS_KEY].newValue);
    }
    if (changes[DAILY_AUTOPILOT_STATE_KEY]?.newValue && !runtimeState.running) {
      Object.assign(runtimeState, createDefaultDailyRuntimeState(), changes[DAILY_AUTOPILOT_STATE_KEY].newValue);
    }
  }

  onMounted(() => {
    if (!initialized) {
      initialized = true;
      void loadFromStorage();
      chrome?.storage?.onChanged?.addListener?.(onStorageChanged);
    }
  });

  onUnmounted(() => {
    // Keep shared reactive state alive across tab switches
  });

  function saveSettings(partial: Partial<DailyAutopilotSettings>) {
    const next = normalizeDailyAutopilotSettings({ ...settings.value, ...partial });
    settings.value = next;
    persistSettings(next);
  }

  const resetAnchor = computed(() =>
    resolveDailyResetAnchor(cacheRef.value, settings.value, nowRef?.value ?? Date.now())
  );

  const freeGiftItems = computed(() =>
    computeFreeGiftStripItems(cacheRef.value, nowRef?.value ?? Date.now(), {
      hasGameTab: true,
      runningIds: runningFreeGiftIds.value,
      errorMap: freeGiftErrors.value,
    })
  );

  const statusSummary = computed(() => {
    if (runtimeState.running && runtimeState.activeStepId) {
      return runtimeState.summary || `Running: ${runtimeState.activeStepId}`;
    }
    if (runtimeState.summary) return runtimeState.summary;
    const nextTime = formatShortTime(resetAnchor.value.nextResetMs);
    return nextTime ? `Next reset ${nextTime}` : 'Idle';
  });

  /**
   * Executes a single isolated Free Gift / Video / Spin channel so one error
   * never cascades into sibling gifts.
   */
  async function runSingleFreeGift(giftId: FreeGiftId): Promise<boolean> {
    if (!dispatchRpc || runningFreeGiftIds.value.has(giftId)) return false;
    setGiftRunning(giftId, true);
    setGiftError(giftId, null);

    try {
      const c = cacheRef.value || {};
      if (giftId === 'videoBoxes') {
        await dispatchRpc([{ name: 'cinemaGetCounters', args: {} }]);
        const counters = cacheRef.value?.cinemaGetCounters?.data || c.cinemaGetCounters?.data;
        const claimed = new Set((counters?.placementRewards || []).map((r: any) => Number(r?.boxNum)));
        const remaining = [0, 1, 2, 3, 4].filter((n) => !claimed.has(n));
        for (const boxNum of remaining) {
          const res = await dispatchRpc([{ name: 'cinemaGiveReward', args: { type: 'firstPlacement', boxNum } }]);
          const err = extractRpcError(res);
          if (err && !err.toLowerCase().includes('already')) throw new Error(err);
          await new Promise((r) => setTimeout(r, 300));
        }
        await dispatchRpc([{ name: 'cinemaGetCounters', args: {} }]);
      } else if (giftId === 'videoTickets') {
        await dispatchRpc([{ name: 'cinemaGetCounters', args: {} }]);
        const counters = cacheRef.value?.cinemaGetCounters?.data || c.cinemaGetCounters?.data;
        const viewed = Number(counters?.viewed ?? 0);
        const rem = Math.max(0, 8 - viewed);
        for (let i = 0; i < rem; i++) {
          const res = await dispatchRpc([{ name: 'cinemaGiveReward', args: { type: 'cinema' } }]);
          const err = extractRpcError(res);
          if (err && !err.toLowerCase().includes('already')) throw new Error(err);
          await new Promise((r) => setTimeout(r, 300));
        }
        await dispatchRpc([{ name: 'cinemaGetCounters', args: {} }]);
      } else if (giftId === 'alchemySpin') {
        if (!freeAlchemyAvailability(c, Date.now()).ready) return true;
        const res = await dispatchRpc([{ name: 'refillable_alchemyUseVideo', args: { type: 'alchemy' } }]);
        const err = extractRpcError(res);
        if (err) throw new Error(err);
      } else if (giftId === 'attentionBonuses') {
        let bonuses = c.attentionBonusStatus?.data?.bonuses;
        if (!bonuses || Object.keys(bonuses).length === 0) {
          await dispatchRpc([{ name: 'liveOps_refresh', args: {} }]);
          bonuses = cacheRef.value?.attentionBonusStatus?.data?.bonuses;
        }
        const avail = getAttentionBonusAvailability(bonuses, Date.now());
        for (const id of avail.readyBonusIds) {
          const res = await dispatchRpc([{ name: 'attentionBonus_collectReward', args: { id } }]);
          const err = extractRpcError(res);
          if (err) throw new Error(err);
          await new Promise((r) => setTimeout(r, 250));
        }
        if (avail.readyBonusIds.length > 0) {
          await dispatchRpc([{ name: 'userGetInfo' }, { name: 'inventoryGet' }]);
        }
      } else if (giftId === 'zeppelinGift') {
        const res = await dispatchRpc([{ name: 'zeppelinGiftFarm', args: {} }]);
        const err = extractRpcError(res);
        if (err) throw new Error(err);
      } else if (giftId === 'skillPointsVideo') {
        const res = await dispatchRpc([{ name: 'refillable_skillpointsUseVideo', args: {} }]);
        const err = extractRpcError(res);
        if (err) throw new Error(err);
      } else if (giftId === 'heroicChestVideo') {
        // Verify authoritative videoCooldown from server before opening (strict 24h renewal & 0-Emerald safety)
        const infoRes = await dispatchRpc([{ name: 'heroChest_getInfo', args: {} }]);
        const infoErr = extractRpcError(infoRes);
        if (infoErr) throw new Error(infoErr);
        const infoData = infoRes?.results?.[0]?.result?.response ?? cacheRef.value?.heroChest_getInfo?.data;
        const cdSec = Number(infoData?.videoCooldown ?? 0);
        const nowSec = Math.floor(Date.now() / 1000);
        if (Number.isFinite(cdSec) && cdSec > nowSec) {
          // Still on 24h cooldown — schedule single wake alarm and do NOT open
          const wakeMs = cdSec * 1000 + 5000;
          if (typeof chrome !== 'undefined' && chrome.alarms?.create) {
            try { chrome.alarms.create('daily-autopilot-heroic-video-wake', { when: wakeMs }); } catch (_) {}
          }
          return true;
        }
        const openRes = await dispatchRpc([{
          name: 'heroChest_openChest',
          args: { count: 1, free: true, video: true, costId: '' },
        }]);
        const openErr = extractRpcError(openRes);
        if (openErr) throw new Error(openErr);
        const nextWake = computeHeroicChestNextWakeMs(cacheRef.value, Date.now());
        if (nextWake && typeof chrome !== 'undefined' && chrome.alarms?.create) {
          try { chrome.alarms.create('daily-autopilot-heroic-video-wake', { when: nextWake }); } catch (_) {}
        }
      } else if (giftId === 'realmResources') {
        await dispatchRpc([
          { name: 'getSummary', feature: 'resourceProduction', args: {} },
          { name: 'getSummary', feature: 'bonus', args: {} },
        ]);
        const pending = computeRealmProductionPending(cacheRef.value, Date.now());
        if (pending.calls.length === 0) {
          return true;
        }
        const collectRes = await dispatchRpc([
          ...pending.calls,
          { name: 'getSummary', feature: 'resourceProduction', args: {} },
        ]);
        const collectErr = extractRpcError(collectRes);
        if (collectErr) throw new Error(collectErr);
      } else {
        return false;
      }
      return true;
    } catch (e: any) {
      setGiftError(giftId, e?.message || String(e));
      return false;
    } finally {
      setGiftRunning(giftId, false);
    }
  }

  async function executeStep(stepId: DailyActivityId): Promise<void> {
    if (!dispatchRpc) throw new Error('Game RPC dispatcher unavailable');

    // Unified 1:1 Dialog Runner delegation (open if closed -> run exact button handler -> close only if opened by autopilot)
    if (hasAutopilotDialogRunner(stepId)) {
      const { modalState, openModal, closeModal } = useModals();
      const result = await runAutopilotStepViaDialog(stepId, {
        openModal,
        closeModal,
        isModalOpen: (name) => modalState[name] === true,
        isAborted: () => abortRequested,
      });
      if (result) {
        runtimeState.steps[stepId] = {
          status: result.status,
          detail: result.detail,
          ...(result.waitingUntil ? { waitingUntil: result.waitingUntil } : {}),
          ...(result.error ? { error: result.error } : {}),
          ...(result.status === 'done' ? { completedAt: Date.now() } : {}),
        };
        return;
      }
    }

    if (stepId === 'freebies') {
      const items = computeFreeGiftStripItems(cacheRef.value, Date.now(), { hasGameTab: true });
      const actionable = items.filter((i) => i.clickable && i.state === 'available');
      let claimed = 0;
      let failed = 0;
      for (const item of actionable) {
        if (abortRequested) break;
        const ok = await runSingleFreeGift(item.id);
        if (ok) claimed++;
        else failed++;
      }
      runtimeState.steps.freebies = {
        status: failed > 0 && claimed === 0 ? 'error' : 'done',
        detail: `${claimed} freebie group(s) claimed${failed > 0 ? ` · ${failed} failed` : ''}`,
        ...(failed > 0 && claimed === 0 ? { error: 'One or more freebie groups failed' } : {}),
        completedAt: Date.now(),
      };
      return;
    }

    if (stepId === 'expeditions') {
      // Zero-spam single pass: refresh once, schedule next wake timer if active
      await dispatchRpc([{ name: 'expeditionGet', args: {} }]);
      const nextWake = computeExpeditionNextWakeMs(cacheRef.value, Date.now());
      if (nextWake) {
        if (typeof chrome !== 'undefined' && chrome.alarms?.create) {
          try {
            chrome.alarms.create('daily-autopilot-expedition-wake', { when: nextWake });
          } catch (_) {}
        }
        runtimeState.steps.expeditions = {
          status: 'waiting',
          waitingUntil: nextWake,
          detail: `Waiting · next return ${formatShortTime(nextWake)}`,
        };
      } else {
        runtimeState.steps.expeditions = {
          status: 'done',
          detail: 'Expeditions checked',
          completedAt: Date.now(),
        };
      }
      return;
    }

    if (stepId === 'frontier') {
      const res = await dispatchRpc([{ name: 'eternalStory_collectChest', args: {} }]);
      const err = extractRpcError(res);
      if (err && !err.toLowerCase().includes('empty') && !err.toLowerCase().includes('nothing')) {
        throw new Error(err);
      }
      runtimeState.steps.frontier = {
        status: 'done',
        detail: 'AFK chest checked',
        completedAt: Date.now(),
      };
      return;
    }

    if (stepId === 'quests') {
      await dispatchRpc([{ name: 'questGetAll', args: {} }, { name: 'mailGetAll', args: {} }]);
      const questCheck = isDailyActivityAlreadyDone('quests', cacheRef.value, Date.now());
      runtimeState.steps.quests = questCheck.done
        ? {
            status: 'done',
            detail: questCheck.detail || 'All daily quests completed',
            completedAt: Date.now(),
          }
        : {
            status: 'skipped',
            detail: 'Quests & mail synced (remaining quests require action)',
          };
      return;
    }

    if (stepId === 'soul-sweep') {
      let favIds: Array<string | number> = [];
      let reserveEnergy = DEFAULT_SOUL_SWEEP_RESERVE_ENERGY;
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
        try {
          const stored: any = await chrome.storage.local.get(['favoriteHeroes', SOUL_SWEEP_RESERVE_STORAGE_KEY]);
          if (Array.isArray(stored?.favoriteHeroes)) favIds = stored.favoriteHeroes;
          if (stored?.[SOUL_SWEEP_RESERVE_STORAGE_KEY] != null) reserveEnergy = Number(stored[SOUL_SWEEP_RESERVE_STORAGE_KEY]);
        } catch (_) {}
      }
      const plan = planFavoriteSoulStoneSweep(cacheRef.value, favIds, { reserveEnergy });
      if (plan.plannedRaids <= 0) {
        runtimeState.steps['soul-sweep'] = {
          status: 'skipped',
          detail: plan.skippedReason || 'No eligible favorite Heroic missions.',
        };
        return;
      }
      let completedRaids = 0;
      for (const m of plan.missions) {
        if (m.plannedRaids <= 0) continue;
        const calls: Array<{ name: string; args?: any; ident?: string }> = [];
        for (let k = 0; k < m.plannedRaids; k++) {
          calls.push({
            name: 'missionRaid',
            args: { id: m.missionId, times: 1 },
            ident: `autoss_${m.missionId}_${k}_${Date.now()}`,
          });
        }
        const res = await dispatchRpc(calls);
        if (res?.ok === false) break;
        completedRaids += m.plannedRaids;
      }
      await dispatchRpc([{ name: 'inventoryGet' }, { name: 'userGetInfo' }]);
      runtimeState.steps['soul-sweep'] = {
        status: 'done',
        detail: `Swept ${completedRaids} Heroic raids (${plan.plannedEnergy}⚡, reserve ${plan.reserveEnergy}⚡)`,
        completedAt: Date.now(),
      };
      return;
    }

    if (stepId === 'shop-favorites') {
      let favorites: Record<string, any> = {};
      let reserves: Record<string, number> = {};
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
        try {
          const stored: any = await chrome.storage.local.get(['shopFavorites', 'shopCurrencyReserves']);
          if (stored?.shopFavorites && typeof stored.shopFavorites === 'object') favorites = stored.shopFavorites;
          if (stored?.shopCurrencyReserves && typeof stored.shopCurrencyReserves === 'object') reserves = stored.shopCurrencyReserves;
        } catch (_) {}
      }
      if (Object.keys(favorites).length === 0) {
        runtimeState.steps['shop-favorites'] = {
          status: 'skipped',
          detail: 'No favorite shop items configured.',
        };
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      let catalog = parseShopCatalog(cacheRef.value?.shopGetMany?.data, cacheRef.value, nowSec);
      if (catalog.shops.length === 0) {
        await dispatchRpc([{ name: 'shopGetMany', args: { shopIds: [1, 4, 5, 6, 8, 10, 11, 13, 14, 15, 16, 17] } }]);
        catalog = parseShopCatalog(cacheRef.value?.shopGetMany?.data, cacheRef.value, Math.floor(Date.now() / 1000));
      }

      let claimedGa = false;
      const gaDecision = shouldClaimGrandArenaCoins(cacheRef.value, catalog.slots, favorites, reserves, nowSec, {
        allowAntiCap: true,
      });
      if (gaDecision.shouldClaim) {
        try {
          const gaRes = await dispatchRpc([buildGrandFarmCoinsCall()]);
          if (gaRes?.ok !== false) claimedGa = true;
        } catch (_) {}
      }

      const renewableIds = findFreeRenewableFavoriteShops(catalog.shops, catalog.slots, favorites, Math.floor(Date.now() / 1000));
      let renewed = 0;
      for (const shopId of renewableIds) {
        const res = await dispatchRpc([buildShopRefreshCall(shopId)]);
        if (res?.ok !== false) renewed++;
      }

      catalog = parseShopCatalog(cacheRef.value?.shopGetMany?.data, cacheRef.value, Math.floor(Date.now() / 1000));
      const balances: Record<string, number> = {};
      for (const s of catalog.slots) {
        if (s.balance != null && !(s.currencyKey in balances)) balances[s.currencyKey] = s.balance;
      }
      const { plan } = planFavoriteShopPurchases(catalog.slots, favorites, balances, reserves);
      let bought = 0;
      for (const slot of plan) {
        if (slot.isEmerald || slot.bought) continue;
        const res = await dispatchRpc([buildShopBuyCall(slot)]);
        if (res?.ok === false) break;
        bought++;
      }

      const summaryParts: string[] = [];
      if (claimedGa) summaryParts.push('claimed GA coins');
      if (renewed > 0) summaryParts.push(`free-renewed ${renewed} shop(s)`);
      if (bought > 0) summaryParts.push(`bought ${bought} favorite(s)`);
      runtimeState.steps['shop-favorites'] = {
        status: 'done',
        detail: summaryParts.length > 0 ? summaryParts.join(' · ') : 'No eligible favorite purchases right now',
        completedAt: Date.now(),
      };
      return;
    }

    if (stepId === 'tower') {
      const tower = towerActivityState(cacheRef.value, Date.now());
      if (tower.state === 'done') {
        runtimeState.steps.tower = {
          status: 'done',
          detail: tower.detail,
          completedAt: Date.now(),
        };
        return;
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const res: any = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ kind: 'tower-run-start' }, (response) => {
              const err = chrome.runtime.lastError;
              resolve(err ? { ok: false, error: err.message } : (response || { ok: true }));
            });
          } catch (e: any) {
            resolve({ ok: false, error: e?.message || String(e) });
          }
        });
        if (res?.ok === false && res?.error) {
          throw new Error(res.error);
        }
        const liveTower = towerActivityState(cacheRef.value, Date.now());
        runtimeState.steps.tower = {
          status: liveTower.state === 'done' ? 'done' : 'running',
          detail: liveTower.detail || 'Tower runner started',
          ...(liveTower.state === 'done' ? { completedAt: Date.now() } : {}),
        };
        return;
      }
      runtimeState.steps.tower = {
        status: 'skipped',
        detail: 'Background Tower runner unavailable — open Tower dialog to run manually',
      };
      return;
    }

    if (stepId === 'arena') {
      const arena = arenaActivityState(cacheRef.value, false, Date.now());
      if (arena.state === 'done') {
        runtimeState.steps.arena = {
          status: 'done',
          detail: arena.detail,
          completedAt: Date.now(),
        };
        return;
      }
      await dispatchRpc([{ name: 'arenaGetAll', args: {} }]);
      const refreshed = arenaActivityState(cacheRef.value, false, Date.now());
      if (refreshed.state === 'done') {
        runtimeState.steps.arena = {
          status: 'done',
          detail: refreshed.detail,
          completedAt: Date.now(),
        };
        return;
      }
      runtimeState.steps.arena = {
        status: 'skipped',
        detail: `${refreshed.detail} — open Arena dialog to select opponent & run WASM battle safely`,
      };
      return;
    }

    // Remaining high-risk combat modes delegate safely to their dedicated dialogs/orchestrators
    const label = DAILY_STEP_LABELS[stepId] || stepId;
    runtimeState.steps[stepId] = {
      status: 'skipped',
      detail: `Open ${label} dialog to run combat safely`,
    };
  }

  async function runSingleStep(stepId: DailyActivityId): Promise<void> {
    if (runtimeState.running || !dispatchRpc) return;
    const doneCheck = isDailyActivityAlreadyDone(stepId, cacheRef.value, Date.now());
    if (doneCheck.done) {
      runtimeState.steps[stepId] = {
        status: 'done',
        detail: doneCheck.detail || 'Completed today',
      };
      persistRuntime();
      return;
    }
    abortRequested = false;
    const label = DAILY_STEP_LABELS[stepId] || stepId;
    runtimeState.running = true;
    runtimeState.activeStepId = stepId;
    runtimeState.summary = `Running: ${label}`;
    runtimeState.steps[stepId] = { status: 'running', detail: `Running ${label}…` };
    persistRuntime();

    try {
      await executeStep(stepId);
    } catch (err: any) {
      runtimeState.steps[stepId] = {
        status: 'error',
        error: err?.message || String(err),
      };
    } finally {
      runtimeState.running = false;
      runtimeState.activeStepId = null;
      const finishedTime = formatShortTime(Date.now());
      const st = runtimeState.steps[stepId];
      runtimeState.summary =
        st?.status === 'error'
          ? `${label} failed at ${finishedTime}`
          : `${label} · ${st?.status || 'done'} (${finishedTime})`;
      persistRuntime();
    }
  }

  async function startAutopilot() {
    if (runtimeState.running || !dispatchRpc) return;
    abortRequested = false;
    const now = Date.now();
    const anchor = resolveDailyResetAnchor(cacheRef.value, settings.value, now);
    const plan = buildDailyExecutionPlan(settings.value, cacheRef.value, now);

    runtimeState.running = true;
    runtimeState.cycleKey = anchor.cycleKey;
    runtimeState.startedAt = now;
    runtimeState.finishedAt = null;
    runtimeState.steps = {};
    persistRuntime();

    let errorCount = 0;
    let doneCount = 0;

    try {
      for (let i = 0; i < plan.length; i++) {
        if (abortRequested) break;
        const step = plan[i]!;
        if (!step.shouldRun) {
          if (step.alreadyDone) {
            runtimeState.steps[step.id] = {
              status: 'done',
              detail: step.skipReason || 'Completed today',
            };
            doneCount++;
          } else if (step.waiting) {
            if (step.id === 'expeditions' && step.waitingUntil && typeof chrome !== 'undefined' && chrome.alarms?.create) {
              try {
                chrome.alarms.create('daily-autopilot-expedition-wake', { when: step.waitingUntil });
              } catch (_) {}
            }
            runtimeState.steps[step.id] = {
              status: 'waiting',
              ...(step.waitingUntil ? { waitingUntil: step.waitingUntil } : {}),
              detail: step.skipReason || 'Waiting for timer',
            };
          } else {
            runtimeState.steps[step.id] = {
              status: 'skipped',
              detail: step.skipReason || 'Skipped',
            };
          }
          persistRuntime();
          continue;
        }

        runtimeState.activeStepId = step.id;
        runtimeState.summary = `Running: ${step.label} (${i + 1}/${plan.length})`;
        runtimeState.steps[step.id] = { status: 'running', detail: `Running ${step.label}…` };
        persistRuntime();

        try {
          await executeStep(step.id);
          if (runtimeState.steps[step.id]?.status === 'error') {
            errorCount++;
            if (settings.value.errorPolicy === 'stop-all') break;
          } else {
            doneCount++;
          }
        } catch (err: any) {
          errorCount++;
          runtimeState.steps[step.id] = {
            status: 'error',
            error: err?.message || String(err),
          };
          persistRuntime();
          if (settings.value.errorPolicy === 'stop-all') break;
        }

        if (!abortRequested && i < plan.length - 1) {
          await new Promise((r) => setTimeout(r, 900 + Math.floor(Math.random() * 700)));
        }
      }
    } finally {
      runtimeState.running = false;
      runtimeState.activeStepId = null;
      runtimeState.finishedAt = Date.now();
      const finishedTime = formatShortTime(runtimeState.finishedAt);
      runtimeState.summary = abortRequested
        ? `Stopped at ${finishedTime}`
        : errorCount > 0
          ? `Done ${finishedTime} (${errorCount} error${errorCount > 1 ? 's' : ''})`
          : `Done · ${finishedTime} (${doneCount} steps)`;
      persistRuntime();
    }
  }

  function stopAutopilot() {
    abortRequested = true;
    runtimeState.summary = 'Stopping…';
    void stopActiveAutopilotDialogRunner(runtimeState.activeStepId);
  }

  return {
    settings,
    runtimeState,
    resetAnchor,
    freeGiftItems,
    runningFreeGiftIds,
    freeGiftErrors,
    statusSummary,
    saveSettings,
    startAutopilot,
    stopAutopilot,
    runSingleStep,
    runSingleFreeGift,
  };
}
