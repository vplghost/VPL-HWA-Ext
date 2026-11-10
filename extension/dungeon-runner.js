(() => {
  const planner = globalThis.hwaHelperDungeonAutomation;
  const terminal = (state) => !state || ['complete', 'stopped'].includes(state.phase);
  const stop = (state, reason, casualty = null) => ({
    ...state,
    phase: 'stopped',
    statusText: reason,
    reason,
    casualty: casualty || null,
    wakeAt: null
  });

  const issue = (state, phase, call, now) => ({
    state: { ...state, phase, expected: call, sentAt: now, wakeAt: now + 120000 },
    calls: [call],
    expiresAt: now + 120000
  });

  function makeEndBattleCall(startRes, heroesList, seed) {
    const heroMap = {};
    const list = Array.isArray(heroesList) && heroesList.length ? heroesList : [4000, 4001, 4004, 4002, 4053];
    const attackers = startRes?.attackers || {};

    for (const id of list) {
      const a = attackers[id] || attackers[String(id)];
      const hp = a?.state?.hp || a?.hp || 1000000;
      const energy = a?.state?.energy || a?.energy || 800;
      heroMap[String(id)] = {
        isDead: false,
        hp,
        energy
      };
    }

    return {
      name: 'dungeonEndBattle',
      args: {
        result: { win: true, stars: 3 },
        progress: [
          {
            defenders: { heroes: {}, input: [] },
            attackers: { heroes: heroMap, input: [] },
            duration: Number((15 + Math.random() * 10).toFixed(4)),
            seed: seed || startRes?.seed || 0
          }
        ]
      }
    };
  }

  function checkCasualtiesInBattle(endCallArgs, endRep, deployedHeroes) {
    const casualties = [];
    const progressHeroes = endCallArgs?.progress?.[0]?.attackers?.heroes || {};

    for (const hId of deployedHeroes) {
      const p = progressHeroes[String(hId)] || progressHeroes[Number(hId)];
      if (p && (p.isDead === true || (typeof p.hp === 'number' && p.hp <= 0))) {
        casualties.push(Number(hId));
      }
    }

    const serverTitans = endRep?.dungeon?.states?.titans || endRep?.states?.titans || {};
    for (const hId of deployedHeroes) {
      const s = serverTitans[String(hId)] || serverTitans[Number(hId)];
      if (s && (s.isDead === true || (typeof s.hp === 'number' && s.hp <= 0))) {
        if (!casualties.includes(Number(hId))) {
          casualties.push(Number(hId));
        }
      }
    }

    return casualties;
  }

  function getGateCoordinates(doorCount, teamNum) {
    // Single door floor: Center gate
    if (doorCount <= 1) {
      return { ratioX: 0.50, ratioY: 0.79, label: 'Center Gate' };
    }
    // 2 doors floor: Door 0 is Left, Door 1 is Right
    if (teamNum === 0) {
      return { ratioX: 0.34, ratioY: 0.79, label: 'Door 1 (Left Gate)' };
    }
    return { ratioX: 0.69, ratioY: 0.79, label: 'Door 2 (Right Gate)' };
  }

  function next(state, cache, now) {
    const dungeon = cache?.dungeonStatus?.data;
    if (!dungeon || !Array.isArray(dungeon.currentFloorDoors) || !dungeon.currentFloorDoors.length) {
      return { state: stop(state, 'Dungeon interface is not open in game. Please open Titan Dungeon.') };
    }

    const decision = planner.planDungeon(cache, state.options || {});
    if (decision.kind === 'complete') {
      return { state: { ...state, phase: 'complete', statusText: 'Dungeon cleared.', wakeAt: null } };
    }
    if (decision.kind === 'stop' || decision.kind === 'need-snapshot') {
      return { state: stop(state, decision.reason || 'Dungeon snapshot is missing. Open Dungeon in game.') };
    }
    if (decision.kind === 'busy') {
      return { state: stop(state, decision.reason) };
    }

    state.floorNumber = decision.floorNumber;
    state.teamNum = decision.teamNum;
    state.currentHeroes = decision.heroes;
    state.attackerType = decision.attackerType;

    // Check execution mode: 'canvas' (In-game UI trigger) vs 'rpc' (legacy direct RPC)
    const isCanvasMode = state.options?.executionMode === 'canvas';

    if (!isCanvasMode) {
      // Legacy RPC mode
      return issue(state, 'starting-battle', decision.call, now);
    }

    // Direction 2: In-Game Canvas Automation
    const doorCoords = getGateCoordinates(dungeon.currentFloorDoors.length, decision.teamNum);
    state.gateCoords = doorCoords;
    const updated = {
      ...state,
      phase: 'opening-gate',
      statusText: `Selecting Door ${decision.teamNum + 1} (${decision.attackerType})...`,
      sentAt: now,
      wakeAt: now + 1500
    };

    return {
      state: updated,
      canvasAction: {
        action: 'click',
        ratioX: doorCoords.ratioX,
        ratioY: doorCoords.ratioY,
        label: doorCoords.label
      },
      expiresAt: now + 120000
    };
  }

  function start(cache, settings, tabId, now) {
    const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
    if (!accountId || !Number.isInteger(tabId)) return null;
    const dungeon = cache?.dungeonStatus?.data;
    if (!dungeon || !Array.isArray(dungeon.currentFloorDoors) || !dungeon.currentFloorDoors.length) {
      return null;
    }
    return next({
      id: `${now}:${tabId}`,
      tabId,
      accountId,
      phase: 'planning',
      options: settings || {},
      startedAt: now,
      battlesCleared: 0
    }, cache, now);
  }

  function responses(record) {
    if (record?.method !== 'POST' || record.status !== 200 || record.requestBodyTruncated ||
        record.responseBodyTruncated || record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc') return [];
    try {
      const request = JSON.parse(record.requestBody);
      const response = JSON.parse(record.responseBody);
      return (request.calls || []).map((call) => ({
        call,
        result: response.results?.find((item) => item.ident === call.ident)?.result
      }));
    } catch {
      return [];
    }
  }

  function advance(previous, record, cache, now) {
    if (terminal(previous)) return { state: previous };
    const state = { ...previous };
    const accountId = cache?.accountStatus?.data?.id ?? cache?.userGetInfo?.data?.id;
    if (accountId != null && String(accountId) !== String(state.accountId)) {
      return { state: stop(state, 'Game account changed.') };
    }
    if (!record && now >= state.wakeAt) {
      if (['opening-gate', 'skipping-battle', 'dismissing-victory', 'walking-animation'].includes(state.phase)) {
        // Normal timer progression for canvas/animation phases - handled below
      } else {
        return { state: stop(state, 'Dungeon automation timed out.') };
      }
    }
    if (record && Date.parse(record.timestamp) < state.sentAt) return { state };

    const replies = record ? responses(record) : [];
    const isCanvasMode = state.options?.executionMode === 'canvas';

    // ==========================================
    // DIRECTION 2: IN-GAME CANVAS PHASES
    // ==========================================
    if (isCanvasMode) {
      // 1. Gate clicked -> 1.5s elapsed -> Popup open -> Click "Fight" button (ratioX: 0.85, ratioY: 0.75)
      if (state.phase === 'opening-gate') {
        const updated = {
          ...state,
          phase: 'waiting-battle-start',
          statusText: `Starting Battle on Floor ${state.floorNumber}...`,
          sentAt: now,
          wakeAt: now + 10000 // 10s timeout waiting for battle start
        };
        return {
          state: updated,
          canvasAction: {
            action: 'click',
            ratioX: 0.85,
            ratioY: 0.75,
            label: 'Fight Button'
          },
          expiresAt: now + 120000
        };
      }

      // 2. Waiting for battle to start (observed via dungeonStartBattle API record)
      if (state.phase === 'waiting-battle-start') {
        const startReply = replies.find(({ call }) => call.name === 'dungeonStartBattle');
        if (!startReply) {
          if (!record && now >= state.wakeAt) {
            return { state: stop(state, 'Battle did not start in game. Make sure Dungeon window is open.') };
          }
          return { state };
        }
        const startRes = startReply.result?.response;
        if (startReply.result?.error || startRes == null || startRes.error) {
          const errorReason = startRes?.error || startReply.result?.error || 'dungeonStartBattle failed.';
          return { state: stop(state, String(errorReason)) };
        }

        // Battle started in Unity! Transition to skipping-battle after 1.2s combat screen load
        const updated = {
          ...state,
          phase: 'skipping-battle',
          statusText: `Combat loading on Floor ${state.floorNumber}...`,
          battleStartedAt: now,
          sentAt: now,
          wakeAt: now + 1200
        };
        return { state: updated };
      }

      // 3. Combat loaded -> Click "Skip" button (ratioX: 0.69, ratioY: 0.81)
      if (state.phase === 'skipping-battle') {
        const updated = {
          ...state,
          phase: 'waiting-battle-end',
          statusText: `Fast-forwarding combat on Floor ${state.floorNumber}...`,
          sentAt: now,
          wakeAt: now + 15000 // 15s timeout for combat completion
        };
        return {
          state: updated,
          canvasAction: {
            action: 'click',
            ratioX: 0.69,
            ratioY: 0.81,
            label: 'Skip Button'
          },
          expiresAt: now + 120000
        };
      }

      // 4. Waiting for combat end (observed via genuine dungeonEndBattle sent by Unity)
      if (state.phase === 'waiting-battle-end') {
        const endReply = replies.find(({ call }) => call.name === 'dungeonEndBattle');
        if (!endReply) {
          if (!record && now >= state.wakeAt) {
            return { state: stop(state, 'Dungeon battle did not finish in time.') };
          }
          return { state };
        }
        const endRes = endReply.result?.response;
        if (endReply.result?.error || endRes == null || endRes.error || endReply.call?.args?.result?.win !== true) {
          const errorReason = endRes?.error || endReply.result?.error || 'Dungeon battle was lost or rejected.';
          return { state: stop(state, String(errorReason)) };
        }

        // Safety Casualty Check
        const casualties = checkCasualtiesInBattle(
          endReply.call?.args,
          endRes,
          state.currentHeroes || []
        );

        if (casualties.length > 0) {
          const meta = globalThis.hwaHelperTitanMetadata || {};
          const fallenNames = casualties.map((id) => meta[id]?.name || `Titan #${id}`).join(', ');
          return {
            state: stop(
              state,
              `Titan casualty (${fallenNames}) at floor ${state.floorNumber}. Halting dungeon automation. Press Continue Auto to proceed with remaining titans.`,
              { fallen: casualties, floor: state.floorNumber }
            )
          };
        }

        state.battlesCleared = (state.battlesCleared || 0) + 1;

        // Checkpoint save check
        const nextFloor = endRes?.dungeon?.floorNumber;
        const respawn = endRes?.dungeon?.respawnFloor;
        const needsSave = nextFloor && respawn && (nextFloor - 1 === respawn);

        // Transition to dismissing victory popup after 1.0s
        const updated = {
          ...state,
          phase: 'dismissing-victory',
          statusText: `Floor ${state.floorNumber} cleared! Claiming rewards...`,
          needsSave,
          nextFloor,
          sentAt: now,
          wakeAt: now + 1000
        };
        return { state: updated };
      }

      // 5. Dismiss victory/reward dialog by clicking center (ratioX: 0.50, ratioY: 0.38)
      // and begin walking animation delay (4.5s)
      if (state.phase === 'dismissing-victory') {
        const updated = {
          ...state,
          phase: 'walking-animation',
          statusText: `Titans moving to Floor ${state.nextFloor || state.floorNumber + 1} (walking animation)...`,
          sentAt: now,
          wakeAt: now + 4500 // 4.5 seconds walking animation!
        };
        const result = {
          state: updated,
          canvasAction: {
            action: 'click',
            ratioX: 0.50,
            ratioY: 0.38,
            label: 'Dismiss Victory'
          },
          expiresAt: now + 120000
        };
        if (state.needsSave) {
          result.calls = [{ name: 'dungeonSaveProgress', args: {} }];
        }
        return result;
      }

      // 6. Walking animation completed!
      if (state.phase === 'walking-animation') {
        // If a saveProgress reply arrived while walking, verify it
        const saveReply = replies.find(({ call }) => call.name === 'dungeonSaveProgress');
        if (saveReply && (saveReply.result?.error || saveReply.result?.response?.error)) {
          const errorReason = saveReply.result?.response?.error || saveReply.result?.error || 'dungeonSaveProgress failed.';
          return { state: stop(state, String(errorReason)) };
        }
        // Advance to next floor
        return next(state, cache, now);
      }
    }

    // ==========================================
    // LEGACY RPC MODE PHASES
    // ==========================================
    if (state.phase === 'starting-battle') {
      const startReply = replies.find(({ call }) => call.name === 'dungeonStartBattle');
      if (!startReply) return { state };
      const startRes = startReply.result?.response;
      if (startReply.result?.error || startRes == null || startRes.error) {
        const errorReason = startRes?.error || startReply.result?.error || 'dungeonStartBattle failed. Queue stopped.';
        return { state: stop(state, String(errorReason)) };
      }
      const endCall = makeEndBattleCall(
        startRes,
        state.currentHeroes,
        startRes?.seed
      );
      return issue(state, 'ending-battle', endCall, now);
    }

    if (state.phase === 'ending-battle') {
      const endReply = replies.find(({ call }) => call.name === 'dungeonEndBattle');
      if (!endReply) return { state };
      const endRes = endReply.result?.response;
      if (endReply.result?.error || endRes == null || endRes.error || endReply.call?.args?.result?.win !== true) {
        const errorReason = endRes?.error || endReply.result?.error || 'Dungeon battle was lost or rejected.';
        return { state: stop(state, String(errorReason)) };
      }

      // Check for casualties in this battle
      const casualties = checkCasualtiesInBattle(
        endReply.call?.args,
        endRes,
        state.currentHeroes || []
      );

      if (casualties.length > 0) {
        const meta = globalThis.hwaHelperTitanMetadata || {};
        const fallenNames = casualties.map((id) => meta[id]?.name || `Titan #${id}`).join(', ');
        return {
          state: stop(
            state,
            `Titan casualty (${fallenNames}) at floor ${state.floorNumber}. Halting dungeon automation. Press Auto Attack to start next round.`,
            { fallen: casualties, floor: state.floorNumber }
          )
        };
      }

      state.battlesCleared = (state.battlesCleared || 0) + 1;

      // Check if checkpoint save progress is needed
      const rep = endRes;
      const nextFloor = rep?.dungeon?.floorNumber;
      const respawn = rep?.dungeon?.respawnFloor;
      if (nextFloor && respawn && (nextFloor - 1 === respawn)) {
        return issue(state, 'saving-progress', { name: 'dungeonSaveProgress', args: {} }, now);
      }

      return next(state, cache, now);
    }

    if (state.phase === 'saving-progress') {
      const saveReply = replies.find(({ call }) => call.name === 'dungeonSaveProgress');
      if (!saveReply) return { state };
      const saveRes = saveReply.result?.response;
      if (saveReply.result?.error || saveRes?.error) {
        const errorReason = saveRes?.error || saveReply.result?.error || 'dungeonSaveProgress failed.';
        return { state: stop(state, String(errorReason)) };
      }
      return next(state, cache, now);
    }

    return next(state, cache, now);
  }

  const dungeonRunner = {
    start,
    advance,
    stop,
    terminal,
    checkCasualtiesInBattle,
    makeEndBattleCall,
    getGateCoordinates
  };

  globalThis.hwaHelperDungeonRunner = dungeonRunner;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dungeonRunner;
  }
})();
