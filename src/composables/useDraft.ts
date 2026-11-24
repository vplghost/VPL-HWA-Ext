import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import type { DraftSessionData, DraftDto, DraftEnemyUser } from '../types/game/draft.ts';
import { formatDraftPhase, parseDraftDto, extractDraftHeroSteps } from '../utils/draftHelper.ts';
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
  chosenDefenceHeroes: [],
  chosenAttackHeroes: [],
  rawCiphertext: null,
  rawDecrypted: null,
  error: null,
  errorDetail: null,
  updatedAt: Date.now()
});

const draftSession = reactive<DraftSessionData>(createDefaultSession());
const autoOpenDraft = ref(true);
let listenersInstalled = false;

export function useDraft() {
  const { openModal } = useModals();

  async function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      try {
        const stored = await chrome.storage.local.get(['autoOpenDraftDialog', 'legendsDraftSession']);
        if (typeof stored.autoOpenDraftDialog === 'boolean') {
          autoOpenDraft.value = stored.autoOpenDraftDialog;
        }
        if (stored.legendsDraftSession && typeof stored.legendsDraftSession === 'object') {
          Object.assign(draftSession, stored.legendsDraftSession);
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
      chrome.storage.local.set({ legendsDraftSession: { ...draftSession } }).catch?.(() => {});
    }
  }

  /**
   * Bind decrypted data (e.g. from Native WASM Table Index 330804 Hook)
   */
  function bindDecryptedData(dto: DraftDto, rawText?: string) {
    if (!dto) return;

    const extractedSteps = extractDraftHeroSteps(dto);
    if (extractedSteps.length > 0) {
      draftSession.heroSteps = extractedSteps;
    }
    if (Array.isArray(dto.chosenDefenceHeroes)) {
      draftSession.chosenDefenceHeroes = [...dto.chosenDefenceHeroes];
    }
    if (Array.isArray(dto.chosenAttackHeroes)) {
      draftSession.chosenAttackHeroes = [...dto.chosenAttackHeroes];
    }
    if (dto.stageFinishTs) {
      draftSession.stageFinishTs = dto.stageFinishTs;
    }
    if (dto.gameTimeTs) {
      draftSession.gameTimeTs = dto.gameTimeTs;
    }
    if (rawText) {
      draftSession.rawDecrypted = rawText;
    }

    // Clear previous errors if decrypt succeeded
    draftSession.error = null;
    draftSession.errorDetail = null;
    draftSession.updatedAt = Date.now();

    persistSession();

    if (autoOpenDraft.value) {
      openModal('legendsDraft');
    }
  }

  /**
   * Bind RPC event (e.g. randomDraft_getInfo / randomDraft_register response)
   */
  function bindRpcEvent(resp: any, action?: string) {
    if (!resp && action !== 'randomDraft_register') return;

    if (action === 'randomDraft_register') {
      draftSession.stageId = 1;
      const phaseInfo = formatDraftPhase(1);
      draftSession.phase = phaseInfo.phase;
      draftSession.phaseLabel = phaseInfo.label;
      draftSession.error = null;
      draftSession.errorDetail = null;
    }

    if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
      // If new match detected, reset steps as new session
      if (resp.matchId != null && resp.matchId !== draftSession.matchId) {
        draftSession.heroSteps = [];
        draftSession.chosenDefenceHeroes = [];
        draftSession.chosenAttackHeroes = [];
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
      if (resp.draft) {
        draftSession.rawCiphertext = resp.draft;
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
        Object.assign(draftSession, nextVal);
        if (nextVal.stageId != null) {
          const phaseInfo = formatDraftPhase(Number(nextVal.stageId));
          draftSession.phase = phaseInfo.phase;
          draftSession.phaseLabel = phaseInfo.label;
        }
        if (autoOpenDraft.value && nextVal.autoOpenNonce && nextVal.autoOpenNonce !== prevNonce) {
          openModal('legendsDraft');
        }
      }
    });

    // Listen to runtime messages
    chrome.runtime?.onMessage?.addListener?.((message: any) => {
      if (message?.kind === 'open-draft-dialog') {
        if (message.session) {
          Object.assign(draftSession, message.session);
          if (message.session.stageId != null) {
            const phaseInfo = formatDraftPhase(Number(message.session.stageId));
            draftSession.phase = phaseInfo.phase;
            draftSession.phaseLabel = phaseInfo.label;
          }
        }
        openModal('legendsDraft');
      } else if (message?.kind === 'draft-decrypted') {
        bindDecryptedData(message.data?.draft, message.data?.raw);
      } else if (message?.kind === 'draft-rpc-event') {
        bindRpcEvent(message.data?.response, message.data?.action);
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
    loadSettings
  };
}
