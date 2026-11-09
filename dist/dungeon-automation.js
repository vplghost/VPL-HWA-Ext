(() => {
  const DEFAULT_DOOR_PRIORITY = ['prime', 'water', 'earth', 'neutral', 'fire'];

  const FALLBACK_LINEUPS = {
    water: [4000, 4001, 4052, 4004, 4002],
    earth: [4020, 4022, 4024, 4023, 4021],
    fire: [4010, 4011, 4013, 4012],
    neutral: [4000, 4001, 4004, 4002, 4053]
  };

  function isTitanAlive(titanState) {
    if (!titanState) return true;
    if (titanState.isDead === true) return false;
    if (typeof titanState.hp === 'number' && titanState.hp <= 0) return false;
    return true;
  }

  function getLineupForDoor(door, cache, customLineups = {}) {
    const type = String(door?.attackerType || '').toLowerCase();
    if (Array.isArray(customLineups?.[type]) && customLineups[type].length > 0) {
      return customLineups[type].map(Number);
    }
    const savedTeams = cache?.teamGetAll?.data || {};
    const teamKey = `dungeon_${type}`;
    if (Array.isArray(savedTeams[teamKey]) && savedTeams[teamKey].length > 0) {
      return savedTeams[teamKey].map(Number);
    }
    if (FALLBACK_LINEUPS[type]) {
      return [...FALLBACK_LINEUPS[type]];
    }
    const meta = globalThis.hwaHelperTitanMetadata || {};
    const elemental = Object.entries(meta)
      .filter(([_, data]) => data?.element?.toLowerCase() === type)
      .map(([id]) => Number(id));
    return elemental.length ? elemental.slice(0, 5) : [4000, 4001, 4004, 4002, 4053];
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
    const heroes = getLineupForDoor(door, cache, options.lineups);
    const titanStates = cache?.dungeonStatus?.data?.states?.titans || {};
    const intactness = checkLineupIntactness(heroes, titanStates);
    const isPrime = Boolean(primeElement && attackerType === primeElement);

    const priorityList = Array.isArray(options.doorPriority) && options.doorPriority.length > 0
      ? options.doorPriority
      : DEFAULT_DOOR_PRIORITY;

    let priorityRank = 999;
    if (isPrime && priorityList.includes('prime')) {
      priorityRank = priorityList.indexOf('prime');
    } else if (priorityList.includes(attackerType)) {
      priorityRank = priorityList.indexOf(attackerType);
    }

    return {
      teamNum: Number(teamNum) || 0,
      door,
      attackerType,
      defenderType: door?.defenderType || 'unknown',
      enemyPower: Number(door?.power) || 0,
      heroes,
      isPrime,
      intactness,
      canAttack: intactness.isIntact,
      priorityRank,
      disqualificationReason: intactness.isIntact
        ? null
        : `Lineup has fallen titan(s): ${intactness.deadTitans.join(', ')}`
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
        reason: 'All available doors require lineups with casualties. Halting dungeon automation.',
        evaluations
      };
    }

    viable.sort((a, b) => {
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      if (a.enemyPower !== b.enemyPower) return a.enemyPower - b.enemyPower;
      return a.teamNum - b.teamNum;
    });

    const best = viable[0];
    return {
      chosen: best,
      canAttack: true,
      reason: `Selected door ${best.teamNum + 1} (${best.attackerType}) with intact lineup.`,
      evaluations
    };
  }

  function planDungeon(cache, options = {}) {
    const dungeonData = cache?.dungeonStatus?.data;
    if (!dungeonData) {
      return { kind: 'need-snapshot', reason: 'Dungeon status cache is missing.' };
    }
    if (dungeonData.activeBattle) {
      return {
        kind: 'busy',
        reason: `Battle currently in progress on door ${dungeonData.activeBattle.teamNum + 1}.`,
        activeBattle: dungeonData.activeBattle
      };
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

  const dungeonAutomation = {
    DEFAULT_DOOR_PRIORITY,
    FALLBACK_LINEUPS,
    isTitanAlive,
    getLineupForDoor,
    checkLineupIntactness,
    evaluateDoor,
    selectBestDoor,
    planDungeon
  };

  globalThis.hwaHelperDungeonAutomation = dungeonAutomation;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dungeonAutomation;
  }
})();
