(() => {
  const DEFAULT_DOOR_PRIORITY = ['prime', 'water', 'mixed', 'neutral', 'earth', 'fire'];
  const DEFAULT_ATTACKER_PRIORITY = ['water', 'mixed', 'neutral', 'earth', 'fire'];

  const DEFAULT_TITAN_POOLS = {
    water: [4000, 4001, 4052, 4004, 4002, 4003],
    earth: [4020, 4022, 4024, 4023, 4021],
    fire: [4010, 4011, 4013, 4012, 4014, 4051],
    neutral: [4000, 4001, 4052, 4004, 4002, 4020, 4023, 4013, 4022, 4021, 4010, 4011, 4012, 4053],
    mixed: [4000, 4001, 4052, 4004, 4002, 4020, 4023, 4013, 4022, 4021, 4010, 4011, 4012, 4053]
  };

  const FALLBACK_LINEUPS = {
    water: [4000, 4001, 4052, 4004, 4002],
    earth: [4020, 4022, 4024, 4023, 4021],
    fire: [4010, 4011, 4013, 4012],
    neutral: [4000, 4001, 4004, 4002, 4053],
    mixed: [4000, 4001, 4004, 4002, 4053]
  };

  function isTitanAlive(titanState) {
    if (!titanState) return true;
    if (titanState.isDead === true) return false;
    if (typeof titanState.hp === 'number' && titanState.hp <= 0) return false;
    return true;
  }

  function getPoolForType(type, cache, customPools = {}) {
    const raw = String(type || '').toLowerCase().trim();
    const norm = (raw === 'mixed') ? 'neutral' : raw;

    if (Array.isArray(customPools?.[raw]) && customPools[raw].length > 0) {
      return customPools[raw].map(Number);
    }
    if (Array.isArray(customPools?.[norm]) && customPools[norm].length > 0) {
      return customPools[norm].map(Number);
    }

    const savedTeams = cache?.teamGetAll?.data || {};
    const teamKey = `dungeon_${norm}`;
    if (Array.isArray(savedTeams[teamKey]) && savedTeams[teamKey].length > 0) {
      return savedTeams[teamKey].map(Number);
    }
    const rawTeamKey = `dungeon_${raw}`;
    if (Array.isArray(savedTeams[rawTeamKey]) && savedTeams[rawTeamKey].length > 0) {
      return savedTeams[rawTeamKey].map(Number);
    }

    if (DEFAULT_TITAN_POOLS[norm]) {
      return [...DEFAULT_TITAN_POOLS[norm]];
    }

    const meta = globalThis.hwaHelperTitanMetadata || {};
    const elemental = Object.entries(meta)
      .filter(([_, data]) => data?.element?.toLowerCase() === norm)
      .map(([id]) => Number(id));
    return elemental.length ? elemental : [...DEFAULT_TITAN_POOLS.neutral];
  }

  function pickLineupFromPool(type, titanStates = {}, cache = null, options = {}) {
    const pool = getPoolForType(type, cache, options.pools || options.lineups);
    const deadTitans = [];
    const aliveTitans = [];

    for (const id of pool) {
      const st = titanStates?.[String(id)] || titanStates?.[Number(id)];
      if (!isTitanAlive(st)) {
        deadTitans.push(Number(id));
      } else {
        aliveTitans.push(Number(id));
      }
    }

    const selectedHeroes = aliveTitans.slice(0, 5);

    return {
      pool,
      selectedHeroes,
      aliveTitans,
      deadTitans,
      deadCount: deadTitans.length,
      aliveCount: aliveTitans.length,
      canAttack: selectedHeroes.length > 0,
      isIntact: deadTitans.length === 0
    };
  }

  function getLineupForDoor(door, cache, customLineups = {}) {
    const type = String(door?.attackerType || '').toLowerCase();
    const titanStates = cache?.dungeonStatus?.data?.states?.titans || {};
    const lineupInfo = pickLineupFromPool(type, titanStates, cache, { lineups: customLineups });
    if (lineupInfo.selectedHeroes.length > 0) {
      return lineupInfo.selectedHeroes;
    }
    if (FALLBACK_LINEUPS[type]) {
      return [...FALLBACK_LINEUPS[type]];
    }
    return [4000, 4001, 4004, 4002, 4053];
  }

  function checkLineupIntactness(heroes, titanStates = {}) {
    const list = Array.isArray(heroes) ? heroes.map(Number) : [];
    if (!list.length) {
      return {
        isIntact: false,
        casualties: true,
        aliveCount: 0,
        totalCount: 0,
        deadTitans: [],
        aliveTitans: []
      };
    }
    const deadTitans = [];
    const aliveTitans = [];
    for (const id of list) {
      const st = titanStates?.[String(id)] || titanStates?.[Number(id)];
      if (!isTitanAlive(st)) {
        deadTitans.push(id);
      } else {
        aliveTitans.push(id);
      }
    }
    const isIntact = deadTitans.length === 0;
    return {
      isIntact,
      casualties: !isIntact,
      aliveCount: aliveTitans.length,
      totalCount: list.length,
      deadTitans,
      aliveTitans
    };
  }

  function evaluateDoor(door, teamNum, cache, options = {}) {
    const primeElement = (cache?.dungeonStatus?.data?.elements?.prime || '').toLowerCase();
    const attackerType = String(door?.attackerType || '').toLowerCase();
    const titanStates = cache?.dungeonStatus?.data?.states?.titans || {};
    const lineupInfo = pickLineupFromPool(attackerType, titanStates, cache, options);
    const heroes = lineupInfo.selectedHeroes;
    const isPrime = Boolean(primeElement && attackerType === primeElement);

    const priorityList = Array.isArray(options.doorPriority) && options.doorPriority.length > 0
      ? options.doorPriority
      : (Array.isArray(options.attackerPriority) && options.attackerPriority.length > 0
        ? options.attackerPriority
        : DEFAULT_DOOR_PRIORITY);

    let priorityRank = 999;
    if (isPrime && priorityList.includes('prime')) {
      priorityRank = priorityList.indexOf('prime');
    } else {
      const normType = (attackerType === 'mixed') ? 'neutral' : attackerType;
      const matchIdx = priorityList.findIndex((p) => {
        const normP = (p === 'mixed') ? 'neutral' : p;
        return normP === normType;
      });
      if (matchIdx !== -1) {
        priorityRank = matchIdx;
      } else if (priorityList.includes(attackerType)) {
        priorityRank = priorityList.indexOf(attackerType);
      }
    }

    const intactness = {
      isIntact: lineupInfo.isIntact,
      casualties: !lineupInfo.isIntact,
      aliveCount: lineupInfo.aliveCount,
      totalCount: lineupInfo.pool.length,
      deadTitans: lineupInfo.deadTitans,
      aliveTitans: lineupInfo.aliveTitans
    };

    const canAttack = options.requireIntactLineup
      ? lineupInfo.isIntact
      : (heroes.length > 0);

    return {
      teamNum: Number(teamNum) || 0,
      door,
      attackerType,
      defenderType: door?.defenderType || 'unknown',
      enemyPower: Number(door?.power) || 0,
      heroes,
      pool: lineupInfo.pool,
      deadCount: lineupInfo.deadCount,
      aliveCount: lineupInfo.aliveCount,
      isPrime,
      intactness,
      canAttack,
      priorityRank,
      disqualificationReason: canAttack
        ? null
        : (heroes.length === 0
          ? 'No alive titans remaining in pool for this element.'
          : `Lineup has fallen titan(s): ${lineupInfo.deadTitans.join(', ')}`)
    };
  }

  function selectBestDoor(doors, cache, options = {}) {
    const list = Array.isArray(doors) ? doors : [];
    if (!list.length) {
      return {
        chosen: null,
        canAttack: false,
        reason: 'No dungeon doors available for current floor.',
        evaluations: []
      };
    }

    const evaluations = list.map((door, idx) => evaluateDoor(door, idx, cache, options));
    const viable = evaluations.filter((e) => e.canAttack);

    if (!viable.length) {
      return {
        chosen: null,
        canAttack: false,
        reason: options.requireIntactLineup
          ? 'All available doors require lineups with casualties. Halting dungeon automation.'
          : 'All available doors have no viable alive titans remaining.',
        evaluations
      };
    }

    viable.sort((a, b) => {
      // 1. Sort by fewest dead titans in pool (e.g. 0 deaths before 1 death)
      if (a.deadCount !== b.deadCount) return a.deadCount - b.deadCount;
      // 2. Sort by attacker element priority
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      // 3. Sort by enemy power (lower power first)
      if (a.enemyPower !== b.enemyPower) return a.enemyPower - b.enemyPower;
      // 4. Sort by door index
      return a.teamNum - b.teamNum;
    });

    const best = viable[0];
    const statusNote = best.deadCount === 0
      ? 'intact lineup'
      : `${best.deadCount} fallen titan(s) in pool, ${best.heroes.length} alive deployed`;
    return {
      chosen: best,
      canAttack: true,
      reason: `Selected door ${best.teamNum + 1} (${best.attackerType}) with ${statusNote}.`,
      evaluations
    };
  }

  function planDungeon(cache, options = {}) {
    const dungeonData = cache?.dungeonStatus?.data;
    if (!dungeonData) {
      return { kind: 'need-snapshot', reason: 'Dungeon status cache is missing.' };
    }
    if (dungeonData.activeBattle) {
      const startTime = Number(dungeonData.activeBattle.startTime) || Date.parse(dungeonData.activeBattle.startTime) || 0;
      const isStale = startTime > 0 && (Date.now() - startTime > 120000);
      if (!isStale) {
        return {
          kind: 'busy',
          reason: `Battle currently in progress on door ${Number(dungeonData.activeBattle.teamNum ?? 0) + 1}.`,
          activeBattle: dungeonData.activeBattle
        };
      }
    }
    const doors = dungeonData.currentFloorDoors;
    if (!Array.isArray(doors) || !doors.length) {
      return { kind: 'need-snapshot', reason: 'Waiting for floor doors to be loaded.' };
    }
    const selection = selectBestDoor(doors, cache, options);
    if (!selection.canAttack) {
      return {
        kind: 'stop',
        reason: selection.reason,
        evaluations: selection.evaluations
      };
    }
    return {
      kind: 'battle',
      teamNum: selection.chosen.teamNum,
      heroes: selection.chosen.heroes,
      attackerType: selection.chosen.attackerType,
      door: selection.chosen.door,
      floorNumber: dungeonData.floorNumber,
      call: {
        name: 'dungeonStartBattle',
        args: {
          teamNum: selection.chosen.teamNum,
          heroes: selection.chosen.heroes
        }
      },
      selection
    };
  }

  function resetTitanStates(cache) {
    if (cache?.dungeonStatus?.data?.states) {
      cache.dungeonStatus.data.states.titans = {};
    }
    return cache;
  }

  const dungeonAutomation = {
    DEFAULT_DOOR_PRIORITY,
    DEFAULT_ATTACKER_PRIORITY,
    DEFAULT_TITAN_POOLS,
    FALLBACK_LINEUPS,
    isTitanAlive,
    getPoolForType,
    pickLineupFromPool,
    getLineupForDoor,
    checkLineupIntactness,
    evaluateDoor,
    selectBestDoor,
    planDungeon,
    resetTitanStates
  };

  globalThis.hwaHelperDungeonAutomation = dungeonAutomation;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dungeonAutomation;
  }
})();
