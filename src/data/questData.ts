import type { DailyQuestDefinition, DailyQuestItem, LocaleTitleInfo, SpecialQuestEvent, SpecialQuestGroup } from '@/src/types/game/quest';


  // Game configs: specialQuestEventView, quest_daily, specialQuestEvent_chain, specialQuestEvent_type
  const defaultHiddenViewIds = [29, 30, 61, 93, 95, 106, 107, 108, 116, 118, 119, 120, 129, 133];
  const hiddenViewIds: Set<number> = new Set(defaultHiddenViewIds);

  const viewTitles: Record<number | string, string> = {
    8: 'Research Chest LiveOps',
    29: "Wendy's Special Gift",
    30: 'Hero Promotion Milestone',
    65: 'Clan Clash Event',
    67: 'Glory Pass',
    83: 'Arms Race & Military Growth',
    84: 'Ascension Festival',
    94: 'Hero Upgrade Event',
    95: "Hero's Way Milestone Pass",
    99: 'Hero’s Way',
    126: 'Faction Clash I',
    127: 'Faction Clash II',
    128: 'Faction Clash III',
    129: 'Relic Pass',
    133: 'Season Battle Pass',
    134: 'Hero’s Way / Season Quests',
    135: 'Elemental Synergy & Titan Power',
    136: 'Champions’ Season & Guild Growth',
    137: 'Spark of Glory',
    146: 'Extended Battle Pass'
  };

  // BEGIN GENERATED DAILY QUESTS — npm run quests:update
  const dailyTitles: Record<string, string> = {
    "346": "Upgrade 1 building",
    "348": "Train 10 Infantry",
    "349": "Train 10 Spearmen",
    "350": "Train 10 Marksmen",
    "351": "Train 30 Infantry",
    "352": "Train 30 Spearmen",
    "353": "Train 30 Marksmen",
    "354": "Collect 50,000 units of Food on the map",
    "355": "Collect 50,000 units of Wood on the map",
    "356": "Collect 10,000 units of Stone on the map",
    "357": "Collect 3,000 units of Iron on the map",
    "358": "Collect 250,000 units of Food on the map",
    "359": "Collect 250,000 units of Wood on the map",
    "360": "Collect 50,000 units of Stone on the map",
    "361": "Collect 15,000 units of Iron on the map",
    "362": "Clear Brigand Camp 1 time",
    "363": "Clear Brigand Camp 5 times",
    "364": "Clear Brigand Camp 10 times",
    "365": "Gather 1 time resources on the map",
    "366": "Gather 2 times resources on the map",
    "367": "Gather 4 times resources on the map",
    "368": "Defeat Boss 1 time",
    "369": "Defeat Boss 2 times",
    "370": "Defeat Boss 3 times",
    "2413": "Start Research"
  };
  const dailyDefinitions: Record<string, DailyQuestDefinition> = {"346":{"chainId":127,"phase":1,"transferProgress":true,"condition":{"args":{},"name":"buildingCompletedAny","target":1},"translationMethod":"buildingLevelAny","localeKey":"LIB_QUEST_TRANSLATE_BUILDINGLEVELANY","template":"Upgrade %param1% $m(building|buildings|buildings)","label":"[Daily 4X] Upgrade 1 building"},"348":{"chainId":129,"phase":1,"transferProgress":true,"condition":{"args":{"unitType":"front"},"name":"unitsTrained","target":10},"translationMethod":"unitsTrained","localeKey":"LIB_QUEST_TRANSLATE_UNITSTRAINED","template":"Train %param1% %param2%","label":"[Daily 4X] Train 10 Infantry"},"349":{"chainId":130,"phase":1,"transferProgress":true,"condition":{"args":{"unitType":"middle"},"name":"unitsTrained","target":10},"translationMethod":"unitsTrained","localeKey":"LIB_QUEST_TRANSLATE_UNITSTRAINED","template":"Train %param1% %param2%","label":"[Daily 4X] Train 10 Spearmen"},"350":{"chainId":131,"phase":1,"transferProgress":true,"condition":{"args":{"unitType":"back"},"name":"unitsTrained","target":10},"translationMethod":"unitsTrained","localeKey":"LIB_QUEST_TRANSLATE_UNITSTRAINED","template":"Train %param1% %param2%","label":"[Daily 4X] Train 10 Marksmen"},"351":{"chainId":129,"phase":2,"transferProgress":true,"condition":{"args":{"unitType":"front"},"name":"unitsTrained","target":30},"translationMethod":"unitsTrained","localeKey":"LIB_QUEST_TRANSLATE_UNITSTRAINED","template":"Train %param1% %param2%","label":"[Daily 4X] Train 30 Infantry"},"352":{"chainId":130,"phase":2,"transferProgress":true,"condition":{"args":{"unitType":"middle"},"name":"unitsTrained","target":30},"translationMethod":"unitsTrained","localeKey":"LIB_QUEST_TRANSLATE_UNITSTRAINED","template":"Train %param1% %param2%","label":"[Daily 4X] Train 30 Spearmen"},"353":{"chainId":131,"phase":2,"transferProgress":true,"condition":{"args":{"unitType":"back"},"name":"unitsTrained","target":30},"translationMethod":"unitsTrained","localeKey":"LIB_QUEST_TRANSLATE_UNITSTRAINED","template":"Train %param1% %param2%","label":"[Daily 4X] Train 30 Marksmen"},"354":{"chainId":420,"phase":1,"transferProgress":true,"condition":{"args":{"resourceId":5,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":50000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 50,000 Food"},"355":{"chainId":132,"phase":1,"transferProgress":true,"condition":{"args":{"resourceId":4,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":50000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 50,000 Wood"},"356":{"chainId":133,"phase":1,"transferProgress":true,"condition":{"args":{"resourceId":3,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":10000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 10,000 Stone"},"357":{"chainId":134,"phase":1,"transferProgress":true,"condition":{"args":{"resourceId":2,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":3000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 3,000 Iron"},"358":{"chainId":420,"phase":2,"transferProgress":true,"condition":{"args":{"resourceId":5,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":250000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 250,000 Food"},"359":{"chainId":132,"phase":2,"transferProgress":true,"condition":{"args":{"resourceId":4,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":250000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 250,000 Wood"},"360":{"chainId":133,"phase":2,"transferProgress":true,"condition":{"args":{"resourceId":3,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":50000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 50,000 Stone"},"361":{"chainId":134,"phase":2,"transferProgress":true,"condition":{"args":{"resourceId":2,"resourceType":"material"},"name":"globalMapResourceTypeGathered","target":15000},"translationMethod":"globalMapResourceTypeGathered","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCETYPEGATHERED","template":"Collect %param1% units of %param2% on the map","label":"[Daily 4X] Collect 15,000 Iron"},"362":{"chainId":135,"phase":1,"transferProgress":true,"condition":{"args":{},"name":"globalMapCampVictories","target":1},"translationMethod":"globalMapCampVictories","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPCAMPVICTORIES","template":"Clear Brigand Camp %param1% $m(time|times|times)","label":"[Daily 4X] Clear Brigand Camp 1 time"},"363":{"chainId":135,"phase":2,"transferProgress":true,"condition":{"args":{},"name":"globalMapCampVictories","target":5},"translationMethod":"globalMapCampVictories","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPCAMPVICTORIES","template":"Clear Brigand Camp %param1% $m(time|times|times)","label":"[Daily 4X] Clear Brigand Camp 5 times"},"364":{"chainId":135,"phase":3,"transferProgress":true,"condition":{"args":{},"name":"globalMapCampVictories","target":10},"translationMethod":"globalMapCampVictories","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPCAMPVICTORIES","template":"Clear Brigand Camp %param1% $m(time|times|times)","label":"[Daily 4X] Clear Brigand Camp 10 times"},"365":{"chainId":136,"phase":1,"transferProgress":true,"condition":{"args":{},"name":"globalMapResourceGatheringCount","target":1},"translationMethod":"globalMapResourceGatheringCount","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCEGATHERINGCOUNT","template":"Gather %param1% $m(time|times|times) resources on the map","label":"[Daily 4X] Gather resources 1 time"},"366":{"chainId":136,"phase":2,"transferProgress":true,"condition":{"args":{},"name":"globalMapResourceGatheringCount","target":2},"translationMethod":"globalMapResourceGatheringCount","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCEGATHERINGCOUNT","template":"Gather %param1% $m(time|times|times) resources on the map","label":"[Daily 4X] Gather resources 2 times"},"367":{"chainId":136,"phase":3,"transferProgress":true,"condition":{"args":{},"name":"globalMapResourceGatheringCount","target":4},"translationMethod":"globalMapResourceGatheringCount","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPRESOURCEGATHERINGCOUNT","template":"Gather %param1% $m(time|times|times) resources on the map","label":"[Daily 4X] Gather resources 4 times"},"368":{"chainId":137,"phase":1,"transferProgress":true,"condition":{"args":{},"name":"globalMapMobRallyKills","target":1},"translationMethod":"globalMapMobRallyKills","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPMOBRALLYKILLS","template":"Defeat Boss %param1% $m(time|times|times)","label":"[Daily 4X] Defeat Boss 1 time"},"369":{"chainId":137,"phase":2,"transferProgress":true,"condition":{"args":{},"name":"globalMapMobRallyKills","target":2},"translationMethod":"globalMapMobRallyKills","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPMOBRALLYKILLS","template":"Defeat Boss %param1% $m(time|times|times)","label":"[Daily 4X] Defeat Boss 2 times"},"370":{"chainId":137,"phase":3,"transferProgress":true,"condition":{"args":{},"name":"globalMapMobRallyKills","target":3},"translationMethod":"globalMapMobRallyKills","localeKey":"LIB_QUEST_TRANSLATE_GLOBALMAPMOBRALLYKILLS","template":"Defeat Boss %param1% $m(time|times|times)","label":"[Daily 4X] Defeat Boss 3 times"},"2413":{"chainId":2097,"phase":1,"transferProgress":true,"condition":{"args":{},"name":"personalResearchStartAny","target":1},"translationMethod":"personalResearchStartAny","localeKey":"LIB_QUEST_TRANSLATE_PERSONALRESEARCHSTARTANY","template":"Start Research","label":"[Daily 4X] Start Research 1 time"}};
  const dailySources = {"quest":{"url":"https://hwmb-remote-config-cdn.nextersglobal.com/config/quest/b1b8d8f88d714ab34604dfb22f4af15e.json","md5":"b1b8d8f88d714ab34604dfb22f4af15e"},"questChain":{"url":"https://hwmb-remote-config-cdn.nextersglobal.com/config/questChain/822f98416eb5676f77ccec2b31f4ff07.json","md5":"822f98416eb5676f77ccec2b31f4ff07"},"questCondition":{"url":"https://hwmb-remote-config-cdn.nextersglobal.com/config/questCondition/77aaa411dcaed96d34387d51ce95a4e3.json","md5":"77aaa411dcaed96d34387d51ce95a4e3"},"dailyQuestPack":{"url":"https://hwmb-remote-config-cdn.nextersglobal.com/config/dailyQuestPack/0a33f101c05956c1ba1a84489a8db7a8.json","md5":"0a33f101c05956c1ba1a84489a8db7a8"},"locale":{"url":"https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.294.0/v0067/1e8af4ed49f75d2f461962f885ffbaac/locale/en.json.gz","md5":"00b495cbfd75c22a93b508612c41cc1f","size":688687}};
  // END GENERATED DAILY QUESTS

  const localeTitles: Record<string, LocaleTitleInfo> = {
    QUEST_TAB_NAME_SKINSTONES_SPEND: { title: 'Spend Hero Skin Stones', category: 'Resources', unit: 'stones', amount: 100 },
    QUEST_TAB_NAME_TITAN_SKINSTONES_SPEND: { title: 'Spend Titan Skin Stones', category: 'Resources', unit: 'stones', amount: 15 },
    LIB_PSEUDO_STAMINA: { title: 'Spend Energy', category: 'Resources', unit: 'energy', amount: 100 },
    LIB_PSEUDO_STARMONEY: { title: 'Spend Emeralds', category: 'Resources', unit: 'emeralds', amount: 100 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_SPEEDUP: { title: 'Use Training Speedups', category: 'Resources', unit: 'speedups', amount: 1 },
    RECOMMENDATION_RUNES_NEW: { title: 'Upgrade Runes', category: 'Resources', unit: 'runes', amount: 1 },
    QUEST_TAB_NAME_TOWER_CHESTS: { title: 'Open Tower Chests', category: 'Activities', unit: 'chests', amount: 1 },
    UI_FEATURE_HUB_ARENA_TITLE: { title: 'Fight in Arena', category: 'Activities', unit: 'battles', amount: 1 },
    STRATEGIC_GLOBAL_MAP_RALLY_POPUP_TITLE: { title: 'Defeat Map Boss / Rally', category: 'Activities', unit: 'bosses', amount: 1 },
    QUEST_TAB_NAME_GET_VIP: { title: 'Obtain VIP Points', category: 'Activities', unit: 'points', amount: 1 },
    QUEST_TAB_NAME_LOGIN: { title: 'Daily Sign In', category: 'Activities', unit: 'days', amount: 1 },
    UI_DIALOG_HERO_ARTIFACTS_ARTIFACT_EVOLUTION: { title: 'Evolve Hero Artifacts', category: 'Activities', unit: 'evolutions', amount: 1 },
    QUEST_TAB_NAME_ARTLEVEL: { title: 'Level Up Artifacts', category: 'Activities', unit: 'levels', amount: 1 },
    QUEST_TAB_NAME_HERO_RANK: { title: 'Promote Hero Rank', category: 'Activities', unit: 'ranks', amount: 1 },
    QUEST_TAB_HERO_LEVEL: { title: 'Level Up Heroes', category: 'Activities', unit: 'levels', amount: 1 },
    UI_CLANBOSS_MENU_ALTAR: { title: 'Pray at Clan Altar', category: 'Activities', unit: 'prayers', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_LOSEUNITS: { title: 'PvP Unit Battles', category: 'Activities', unit: 'units', amount: 1 },
    LIB_TEST_BP_DAILY_QUESTS: { title: 'Battle Pass Daily Quests', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_TEST_BP_SINGLE_QUESTS: { title: 'Battle Pass Milestones', category: 'Activities', unit: 'milestones', amount: 1 },
    LIB_SEASONAL_EVENT_NAME_FACTION_1: { title: 'Faction Quests: Honor', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_SEASONAL_EVENT_NAME_FACTION_2: { title: 'Faction Quests: Mastery', category: 'Activities', unit: 'quests', amount: 1 },
    STRATEGIC_BASE_INTERFACE_BUTTON_SPEEDUPS: { title: 'Use Speedups in City', category: 'Resources', unit: 'speedups', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TRAIN_TROOPS: { title: 'Train Troops in Barracks', category: 'Activities', unit: 'troops', amount: 100 },
    STRATEGIC_RESOURCE_12_NAME: { title: 'Gather Iron / Ore on Map', category: 'Resources', unit: 'iron', amount: 1000 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_PVPKILLUNITS: { title: 'Defeat Enemy Units in PvP', category: 'Activities', unit: 'units', amount: 50 },
    UI_DIALOG_BOSS_TITLE: { title: 'Defeat World Map Bosses', category: 'Activities', unit: 'bosses', amount: 1 },
    UI_HEROIC_CHEST_MAIN_TITLE: { title: 'Open Heroic Chests', category: 'Activities', unit: 'chests', amount: 1 },
    QUEST_TAB_NAME_SPEND_ARTCOINS: { title: 'Spend Artifact Coins', category: 'Resources', unit: 'coins', amount: 100 },
    LIB_AGGREGATOR_BUTTON_LADDER_HERO_RELIC: { title: 'Upgrade Hero Relics', category: 'Activities', unit: 'relics', amount: 1 },
    QUEST_TAB_NAME_SPEND_RUNE_SPHERES: { title: 'Spend Rune Spheres', category: 'Resources', unit: 'spheres', amount: 1 },
    UI_DIALOG_ARTIFACT_CHEST_DROP_PACK1: { title: 'Open Artifact Chests', category: 'Activities', unit: 'chests', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_9: { title: 'Clash of Worlds Battles', category: 'Activities', unit: 'battles', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_48: { title: 'Clan Clash Victories', category: 'Activities', unit: 'wins', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_763: { title: 'Titan Power & Evolution', category: 'Activities', unit: 'points', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_64: { title: 'Guild Activity & Titanite', category: 'Activities', unit: 'points', amount: 100 },
    LIB_SPECIAL_QUEST_EVENT_NAME_38: { title: 'Hero Ascension Milestones', category: 'Activities', unit: 'tiers', amount: 1 },
    UI_HERO78_TITLE: { title: 'Wodryn Hero Quests', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_143: { title: 'Tower Floor Progress', category: 'Activities', unit: 'floors', amount: 5 },
    STRATEGIC_BASE_INTERFACE_TROOPS_TRAIN: { title: 'Train Troops in Barracks', category: 'Activities', unit: 'troops', amount: 100 },
    EVENT_GLORY_NAME_QUEST_1: { title: 'Rising Legend', category: 'Activities', unit: 'points', amount: 1 },
    EVENT_GLORY_NAME_QUEST_2: { title: 'Trial of Legends', category: 'Activities', unit: 'battles', amount: 1 },
    EVENT_GLORY_NAME_QUEST_3: { title: 'Glory of the Chosen', category: 'Activities', unit: 'battles', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_90934: { title: 'Clan Clash Event', category: 'Activities', unit: 'points', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_100115: { title: "Hero's Way Milestone Pass", category: 'Activities', unit: 'milestones', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_100376: { title: 'Wodryn Relic Pass', category: 'Activities', unit: 'milestones', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_165: { title: 'Secrets of the Dungeon', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_229: { title: 'Outland Splendor', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_4X_1: { title: 'Strategic Growth I', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_4X_2: { title: 'Strategic Growth II', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_NAME_4X_3: { title: 'Strategic Growth III', category: 'Activities', unit: 'quests', amount: 1 },
    LIB_COIN_NAME_18: { title: 'Collect Fairy Dust', category: 'Resources', unit: 'dust', amount: 100 },
    LIB_SPECIAL_QUEST_EVENT_NAME_969: { title: 'Rune Stones & Enchantment', category: 'Activities', unit: 'stones', amount: 10 },
    UI_DIALOG_RATING_TAB_CLAN: { title: 'Guild Activity Points', category: 'Activities', unit: 'points', amount: 100 },
    LIB_CONSUMABLE_NAME_20: { title: 'Spend Titan Potion', category: 'Resources', unit: 'potion', amount: 100 },
    QUEST_TAB_NAME_HYDRA: { title: 'Fight Hydra Heads', category: 'Activities', unit: 'attacks', amount: 1 },
    GACHA_LIVEOPS_HEADER: { title: 'Research Chest LiveOps', category: 'Activities', unit: 'chests', amount: 1 },
    LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_TEST_WENDYGIFT: { title: "Wendy's Daily Gift", category: 'Activities', unit: 'gifts', amount: 1 }
  };

  const questTemplates: Record<number | string, string> = {
    10001: 'Level up hero skills',
    10002: 'Complete any campaign mission',
    10003: 'Complete heroic campaign missions',
    10004: 'Fight in Arena',
    10006: 'Use Emerald Exchange',
    10007: 'Open Heroic Chest',
    10009: 'Claim Free Energy (Bonus Stamina)',
    10010: 'Claim Free Energy (Bonus Stamina)',
    10011: "Valkyrie's Favor Subscription Bonus",
    10013: 'Earn Guild Activity Points',
    10014: 'Earn Guild Activity Points',
    10015: 'Claim Free Energy (Bonus Stamina)',
    10016: 'Send gifts to friends',
    10018: 'Use Hero EXP potions',
    10019: 'Open Tower Chests',
    10020: 'Watch Boxy video',
    10021: 'Open Outland Boss Chests',
    10022: 'Spend Energy',
    10031: 'Collect Titanite in Dungeon',
    10032: 'Collect Titanite in Dungeon',
    10033: 'Upgrade Titan Gift of the Elements',
    10034: 'Level up a Hero Artifact',
    10035: 'Send heroes on Expeditions',
    10036: 'Send heroes on Expeditions',
    10039: 'Defeat all 3 Outland Bosses',
    10040: 'Level up a Hero Skin',
    10041: 'Attack Clan Boss Hydra',
    10044: 'Use Emerald Exchange',
    10082: 'Open chests in Tower',
    10091: 'Fight in Legend Draft',
    10092: 'Fight in Grand Arena',
    10093: 'Collect Eternal Story Chest',
    10101: 'Start Expeditions',
    10102: 'Obtain VIP Points',
    10104: 'Fight in Arena',
    10107: 'Open chests in Tower',
    10108: 'Collect Titanite in Dungeon'
  };

  function registerRuntimeDefinitions(overrides: Record<string, any> = {}) {
    if (!overrides || typeof overrides !== 'object') return;
    if (overrides.dailyTitles) Object.assign(dailyTitles, overrides.dailyTitles);
    if (overrides.viewTitles) Object.assign(viewTitles, overrides.viewTitles);
    if (overrides.localeTitles) Object.assign(localeTitles, overrides.localeTitles);
    if (overrides.questTemplates) Object.assign(questTemplates, overrides.questTemplates);
    if (Array.isArray(overrides.hiddenViewIds)) {
      overrides.hiddenViewIds.forEach((id: number | string) => hiddenViewIds.add(Number(id)));
    }
  }

  // Auto-load runtime overrides from storage & live dynamic catalog
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      chrome.storage.local.get(['questCatalog', 'questDefinitions', 'dynamicEventCatalog']).then((stored) => {
        if (stored?.questCatalog) registerRuntimeDefinitions(stored.questCatalog);
        if (stored?.questDefinitions) registerRuntimeDefinitions(stored.questDefinitions);
        if (stored?.dynamicEventCatalog) registerRuntimeDefinitions(stored.dynamicEventCatalog);
      }).catch(() => {});

      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes: any, area: string) => {
          if (area === 'local') {
            if (changes.dynamicEventCatalog?.newValue) registerRuntimeDefinitions(changes.dynamicEventCatalog.newValue);
            if (changes.questCatalog?.newValue) registerRuntimeDefinitions(changes.questCatalog.newValue);
          }
        });
      }
    }
  } catch (_) {}

  const nextReset = (cache: any, now: number): number | null => {
    const next = cache?.questResetStatus?.data?.nextDayAt;
    if (!Number.isFinite(next)) return null;
    return next > now ? next : next + (Math.floor((now - next) / 86400000) + 1) * 86400000;
  };

  function dailyQuests(cache: any, now: number = Date.now()): DailyQuestItem[] | null {
    const entry = cache?.['getDailyQuests:quest'] || cache?.dailyQuests;
    const questsRaw = entry?.data?.quests ?? entry?.quests;
    if (!questsRaw) return null;
    const observedAt = Date.parse(entry.updatedAt);
    const resetAt = nextReset(cache, now);
    if (!Number.isFinite(observedAt) || (resetAt != null
      ? observedAt < resetAt - 86400000 : new Date(observedAt).toDateString() !== new Date(now).toDateString())) return null;
    return Array.isArray(questsRaw) ? questsRaw : Object.values(questsRaw);
  }

  function visibleGroups(event: any): SpecialQuestGroup[] {
    return (event?.groups || []).filter((group: any) => group && !group.hide).map((group: any) => ({
      ...group,
      quests: (group.quests || []).filter((quest: any) =>
        quest && !group.inactiveQuestIds?.some((id: any) => String(id) === String(quest.id)))
    }));
  }

  function visibleEvents(cache: any, now: number = Date.now()): SpecialQuestEvent[] {
    const entry = cache?.specialQuestStatus;
    const resetAt = nextReset(cache, now);
    const observedAt = Date.parse(entry?.updatedAt);
    const dailyFresh = resetAt == null || observedAt >= resetAt - 86400000;
    return (entry?.data?.events || []).filter((event: any) =>
      Number.isFinite(event?.start) && Number.isFinite(event?.end) &&
      event.start <= now && now < event.end && Number.isInteger(event.viewId) &&
      !hiddenViewIds.has(event.viewId) && !event.clientData?.hideInSpecialQuestPopup)
      .map((event: any) => ({ ...event, groups: visibleGroups(event).filter((group: any) =>
        group.repeatType !== 'daily' || dailyFresh) }))
      .filter((event: any) => event.groups.length > 0);
  }

  function visibleMetadata(cache: any, now: number = Date.now()): any[] {
    return (cache?.questEvents?.data?.events || []).filter((event: any) =>
      !event?.clientData?.hideInSpecialQuestPopup &&
      Number.isFinite(event.startTime) && Number.isFinite(event.endTime) &&
      event.startTime * 1000 <= now && now < event.endTime * 1000);
  }

  function formatLocaleKey(key: string): string {
    if (!key || typeof key !== 'string') return 'Special Quest';
    const clean = key
      .replace(/^(LIB_SPECIAL_QUEST_EVENT_CHAIN_NAME_|LIB_SPECIAL_QUEST_EVENT_NAME_|LIB_SEASONAL_EVENT_NAME_|LIB_TEST_BP_|QUEST_TAB_NAME_|QUEST_TAB_|UI_DIALOG_|UI_FEATURE_HUB_|UI_)/, '')
      .replace(/_/g, ' ')
      .trim();
    if (!clean) return 'Special Quest';
    if (/^\d+$/.test(clean)) return `Mission Chain #${clean}`;
    return clean.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const title = (event: any): string => viewTitles[event?.viewId] || `Special Event #${event?.id}`;

  const dailyTitle = (quest: any): string => {
    const id = quest?.id ?? quest;
    const strId = String(id);
    if (dailyTitles[strId]) return dailyTitles[strId];
    if (questTemplates[id]) return questTemplates[id];
    return `Daily Quest #${id}`;
  };

  const groupTitle = (localeKey?: string | null): string => {
    if (!localeKey) return 'Special Quest';
    if (localeTitles[localeKey]?.title) return localeTitles[localeKey].title;
    return formatLocaleKey(localeKey);
  };

  const questTemplateTitle = (id: number | string): string | null => questTemplates[id] || null;

  const isRecognizedQuest = (id: number | string): boolean => Boolean(dailyTitles[String(id)] || questTemplates[id]);

  function getMilestoneSummary(event: any) {
    const groups = visibleGroups(event) || [];
    let totalMilestones = 0;
    let completedMilestones = 0;
    let inProgressCount = 0;
    const groupSummaries = groups.map((g: any) => {
      const qList = Array.isArray(g.quests) ? g.quests : [];
      const total = qList.length;
      const completed = qList.filter((q: any) => q.state === 'completed').length;
      const inProgress = qList.filter((q: any) => q.state === 'inProgress');
      totalMilestones += total;
      completedMilestones += completed;
      inProgressCount += inProgress.length;
      const activeQuest = inProgress[0] || null;
      return {
        groupId: g.id,
        repeatType: g.repeatType,
        localeKey: g.localeKey,
        title: groupTitle(g.localeKey),
        totalMilestones: total,
        completedMilestones: completed,
        activeMilestoneIndex: activeQuest ? (total - inProgress.length + 1) : total,
        activeProgress: activeQuest?.progress ?? 0,
        isCompleted: completed >= total && total > 0
      };
    });
    const percent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
    return {
      totalMilestones,
      completedMilestones,
      inProgressCount,
      percent,
      dailyGroups: groupSummaries.filter(g => g.repeatType === 'daily'),
      singleGroups: groupSummaries.filter(g => g.repeatType === 'single'),
      groups: groupSummaries
    };
  }

  function getBattlePassState(cache: any) {
    const rawPasses = cache?.battlepassStatus?.data?.passes ||
      cache?.battlepassStatus?.passes ||
      cache?.['battlePass_getAll:events']?.data || [];
    const list = Array.isArray(rawPasses) ? rawPasses : (rawPasses ? Object.values(rawPasses) : []);
    return list.map((p: any) => {
      const farmedNormal = Array.isArray(p.farmedRewards?.normal) ? p.farmedRewards.normal.length : 0;
      const farmedGold = Array.isArray(p.farmedRewards?.gold) ? p.farmedRewards.gold.length : 0;
      return {
        id: p.id,
        type: p.type || 'regular',
        exp: Number(p.battlePassExp) || 0,
        endTime: p.endTime ? Number(p.endTime) : 0,
        farmedNormal,
        farmedGold,
        hasGoldenPass: Boolean(p.goldenPassPurchaseDate && p.goldenPassPurchaseDate > 0)
      };
    });
  }

  const getCatalog = () => ({
    dailyTitles: { ...dailyTitles },
    dailyDefinitions: { ...dailyDefinitions },
    dailySources: { ...dailySources },
    viewTitles: { ...viewTitles },
    hiddenViewIds: Array.from(hiddenViewIds),
    localeTitles: { ...localeTitles },
    questTemplates: { ...questTemplates }
  });

  const exportCatalogJson = () => JSON.stringify(getCatalog(), null, 2);

export const questData = {
  dailyQuests,
  visibleEvents,
  visibleMetadata,
  visibleGroups,
  nextReset,
  title,
  dailyTitle,
  dailyTitles,
  viewTitles,
  hiddenViewIds,
  localeTitles,
  questTemplates,
  groupTitle,
  questTemplateTitle,
  isRecognizedQuest,
  dailyDefinitions,
  dailySources,
  dailyDefinition: (id: string | number) => dailyDefinitions[String(id)] || null,
  getMilestoneSummary,
  getBattlePassState,
  registerRuntimeDefinitions,
  getCatalog,
  exportCatalogJson
};

export {
  dailyQuests,
  visibleEvents,
  visibleMetadata,
  visibleGroups,
  nextReset,
  title as getEventTitle,
  dailyTitle as getDailyTitle,
  dailyTitles,
  viewTitles,
  hiddenViewIds,
  localeTitles,
  questTemplates,
  groupTitle as getGroupTitle,
  questTemplateTitle,
  isRecognizedQuest,
  dailyDefinitions,
  dailySources,
  getMilestoneSummary,
  getBattlePassState,
  registerRuntimeDefinitions,
  getCatalog,
  exportCatalogJson
};
