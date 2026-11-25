/**
 * Modular Legends Draft Message Handler (`draftHandler.ts`).
 * Extracted from backgroundRuntime.ts for clean maintainability and isolated testing.
 */
import {
  extractDraftHeroSteps,
  extractDraftSwapHeroIds,
  extractDraftHeroDetails,
  extractDraftEnemyHeroes,
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
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
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
            session = {
              ...session,
              ...(message.data?.matchId != null ? { matchId: Number(message.data.matchId) } : {}),
              ...(message.data?.stageId != null ? { stageId: Number(message.data.stageId) } : {}),
              heroSteps: hasCandidates ? heroSteps : (session.heroSteps || []),
              swapHeroIds: hasCandidates
                ? swapHeroIds
                : (session.swapHeroIds || []),
              heroDetails: Object.keys(heroDetails).length > 0
                ? { ...(session.heroDetails || {}), ...heroDetails }
                : (session.heroDetails || {}),
              enemyHeroes: hasEnemy ? enemyHeroes : (session.enemyHeroes || []),
              chosenDefenceHeroes: Array.isArray(dto?.chosenDefenceHeroes) ? dto.chosenDefenceHeroes : (session.chosenDefenceHeroes || []),
              chosenAttackHeroes: Array.isArray(dto?.chosenAttackHeroes) ? dto.chosenAttackHeroes : (session.chosenAttackHeroes || []),
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
