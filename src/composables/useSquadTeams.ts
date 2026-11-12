import { ref, computed } from 'vue';
import { useRpcCache } from '@/src/composables/useRpcCache';
import { getHeroMetadata, starGlowClass } from '@/src/utils/metadata';
import { formatNumber } from '@/src/utils/formatters';
import { normalizeArray } from '@/src/utils/troops';
import {
  availableHeroIds as getAvailableHeroIds,
  teamOptions as getTeamOptions,
  capacityModel as getCapacityModel,
  teamTroopCapacity as getTeamTroopCapacity,
  allocateTroops as getAllocateTroops,
  unitInfo as getUnitInfoData,
} from '@/src/utils/experimentalData';

export interface SquadTeamOption {
  id: string;
  label: string;
  heroIds: number[];
  maxTroops?: number;
}

export interface TroopSummaryBlock {
  type: number;
  label: string;
  total: number;
  tiersText: string;
}

export function useSquadTeams(
  preferenceStorageKey: 'raidPreferences' | 'monsterPreferences',
  teamFieldKey: 'rallyTeam' | 'teamId'
) {
  const { cache, dispatchRpc } = useRpcCache();

  const customTeams = ref<Array<{ id: string; name: string; heroIds: number[]; maxTroops?: number }>>([]);
  const selectedTeamId = ref<string>('');
  const isRefreshingTroops = ref<boolean>(false);

  const accountId = computed(() => cache.value.accountStatus?.data?.id);
  const heroesData = computed(() => cache.value.heroGetAll?.data || {});
  const unitSummaryData = computed(() => cache.value['getUnitSummary:unit']?.data || cache.value.inventoryGet?.data?.unit || {});
  const marchData = computed(() => normalizeArray(cache.value.marchStatus?.data?.marches));

  const mapContext = computed(() => {
    const rallyAction = cache.value.rallyAction?.data;
    const rallyContext = rallyAction?.mapId
      ? {
          mapId: rallyAction.mapId,
          center: rallyAction.leaderCoordinates || rallyAction.center,
          outposts: rallyAction.leader?.userId && rallyAction.leaderCoordinates
            ? { [rallyAction.leader.userId]: rallyAction.leaderCoordinates }
            : {},
        }
      : {};

    return {
      ...rallyContext,
      ...(cache.value.experimentalMineSearch?.data || {}),
      ...(cache.value.experimentalRallySearch?.data || {}),
      ...(cache.value.experimentalMapContext?.data || {}),
    };
  });

  const mapCenter = computed(() => {
    const ctx = mapContext.value;
    const accId = accountId.value;
    return (accId && ctx.outposts ? ctx.outposts[accId] : null) || ctx.center || null;
  });

  async function loadSquadData() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['customTeams', preferenceStorageKey]);
        const accounts = stored.customTeams || {};
        if (accountId.value) {
          customTeams.value = normalizeArray(accounts[String(accountId.value)]);
        } else {
          const firstKey = Object.keys(accounts)[0];
          customTeams.value = firstKey ? normalizeArray(accounts[firstKey]) : [];
        }

        const prefs = stored[preferenceStorageKey];
        if (prefs && prefs[teamFieldKey]) {
          selectedTeamId.value = String(prefs[teamFieldKey]);
        }
      } catch (_) {}
    }
  }

  // Available hero IDs not committed in active non-returned marches
  const availableHeroIds = computed<number[]>(() => {
    return getAvailableHeroIds(heroesData.value, unitSummaryData.value, marchData.value);
  });

  // Teams options
  const teams = computed<SquadTeamOption[]>(() => {
    const opts = getTeamOptions(
      cache.value.teamGetAll?.data,
      heroesData.value,
      customTeams.value,
      availableHeroIds.value
    );
    if (Array.isArray(opts) && opts.length > 0) {
      return opts;
    }

    // Pure fallback implementation
    const list: SquadTeamOption[] = [];

    // Custom teams
    normalizeArray(customTeams.value).forEach((team) => {
      const validHeroIds = normalizeArray(team?.heroIds).filter((id) => heroesData.value[String(id)]);
      if (validHeroIds.length > 0) {
        list.push({
          id: `custom:${team.id}`,
          label: `Custom · ${team.name}`,
          heroIds: validHeroIds.slice(0, 5),
          maxTroops: team.maxTroops,
        });
      }
    });

    // 5 Lowest power heroes
    const sortedAvailable = [...normalizeArray(availableHeroIds.value)]
      .filter((id) => heroesData.value[String(id)])
      .sort((a, b) => {
        const pa = Number(heroesData.value[String(a)]?.power) || 0;
        const pb = Number(heroesData.value[String(b)]?.power) || 0;
        return pa - pb;
      });
    if (sortedAvailable.length >= 5) {
      list.push({
        id: 'weakest',
        label: '5 lowest power heroes',
        heroIds: sortedAvailable.slice(0, 5),
      });
    }

    // Server-saved teams
    const serverTeamsData = cache.value.teamGetAll?.data || {};
    for (const [mode, members] of Object.entries(serverTeamsData)) {
      if (!members) continue;
      const groups: any[] = Array.isArray(members)
        ? (members.some(Array.isArray) ? members : [members])
        : typeof members === 'object'
        ? Object.values(members)
        : [];

      groups.forEach((group: any, idx: number) => {
        let ids: number[] = [];
        if (Array.isArray(group)) {
          ids = group.map(Number).filter((n) => Number.isInteger(n) && heroesData.value[String(n)]);
        }
        if (ids.length > 0) {
          list.push({
            id: `${mode}:${idx}`,
            label: `${mode}${groups.length > 1 ? ` #${idx + 1}` : ''}`,
            heroIds: ids.slice(0, 5),
          });
        }
      });
    }

    return list;
  });

  // Selected team object
  const selectedTeam = computed<SquadTeamOption | null>(() => {
    if (!teams.value.length) return null;
    const matched = teams.value.find((t) => t.id === selectedTeamId.value);
    if (matched) return matched;
    // Default to first 5-hero team or first team
    const fiveMan = teams.value.find((t) => t.heroIds.length === 5);
    return fiveMan || teams.value[0] || null;
  });

  // Calculate troop capacity
  const squadCapacity = computed<number>(() => {
    const team = selectedTeam.value;
    if (!team) return 0;
    const model = getCapacityModel(
      team.heroIds,
      heroesData.value,
      cache.value.troopCapacityEvidence?.data,
      undefined,
      accountId.value
    );
    return getTeamTroopCapacity(model?.total ?? 0, team.maxTroops);
  });

  // Unit allocation
  const allocatedTroops = computed<Array<{ unitId: number; count: number }>>(() => {
    const cap = squadCapacity.value;
    if (!cap || cap <= 0) return [];
    return getAllocateTroops(unitSummaryData.value, cap) || [];
  });

  const totalAllocatedTroops = computed<number>(() => {
    return allocatedTroops.value.reduce((sum, u) => sum + (Number(u.count) || 0), 0);
  });

  // Helper for unit info
  function getUnitInfo(unitId: number): { type: number; level: number; label: string } {
    const info = getUnitInfoData(unitId);
    if (info) return info;
    const level = unitId % 10;
    const type = Math.floor(unitId / 10);
    const labels = ['Marksmen', 'Spearmen', 'Infantry'];
    return {
      type: type >= 0 && type <= 2 ? type : 0,
      level: level >= 1 && level <= 9 ? level : 1,
      label: labels[type] || `Type ${type}`,
    };
  }

  // 3 Troop summary cards: Marksmen (type 0), Spearmen (type 1), Infantry (type 2)
  const troopTypeSummaries = computed<TroopSummaryBlock[]>(() => {
    const results: TroopSummaryBlock[] = [];
    const labels = ['Marksmen', 'Spearmen', 'Infantry'];

    for (let type = 0; type < 3; type++) {
      const typeUnits = allocatedTroops.value.filter((u) => {
        const info = getUnitInfo(u.unitId);
        return info.type === type;
      });
      const total = typeUnits.reduce((sum, u) => sum + (Number(u.count) || 0), 0);
      const tiersText = typeUnits.length > 0
        ? typeUnits.map((u) => `Lv${getUnitInfo(u.unitId).level}: ${formatNumber(u.count)}`).join(' · ')
        : '0';

      results.push({
        type,
        label: labels[type] || `Type ${type}`,
        total,
        tiersText,
      });
    }

    return results;
  });

  async function refreshTroops() {
    isRefreshingTroops.value = true;
    try {
      await dispatchRpc([
        { name: 'heroGetAll' },
        { name: 'getUnitSummary', feature: 'unit' },
      ]);
    } finally {
      isRefreshingTroops.value = false;
    }
  }

  async function handleTeamChange(newTeamId: string) {
    selectedTeamId.value = newTeamId;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(preferenceStorageKey);
        const prefs = stored[preferenceStorageKey] || {};
        prefs[teamFieldKey] = newTeamId;
        await chrome.storage.local.set({ [preferenceStorageKey]: prefs });
      } catch (_) {}
    }
  }

  function getHeroSnapshot(heroId: number | string) {
    return heroesData.value[String(heroId)] || null;
  }

  function getHeroName(heroId: number | string): string {
    const meta = getHeroMetadata(heroId);
    return meta?.name || (globalThis as any).hwaHelperNameMap?.hero?.(heroId) || `Hero #${heroId}`;
  }

  function getHeroAvatarUrl(heroId: number | string): string {
    const meta = getHeroMetadata(heroId);
    const file = meta?.avatarFile || (meta?.hasAvatar ? `assets/heroes/${heroId}.webp` : null);
    if (!file) return '';
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(file);
    }
    return file;
  }

  function getHeroGlow(heroId: number | string): string {
    const snap = getHeroSnapshot(heroId);
    const star = Number(snap?.star) || 1;
    return starGlowClass(star);
  }

  return {
    customTeams,
    selectedTeamId,
    selectedTeam,
    teams,
    squadCapacity,
    allocatedTroops,
    totalAllocatedTroops,
    troopTypeSummaries,
    isRefreshingTroops,
    mapContext,
    mapCenter,
    loadSquadData,
    refreshTroops,
    handleTeamChange,
    getHeroSnapshot,
    getHeroName,
    getHeroAvatarUrl,
    getHeroGlow,
  };
}
