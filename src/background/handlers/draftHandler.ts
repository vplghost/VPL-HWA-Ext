/**
 * Modular Legends Draft Message Handler (`draftHandler.ts`).
 * Extracted from backgroundRuntime.ts for clean maintainability and isolated testing.
 */
import {
  extractDraftHeroSteps,
  extractDraftSwapHeroIds,
  extractDraftHeroDetails,
  extractDraftEnemyHeroes,
  normalizeDraftHeroIdList,
} from '../../utils/draftHelper.ts';

export const DRAFT_MESSAGE_KINDS = new Set([
  'draft-decrypted',
  'draft-decrypt-error',
  'draft-rpc-event',
  'draft-mqtt-event',
]);

let draftInFlight = false;
const draftQueue: Array<() => void> = [];
const draftFlushResolvers: Array<() => void> = [];

/**
 * Wait for all queued Legends Draft storage mutations to finish (useful in tests).
 */
export function flushDraftMessageQueue(): Promise<void> {
  if (!draftInFlight && draftQueue.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    draftFlushResolvers.push(resolve);
  });
}

function drainDraftQueue(): void {
  if (draftInFlight) return;
  const next = draftQueue.shift();
  if (!next) {
    while (draftFlushResolvers.length > 0) {
      draftFlushResolvers.shift()?.();
    }
    return;
  }
  draftInFlight = true;
  next();
}

function normalizeHeroIdList(arr: any): number[] {
  return normalizeDraftHeroIdList(arr);
}

export function handleDraftMessage(message: any, cr: any): boolean {
  if (!DRAFT_MESSAGE_KINDS.has(message?.kind)) return false;

  draftQueue.push(() => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      draftInFlight = false;
      drainDraftQueue();
    };

    try {
      const onStored = (stored: any) => {
        try {
          const autoOpen = stored?.autoOpenDraftDialog !== false;
          let session = stored?.legendsDraftSession ? { ...stored.legendsDraftSession } : {};
          let shouldAutoOpen = false;

          if (message.kind === 'draft-decrypted') {
            const dto = message.data?.draft;
            const rawText = typeof message.data?.raw === 'string' ? message.data.raw : null;
            const rawEnemyText = typeof message.data?.rawEnemy === 'string' ? message.data.rawEnemy : null;
            const heroSteps = extractDraftHeroSteps(dto, rawText);
            const swapHeroIds = extractDraftSwapHeroIds(dto, rawText);
            const heroDetails = extractDraftHeroDetails(dto);
            const enemyHeroes = extractDraftEnemyHeroes(message.data?.enemyDraft, rawEnemyText);
            const hasCandidates = heroSteps.length > 0;
            const hasEnemy = enemyHeroes.length > 0;
            const isNewMatch = message.data?.matchId != null && session.matchId != null && Number(message.data.matchId) !== Number(session.matchId);
            const prevDef = isNewMatch ? [] : normalizeDraftHeroIdList(session.chosenDefenceHeroes);
            const prevAtk = isNewMatch ? [] : normalizeDraftHeroIdList(session.chosenAttackHeroes);
            const incomingStageId = message.data?.stageId != null ? Number(message.data.stageId) : session.stageId;
            const prevSteps = isNewMatch ? [] : (Array.isArray(session.heroSteps) ? session.heroSteps : []);
            const flatIncomingIds = heroSteps.flat();
            // At stageId=3 (waiting for opponent after submitting Defense), server returns only the 5 chosen heroes
            // instead of the full 15-hero 5x3 pool. Preserve the 5-column matrix so cards never collapse to 2 columns.
            const isReducedSubmittedPayload =
              !isNewMatch &&
              prevSteps.length === 5 &&
              heroSteps.length > 0 &&
              heroSteps.length < 5 &&
              flatIncomingIds.length <= 5;
            const nextDefFromDto = normalizeDraftHeroIdList(dto?.chosenDefenceHeroes);
            const nextAtkFromDto = normalizeDraftHeroIdList(dto?.chosenAttackHeroes);
            const inferredDef =
              nextDefFromDto.length > 0
                ? nextDefFromDto
                : (incomingStageId === 3 && flatIncomingIds.length === 5 ? flatIncomingIds : prevDef);
            const inferredAtk =
              nextAtkFromDto.length > 0
                ? nextAtkFromDto
                : (incomingStageId === 5 && flatIncomingIds.length === 5 ? flatIncomingIds : prevAtk);
            const prevDetails = isNewMatch ? {} : (session.heroDetails || {});
            session = {
              ...session,
              ...(message.data?.matchId != null ? { matchId: Number(message.data.matchId) } : {}),
              ...(message.data?.stageId != null ? { stageId: Number(message.data.stageId) } : {}),
              heroSteps: isReducedSubmittedPayload
                ? prevSteps
                : (hasCandidates ? heroSteps : prevSteps),
              swapHeroIds: isReducedSubmittedPayload
                ? (session.swapHeroIds || [])
                : (hasCandidates ? swapHeroIds : (isNewMatch ? [] : (session.swapHeroIds || []))),
              heroDetails: Object.keys(heroDetails).length > 0
                ? { ...prevDetails, ...heroDetails }
                : prevDetails,
              enemyHeroes: hasEnemy ? enemyHeroes : (isNewMatch ? [] : (session.enemyHeroes || [])),
              chosenDefenceHeroes: inferredDef,
              chosenAttackHeroes: inferredAtk,
              stageFinishTs: dto?.stageFinishTs || session.stageFinishTs,
              gameTimeTs: dto?.gameTimeTs || session.gameTimeTs,
              rawDecrypted: (hasCandidates || !session.rawDecrypted) ? (rawText || session.rawDecrypted || null) : session.rawDecrypted,
              rawEnemyDecrypted: (hasEnemy || !session.rawEnemyDecrypted) ? (rawEnemyText || session.rawEnemyDecrypted || null) : session.rawEnemyDecrypted,
              decryptMethod: message.data?.method || session.decryptMethod || null,
              error: null,
              errorDetail: null,
              updatedAt: Date.now(),
            };
            if (hasCandidates || hasEnemy) {
              shouldAutoOpen = true;
            }
          } else if (message.kind === 'draft-rpc-event') {
            const action = String(message.data?.action || '');
            const args = message.data?.args;
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
            } else if (action === 'randomDraft_saveDefence') {
              const picked = normalizeHeroIdList(args?.heroes);
              if (picked.length > 0) {
                session = { ...session, chosenDefenceHeroes: picked, updatedAt: Date.now() };
              }
            } else if (action === 'randomDraft_saveAttack') {
              const picked = normalizeHeroIdList(args?.heroes);
              if (picked.length > 0) {
                session = { ...session, chosenAttackHeroes: picked, updatedAt: Date.now() };
              }
            } else if (action === 'randomDraft_result' && resp && typeof resp === 'object' && resp.result != null) {
              session = {
                ...session,
                stageId: 7,
                lastMatchResult: {
                  matchId: resp.matchId != null ? Number(resp.matchId) : (session.matchId ?? null),
                  win: Number(resp.result) === 0,
                  result: Number(resp.result),
                  resultDetails: resp.resultDetails != null ? Number(resp.resultDetails) : null,
                  userRating: resp.rating?.userRating != null ? Number(resp.rating.userRating) : (session.userRating ?? null),
                  enemyRating: resp.rating?.enemyRating != null ? Number(resp.rating.enemyRating) : (session.enemyRating ?? null),
                  ratingDelta: resp.rating?.userDifRating != null ? Number(resp.rating.userDifRating) : null,
                  draftBpExp: Number(resp.reward?.draftBpExp ?? 0) || 0,
                },
                updatedAt: Date.now(),
              };
            }
            if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
              const isNewMatch = resp.matchId != null && Number(resp.matchId) !== Number(session.matchId);
              if (isNewMatch) {
                session.heroSteps = [];
                session.swapHeroIds = [];
                session.heroDetails = {};
                session.enemyHeroes = [];
                session.chosenDefenceHeroes = [];
                session.chosenAttackHeroes = [];
                session.rawCiphertext = null;
                session.rawEnemyCiphertext = null;
                session.rawDecrypted = null;
                session.rawEnemyDecrypted = null;
                session.error = null;
                session.errorDetail = null;
              }
              const nextStageId = resp.stageId != null ? Number(resp.stageId) : session.stageId;
              const incomingCipher = typeof resp.draft === 'string' && resp.draft.length > 0 ? resp.draft : null;
              const incomingEnemyCipher = typeof resp.draftEnemy === 'string' && resp.draftEnemy.length > 0 ? resp.draftEnemy : null;
              const keepExistingCipher = !isNewMatch && typeof session.rawCiphertext === 'string' && session.rawCiphertext.length > 40 && incomingCipher != null && incomingCipher.length <= 40;
              const keepExistingEnemyCipher = !isNewMatch && typeof session.rawEnemyCiphertext === 'string' && session.rawEnemyCiphertext.length > 12 && incomingEnemyCipher != null && incomingEnemyCipher.length <= 12;
              session = {
                ...session,
                matchId: resp.matchId != null ? Number(resp.matchId) : session.matchId,
                stageId: nextStageId,
                stageFinishTs: resp.stageFinishTs != null ? Number(resp.stageFinishTs) : session.stageFinishTs,
                userRating: resp.rating?.userRating != null ? Number(resp.rating.userRating) : session.userRating,
                enemyRating: resp.rating?.enemyRating != null ? Number(resp.rating.enemyRating) : session.enemyRating,
                enemyUser: resp.enemyUser ? { ...resp.enemyUser } : session.enemyUser,
                winstreak: resp.winstreak && typeof resp.winstreak === 'object' ? { ...resp.winstreak } : session.winstreak,
                rawCiphertext: keepExistingCipher ? session.rawCiphertext : (incomingCipher || session.rawCiphertext),
                rawEnemyCiphertext: keepExistingEnemyCipher ? session.rawEnemyCiphertext : (incomingEnemyCipher || session.rawEnemyCiphertext),
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

          if (autoOpen && shouldAutoOpen) {
            cr.runtime?.sendMessage?.({ kind: 'open-draft-dialog', session })?.catch?.(() => {});
          }

          const setFn = cr.storage?.local?.set;
          if (typeof setFn === 'function') {
            if (setFn.length >= 2) {
              const maybeP = setFn.call(cr.storage.local, { legendsDraftSession: session }, () => done());
              if (maybeP && typeof maybeP.then === 'function') {
                maybeP.then(() => done()).catch(() => done());
              }
            } else {
              const maybeP = setFn.call(cr.storage.local, { legendsDraftSession: session });
              if (maybeP && typeof maybeP.then === 'function') {
                maybeP.then(() => done()).catch(() => done());
              } else {
                done();
              }
            }
          } else {
            done();
          }
        } catch (_) {
          done();
        }
      };

      const getFn = cr.storage?.local?.get;
      if (typeof getFn === 'function') {
        const maybeP = getFn.call(cr.storage.local, ['autoOpenDraftDialog', 'legendsDraftSession'], (stored: any) => {
          onStored(stored);
        });
        if (maybeP && typeof maybeP.then === 'function') {
          maybeP.then((stored: any) => {
            if (!finished) onStored(stored);
          }).catch(() => done());
        }
      } else {
        done();
      }
    } catch (_) {
      done();
    }
  });

  drainDraftQueue();
  return true;
}
