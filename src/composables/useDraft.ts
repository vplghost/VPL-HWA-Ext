import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import type { DraftSessionData, DraftDto, DraftEnemyUser } from '../types/game/draft.ts';
import {
  formatDraftPhase,
  parseDraftDto,
  extractDraftHeroSteps,
  extractDraftSwapHeroIds,
  extractDraftHeroDetails,
  extractDraftEnemyHeroes,
  normalizeDraftHeroIdList,
} from '../utils/draftHelper.ts';
import { useModals } from './useModals.ts';

const createDefaultSession = (): DraftSessionData => ({
  matchId: null,
  stageId: null,
  phase: 'idle',
  phaseLabel: 'Waiting for New Session (Idle)',
  stageFinishTs: null,
  gameTimeTs: null,
  userRating: null,
  enemyRating: null,
  enemyUser: null,
  heroSteps: [],
  swapHeroIds: [],
  heroDetails: {},
  enemyHeroes: [],
  chosenDefenceHeroes: [],
  chosenAttackHeroes: [],
  rawCiphertext: null,
  rawEnemyCiphertext: null,
  rawDecrypted: null,
  rawEnemyDecrypted: null,
  decryptMethod: null,
  error: null,
  errorDetail: null,
  updatedAt: Date.now()
});

const draftSession = reactive<DraftSessionData>(createDefaultSession());
const autoOpenDraft = ref(true);
let listenersInstalled = false;

export function useDraft() {
  const { openModal } = useModals();

  function applySessionSnapshot(incoming: any) {
    if (!incoming || typeof incoming !== 'object') return;
    const isNewMatch =
      incoming.matchId != null &&
      draftSession.matchId != null &&
      Number(incoming.matchId) !== Number(draftSession.matchId);
    const mergedDetails =
      !isNewMatch && incoming.heroDetails && typeof incoming.heroDetails === 'object'
        ? { ...(draftSession.heroDetails || {}), ...incoming.heroDetails }
        : (incoming.heroDetails && typeof incoming.heroDetails === 'object' ? { ...incoming.heroDetails } : (isNewMatch ? {} : draftSession.heroDetails));

    Object.assign(draftSession, incoming);
    draftSession.chosenDefenceHeroes = normalizeDraftHeroIdList(incoming.chosenDefenceHeroes);
    draftSession.chosenAttackHeroes = normalizeDraftHeroIdList(incoming.chosenAttackHeroes);
    draftSession.swapHeroIds = normalizeDraftHeroIdList(incoming.swapHeroIds);
    draftSession.heroDetails = mergedDetails || {};
    if (incoming.stageId != null) {
      const phaseInfo = formatDraftPhase(Number(incoming.stageId));
      draftSession.phase = phaseInfo.phase;
      draftSession.phaseLabel = phaseInfo.label;
    }
  }

  async function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      try {
        const stored = await chrome.storage.local.get(['autoOpenDraftDialog', 'legendsDraftSession']);
        if (typeof stored.autoOpenDraftDialog === 'boolean') {
          autoOpenDraft.value = stored.autoOpenDraftDialog;
        }
        if (stored.legendsDraftSession && typeof stored.legendsDraftSession === 'object') {
          applySessionSnapshot(stored.legendsDraftSession);
        }
      } catch (_) {}
    }
  }

  async function saveAutoOpen(enabled: boolean) {
    autoOpenDraft.value = enabled;
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      try {
        await chrome.storage.local.set({ autoOpenDraftDialog: enabled });
      } catch (_) {}
    }
  }

  function persistSession() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      try {
        // Deep-clone to strip Vue reactive Proxy wrappers so arrays never serialize as indexed objects
        const plainSnapshot = JSON.parse(JSON.stringify({
          ...draftSession,
          chosenDefenceHeroes: normalizeDraftHeroIdList(draftSession.chosenDefenceHeroes),
          chosenAttackHeroes: normalizeDraftHeroIdList(draftSession.chosenAttackHeroes),
          swapHeroIds: normalizeDraftHeroIdList(draftSession.swapHeroIds),
        }));
        chrome.storage.local.set({ legendsDraftSession: plainSnapshot }).catch?.(() => {});
      } catch (_) {}
    }
  }

  /**
   * Bind decrypted data (e.g. from Native WASM Table Index 330804 Hook)
   */
  function bindDecryptedData(
    dto: DraftDto,
    rawText?: string,
    extra?: { enemyDraft?: any; rawEnemy?: string | null; method?: string | null; stageId?: number | null; matchId?: number | null }
  ) {
    if (!dto) return;

    const extractedSteps = extractDraftHeroSteps(dto, rawText);
    const hasCandidates = extractedSteps.length > 0;
    if (hasCandidates) {
      draftSession.heroSteps = extractedSteps;
      draftSession.swapHeroIds = extractDraftSwapHeroIds(dto, rawText);
    }
    const extractedDetails = extractDraftHeroDetails(dto);
    if (Object.keys(extractedDetails).length > 0) {
      draftSession.heroDetails = { ...(draftSession.heroDetails || {}), ...extractedDetails };
    }
    const extractedEnemy = extractDraftEnemyHeroes(extra?.enemyDraft, extra?.rawEnemy);
    const hasEnemy = extractedEnemy.length > 0;
    if (hasEnemy) {
      draftSession.enemyHeroes = extractedEnemy;
    }
    const defPicked = normalizeDraftHeroIdList(dto.chosenDefenceHeroes);
    if (defPicked.length > 0) {
      draftSession.chosenDefenceHeroes = defPicked;
    }
    const atkPicked = normalizeDraftHeroIdList(dto.chosenAttackHeroes);
    if (atkPicked.length > 0) {
      draftSession.chosenAttackHeroes = atkPicked;
    }
    if (dto.stageFinishTs) {
      draftSession.stageFinishTs = dto.stageFinishTs;
    }
    if (dto.gameTimeTs) {
      draftSession.gameTimeTs = dto.gameTimeTs;
    }
    if (rawText && (hasCandidates || !draftSession.rawDecrypted)) {
      draftSession.rawDecrypted = rawText;
    }
    if (extra?.rawEnemy && (hasEnemy || !draftSession.rawEnemyDecrypted)) {
      draftSession.rawEnemyDecrypted = extra.rawEnemy;
    }
    if (extra?.method) {
      draftSession.decryptMethod = extra.method;
    }

    // Clear previous errors if decrypt succeeded
    draftSession.error = null;
    draftSession.errorDetail = null;
    draftSession.updatedAt = Date.now();

    persistSession();

    if (autoOpenDraft.value && (hasCandidates || hasEnemy)) {
      openModal('legendsDraft');
    }
  }

  /**
   * Bind RPC event (e.g. randomDraft_getInfo / randomDraft_register / saveDefence / saveAttack)
   */
  function bindRpcEvent(resp: any, action?: string, args?: any) {
    if (!resp && action !== 'randomDraft_register' && action !== 'randomDraft_saveDefence' && action !== 'randomDraft_saveAttack') return;

    if (action === 'randomDraft_register') {
      draftSession.stageId = 1;
      const phaseInfo = formatDraftPhase(1);
      draftSession.phase = phaseInfo.phase;
      draftSession.phaseLabel = phaseInfo.label;
      draftSession.error = null;
      draftSession.errorDetail = null;
    } else if (action === 'randomDraft_saveDefence') {
      const picked = normalizeDraftHeroIdList(args?.heroes);
      if (picked.length > 0) draftSession.chosenDefenceHeroes = picked;
    } else if (action === 'randomDraft_saveAttack') {
      const picked = normalizeDraftHeroIdList(args?.heroes);
      if (picked.length > 0) draftSession.chosenAttackHeroes = picked;
    }

    if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
      // If new match detected, reset steps as new session
      const isNewMatch = resp.matchId != null && Number(resp.matchId) !== Number(draftSession.matchId);
      if (isNewMatch) {
        draftSession.heroSteps = [];
        draftSession.swapHeroIds = [];
        draftSession.heroDetails = {};
        draftSession.enemyHeroes = [];
        draftSession.chosenDefenceHeroes = [];
        draftSession.chosenAttackHeroes = [];
        draftSession.rawCiphertext = null;
        draftSession.rawEnemyCiphertext = null;
        draftSession.rawDecrypted = null;
        draftSession.rawEnemyDecrypted = null;
        draftSession.error = null;
        draftSession.errorDetail = null;
      }

      if (resp.matchId != null) {
        draftSession.matchId = Number(resp.matchId);
      }
      if (resp.stageId != null) {
        draftSession.stageId = Number(resp.stageId);
        const phaseInfo = formatDraftPhase(draftSession.stageId);
        draftSession.phase = phaseInfo.phase;
        draftSession.phaseLabel = phaseInfo.label;
      }
      if (resp.stageFinishTs != null) {
        draftSession.stageFinishTs = Number(resp.stageFinishTs);
      }
      if (resp.rating?.userRating != null) {
        draftSession.userRating = Number(resp.rating.userRating);
      }
      if (resp.rating?.enemyRating != null) {
        draftSession.enemyRating = Number(resp.rating.enemyRating);
      }
      if (resp.enemyUser && typeof resp.enemyUser === 'object') {
        draftSession.enemyUser = {
          id: resp.enemyUser.id,
          name: resp.enemyUser.name,
          level: resp.enemyUser.level,
          clanTitle: resp.enemyUser.clanTitle,
          avatarId: resp.enemyUser.avatarId
        };
      }
      if (typeof resp.draft === 'string' && resp.draft.length > 0) {
        const keepExisting = !isNewMatch && typeof draftSession.rawCiphertext === 'string' && draftSession.rawCiphertext.length > 40 && resp.draft.length <= 40;
        if (!keepExisting) draftSession.rawCiphertext = resp.draft;
      }
      if (typeof resp.draftEnemy === 'string' && resp.draftEnemy.length > 0) {
        const keepExistingEnemy = !isNewMatch && typeof draftSession.rawEnemyCiphertext === 'string' && draftSession.rawEnemyCiphertext.length > 12 && resp.draftEnemy.length <= 12;
        if (!keepExistingEnemy) draftSession.rawEnemyCiphertext = resp.draftEnemy;
      }
    }

    draftSession.updatedAt = Date.now();
    persistSession();

    // Auto open when starting or actively playing a draft session
    const isActiveStage = draftSession.stageId != null && [1, 2, 3, 4, 5].includes(draftSession.stageId);
    if (autoOpenDraft.value && (action === 'randomDraft_register' || isActiveStage)) {
      openModal('legendsDraft');
    }
  }

  /**
   * Record decryption error
   */
  function bindError(errorMsg: string, detail?: string, raw?: string) {
    draftSession.error = errorMsg;
    draftSession.errorDetail = detail || null;
    if (raw) draftSession.rawDecrypted = raw;
    draftSession.updatedAt = Date.now();
    persistSession();

    if (autoOpenDraft.value) {
      openModal('legendsDraft');
    }
  }

  function resetDraft() {
    Object.assign(draftSession, createDefaultSession());
    persistSession();
  }

  function retryDecrypt() {
    if (!draftSession.rawCiphertext) return;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        kind: 'retry-draft-decrypt',
        ciphertext: draftSession.rawCiphertext,
        enemyCiphertext: draftSession.rawEnemyCiphertext || null,
        stageId: draftSession.stageId,
        matchId: draftSession.matchId
      }).catch?.(() => {});
    }
  }

  // Setup runtime listeners once
  if (!listenersInstalled && typeof chrome !== 'undefined') {
    listenersInstalled = true;

    // Listen to storage changes from background or another tab
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'local') return;
      if (changes.autoOpenDraftDialog) {
        autoOpenDraft.value = changes.autoOpenDraftDialog.newValue === true;
      }
      if (changes.legendsDraftSession?.newValue) {
        const prevNonce = (changes.legendsDraftSession.oldValue as any)?.autoOpenNonce;
        const nextVal = changes.legendsDraftSession.newValue as any;
        applySessionSnapshot(nextVal);
        if (autoOpenDraft.value && nextVal.autoOpenNonce && nextVal.autoOpenNonce !== prevNonce) {
          openModal('legendsDraft');
        }
      }
    });

    // Listen to runtime messages
    chrome.runtime?.onMessage?.addListener?.((message: any) => {
      if (message?.kind === 'open-draft-dialog') {
        if (message.session) {
          applySessionSnapshot(message.session);
        }
        openModal('legendsDraft');
      } else if (message?.kind === 'draft-decrypted') {
        bindDecryptedData(message.data?.draft, message.data?.raw, {
          enemyDraft: message.data?.enemyDraft,
          rawEnemy: message.data?.rawEnemy,
          method: message.data?.method,
          stageId: message.data?.stageId,
          matchId: message.data?.matchId,
        });
      } else if (message?.kind === 'draft-rpc-event') {
        bindRpcEvent(message.data?.response, message.data?.action, message.data?.args);
      } else if (message?.kind === 'draft-mqtt-event') {
        draftSession.updatedAt = Date.now();
        if (autoOpenDraft.value) {
          openModal('legendsDraft');
        }
      } else if (message?.kind === 'draft-decrypt-error') {
        bindError(message.data?.error, message.data?.detail, message.data?.raw);
      }
    });
  }

  onMounted(() => {
    void loadSettings();
  });

  return {
    draftSession,
    autoOpenDraft,
    saveAutoOpen,
    bindDecryptedData,
    bindRpcEvent,
    bindError,
    resetDraft,
    retryDecrypt,
    loadSettings
  };
}
