/**
 * Modular Legends Draft Message Handler (`draftHandler.ts`).
 * Extracted from backgroundRuntime.ts for clean maintainability and isolated testing.
 */
import {
  extractDraftHeroSteps,
  extractDraftSwapHeroIds,
  extractDraftHeroDetails,
} from '../../utils/draftHelper.ts';

export const DRAFT_MESSAGE_KINDS = new Set([
  'draft-decrypted',
  'draft-decrypt-error',
  'draft-rpc-event',
  'draft-mqtt-event',
]);

export function handleDraftMessage(message: any, cr: any): boolean {
  if (!DRAFT_MESSAGE_KINDS.has(message?.kind)) return false;

  try {
    cr.storage?.local?.get(['autoOpenDraftDialog', 'legendsDraftSession'], (stored: any) => {
      const autoOpen = stored?.autoOpenDraftDialog !== false;
      let session = stored?.legendsDraftSession || {};
      let shouldAutoOpen = false;

      if (message.kind === 'draft-decrypted') {
        const dto = message.data?.draft;
        const heroSteps = extractDraftHeroSteps(dto);
        const swapHeroIds = extractDraftSwapHeroIds(dto);
        const heroDetails = extractDraftHeroDetails(dto);
        session = {
          ...session,
          heroSteps: heroSteps.length > 0 ? heroSteps : (session.heroSteps || []),
          swapHeroIds: (swapHeroIds.length > 0 || (dto && 'swap' in dto)) ? swapHeroIds : (session.swapHeroIds || []),
          heroDetails: Object.keys(heroDetails).length > 0
            ? { ...(session.heroDetails || {}), ...heroDetails }
            : (session.heroDetails || {}),
          chosenDefenceHeroes: dto?.chosenDefenceHeroes || session.chosenDefenceHeroes || [],
          chosenAttackHeroes: dto?.chosenAttackHeroes || session.chosenAttackHeroes || [],
          stageFinishTs: dto?.stageFinishTs || session.stageFinishTs,
          gameTimeTs: dto?.gameTimeTs || session.gameTimeTs,
          rawDecrypted: message.data?.raw || session.rawDecrypted || null,
          error: null,
          errorDetail: null,
          updatedAt: Date.now(),
        };
        shouldAutoOpen = true;
      } else if (message.kind === 'draft-rpc-event') {
        const action = String(message.data?.action || '');
        const resp = message.data?.response;
        if (action === 'randomDraft_register') {
          session = {
            ...session,
            stageId: 1,
            error: null,
            errorDetail: null,
            updatedAt: Date.now(),
          };
          shouldAutoOpen = true;
        }
        if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
          if (resp.matchId != null && resp.matchId !== session.matchId) {
            session.heroSteps = [];
            session.swapHeroIds = [];
            session.heroDetails = {};
            session.chosenDefenceHeroes = [];
            session.chosenAttackHeroes = [];
          }
          const nextStageId = resp.stageId != null ? Number(resp.stageId) : session.stageId;
          session = {
            ...session,
            matchId: resp.matchId != null ? Number(resp.matchId) : session.matchId,
            stageId: nextStageId,
            stageFinishTs: resp.stageFinishTs != null ? Number(resp.stageFinishTs) : session.stageFinishTs,
            userRating: resp.rating?.userRating != null ? Number(resp.rating.userRating) : session.userRating,
            enemyRating: resp.rating?.enemyRating != null ? Number(resp.rating.enemyRating) : session.enemyRating,
            enemyUser: resp.enemyUser ? { ...resp.enemyUser } : session.enemyUser,
            rawCiphertext: resp.draft || session.rawCiphertext,
            updatedAt: Date.now(),
          };
          if (nextStageId != null && [1, 2, 3, 4, 5].includes(nextStageId)) {
            shouldAutoOpen = true;
          }
        }
      } else if (message.kind === 'draft-mqtt-event') {
        session = {
          ...session,
          updatedAt: Date.now(),
        };
        shouldAutoOpen = true;
      } else if (message.kind === 'draft-decrypt-error') {
        session = {
          ...session,
          error: message.data?.error || 'Unable to decrypt Legends Draft payload',
          errorDetail: message.data?.detail || null,
          rawDecrypted: message.data?.raw || session.rawDecrypted || null,
          updatedAt: Date.now(),
        };
        shouldAutoOpen = true;
      }

      if (autoOpen && shouldAutoOpen) {
        session = {
          ...session,
          autoOpenNonce: Date.now(),
        };
      }

      cr.storage?.local?.set?.({ legendsDraftSession: session })?.catch?.(() => {});

      if (autoOpen && shouldAutoOpen) {
        cr.runtime?.sendMessage?.({ kind: 'open-draft-dialog', session })?.catch?.(() => {});
      }
    });
  } catch (_) {}

  return true;
}
