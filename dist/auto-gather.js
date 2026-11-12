(() => {
  const BASIC_MINE_TYPES = ['food', 'wood', 'stone', 'iron'];

  function safeList(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return Object.values(raw);
    return [];
  }

  function normalizeAutoGatherSettings(settings) {
    const raw = settings && typeof settings === 'object' ? settings : {};
    const maxMarches = Number.isInteger(raw.maxMarches) && raw.maxMarches >= 1 && raw.maxMarches <= 10
      ? raw.maxMarches
      : 3;
    const mineLevel = Number.isInteger(raw.mineLevel) && raw.mineLevel >= 1 && raw.mineLevel <= 10
      ? raw.mineLevel
      : 5;
    const mineType = typeof raw.mineType === 'string' && (raw.mineType === 'rotate' || BASIC_MINE_TYPES.includes(raw.mineType))
      ? raw.mineType
      : 'rotate';
    const lastAutoMineType = typeof raw.lastAutoMineType === 'string' && BASIC_MINE_TYPES.includes(raw.lastAutoMineType)
      ? raw.lastAutoMineType
      : null;

    return {
      enabled: raw.enabled === true,
      maxMarches,
      mineLevel,
      mineType,
      lastAutoMineType
    };
  }

  function resolveNextMineType(mineTypeSetting, lastAutoMineType) {
    if (BASIC_MINE_TYPES.includes(mineTypeSetting)) {
      return mineTypeSetting;
    }
    // Default to 'rotate'
    if (lastAutoMineType && BASIC_MINE_TYPES.includes(lastAutoMineType)) {
      const idx = BASIC_MINE_TYPES.indexOf(lastAutoMineType);
      return BASIC_MINE_TYPES[(idx + 1) % BASIC_MINE_TYPES.length];
    }
    return BASIC_MINE_TYPES[0]; // 'food'
  }

  function countActiveMarches(marches, now = Date.now()) {
    const list = safeList(marches);
    return list.filter((m) => {
      if (m.stage === 'returnToOutpost' || m.kind === 'return') {
        if (Number.isFinite(m.endsAt) && now >= m.endsAt) return false;
      }
      return true;
    }).length;
  }

  function isGameLoadRecord(record) {
    if (!record) return false;
    const calls = record.requestBody ? parseCalls(record.requestBody) : [];
    if (calls.some((c) => ['userGetInfo', 'mobileLogin', 'getLeaderboardPowerSummary', 'getUnitSummary', 'getMarches'].includes(c.name))) {
      return true;
    }
    if (typeof record.requestBody === 'string' &&
        (record.requestBody.includes('"userGetInfo"') ||
         record.requestBody.includes('"mobileLogin"') ||
         record.requestBody.includes('"getMarches"'))) {
      return true;
    }
    return false;
  }

  function isMarchReturnRecord(record, prevCache, currentCache, now = Date.now()) {
    if (!record) return false;
    if (record.transport === 'websocket' && record.direction === 'received' && record.encoding === 'utf8') {
      try {
        const payload = JSON.parse(record.payload)?.result;
        if (payload?.type === 'returnToOutpostFromMob' ||
            payload?.type === 'returnToOutpostFromMine' ||
            payload?.type === 'rallyCompleted' ||
            payload?.type === 'marchCompleted') {
          return true;
        }
      } catch (_) {}
    }
    const prevMarches = countActiveMarches(prevCache?.marchStatus?.data?.marches, now);
    const curMarches = countActiveMarches(currentCache?.marchStatus?.data?.marches, now);
    if (prevMarches > 0 && curMarches < prevMarches) {
      return true;
    }
    const prevReturning = safeList(prevCache?.marchStatus?.data?.marches).some(
      (m) => (m.stage === 'returnToOutpost' || m.kind === 'return') && (!m.endsAt || now >= m.endsAt)
    );
    if (prevReturning) return true;

    return false;
  }

  function parseCalls(body) {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      return Array.isArray(parsed?.calls) ? parsed.calls : [];
    } catch {
      return [];
    }
  }

  function planAutoGather(cache, stored, now = Date.now()) {
    if (stored?.popupRpcEnabled !== true) {
      return { action: 'idle', reason: 'Popup RPC disabled' };
    }
    const settings = normalizeAutoGatherSettings(stored?.autoGatherSettings);
    if (!settings.enabled) {
      return { action: 'idle', reason: 'Auto-gather disabled' };
    }

    const marches = safeList(cache?.marchStatus?.data?.marches);
    const activeCount = countActiveMarches(marches, now);
    if (activeCount >= settings.maxMarches) {
      return {
        action: 'wait',
        reason: `Current marches limit reached (${activeCount}/${settings.maxMarches})`,
        activeCount,
        maxMarches: settings.maxMarches
      };
    }

    const context = {
      ...cache?.experimentalMineSearch?.data,
      ...cache?.experimentalRallySearch?.data,
      ...cache?.experimentalMapContext?.data
    };
    const mapId = context.mapId;
    const center = context.center || context.outposts?.[cache?.accountStatus?.data?.id];
    if (!mapId || !Number.isFinite(center?.x) || !Number.isFinite(center?.y)) {
      return { action: 'wait', reason: 'Map ID or center coordinates unavailable' };
    }

    const data = globalThis.hwaHelperExperimentalData;
    if (!data) return { action: 'wait', reason: 'Experimental data helper unavailable' };

    const heroes = cache?.heroGetAll?.data || {};
    const summary = cache?.['getUnitSummary:unit']?.data;
    if (!summary) return { action: 'wait', reason: 'Unit summary unavailable' };

    const availableHeroIds = data.availableHeroIds(heroes, summary, marches);
    if (availableHeroIds.length < 5) {
      return { action: 'wait', reason: `Fewer than 5 heroes available (${availableHeroIds.length})` };
    }

    const targetMineType = resolveNextMineType(settings.mineType, settings.lastAutoMineType);
    const targetMineLevel = settings.mineLevel;
    const configId = data.mineConfigId(targetMineType, targetMineLevel);
    if (!configId) return { action: 'wait', reason: 'Invalid mine configuration' };

    // Check if matching mine search results exist with full mines
    const mineSearch = cache?.experimentalMineSearch?.data;
    const activeMineIds = new Set(
      marches
        .map((m) => m?.mineId || m?.target?.objectId || m?.targetId)
        .filter(Boolean)
    );
    const matchingMines = (mineSearch?.mineConfigId === configId)
      ? safeList(mineSearch?.mines).filter((m) => m?.mineId && !activeMineIds.has(m.mineId))
      : [];

    if (matchingMines.length > 0) {
      const selectedMine = matchingMines[0];
      const heroIds = data.lowestPowerHeroes(heroes, availableHeroIds);
      if (heroIds.length !== 5) {
        return { action: 'wait', reason: 'Could not select 5 lowest power heroes' };
      }

      const myId = stored?.rpcCache?.accountStatus?.data?.id ?? stored?.rpcCache?.userGetInfo?.data?.id;
      const capacity = data.capacityModel(
        heroIds, heroes, cache?.troopCapacityEvidence?.data,
        data.normalizeCapacitySettings(stored?.troopCapacitySettings), myId
      ).total;
      const availSummary = Array.isArray(summary?.available) ? summary : { available: safeList(summary?.units) };
      const troops = data.allocateTroops(availSummary, capacity);
      const squad = data.buildSquad(heroIds, troops);
      if (!squad) return { action: 'wait', reason: 'Could not allocate squad troops' };

      const gatherCall = data.buildGatherCall(mapId, selectedMine.mineId, squad);
      if (!gatherCall) return { action: 'wait', reason: 'Failed to build gather call' };

      return {
        action: 'gather',
        mineType: targetMineType,
        mineLevel: targetMineLevel,
        mineId: selectedMine.mineId,
        call: gatherCall,
        nextLastAutoMineType: targetMineType
      };
    }

    // Need to search full mines of targetType and targetLevel
    const searchCall = data.buildMineSearchCall(mapId, center, targetMineType, targetMineLevel);
    if (!searchCall) return { action: 'wait', reason: 'Failed to build mine search call' };

    return {
      action: 'search',
      mineType: targetMineType,
      mineLevel: targetMineLevel,
      call: searchCall
    };
  }

  globalThis.hwaHelperAutoGather = {
    BASIC_MINE_TYPES,
    normalizeAutoGatherSettings,
    resolveNextMineType,
    countActiveMarches,
    isGameLoadRecord,
    isMarchReturnRecord,
    planAutoGather
  };
})();
