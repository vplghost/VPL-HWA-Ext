(() => {
  const planner = globalThis.hwaHelperDungeonAutomation;
  const terminal = (state) => !state || ['complete', 'stopped'].includes(state.phase);
  const stop = (state, reason, casualty = null) => ({
    ...state,
    phase: 'stopped',
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
            attackers: { heroes: heroMap, input: [] },
            defenders: { heroes: {}, input: [] },
            duration: 15.0,
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

  function next(state, cache, now) {
    const decision = planner.planDungeon(cache, state.options || {});
    if (decision.kind === 'complete') {
      return { state: { ...state, phase: 'complete', wakeAt: null } };
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

    return issue(state, 'starting-battle', decision.call, now);
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
      return { state: stop(state, 'Dungeon battle RPC timed out.') };
    }
    if (!record || Date.parse(record.timestamp) < state.sentAt) return { state };

    const replies = responses(record);

    if (state.phase === 'starting-battle') {
      const startReply = replies.find(({ call }) => call.name === 'dungeonStartBattle');
      if (!startReply) return { state };
      if (startReply.result?.error || startReply.result?.response == null) {
        return { state: stop(state, 'dungeonStartBattle failed. Queue stopped.') };
      }
      const endCall = makeEndBattleCall(
        startReply.result?.response,
        state.currentHeroes,
        startReply.result?.response?.seed
      );
      return issue(state, 'ending-battle', endCall, now);
    }

    if (state.phase === 'ending-battle') {
      const endReply = replies.find(({ call }) => call.name === 'dungeonEndBattle');
      if (!endReply) return { state };
      if (endReply.result?.error || endReply.call?.args?.result?.win !== true) {
        return { state: stop(state, 'Dungeon battle was lost or rejected.') };
      }

      // Check for casualties in this battle
      const casualties = checkCasualtiesInBattle(
        endReply.call?.args,
        endReply.result?.response,
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
      const rep = endReply.result?.response;
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
    makeEndBattleCall
  };

  globalThis.hwaHelperDungeonRunner = dungeonRunner;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dungeonRunner;
  }
})();
