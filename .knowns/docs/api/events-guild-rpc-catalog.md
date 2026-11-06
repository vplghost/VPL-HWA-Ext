---
id: doc-536f8a14f477212dec035481a855a8a9
title: Events Guild Rpc Catalog
description: Observed 44 RPC method contracts with request/response field types, counts and source evidence
createdAt: '2026-11-06T04:06:01.841Z'
updatedAt: '2026-11-06T04:06:01.841Z'
tags:
  - api
  - rpc
  - catalog
  - captured
---

# Events Guild Rpc Catalog

Captured evidence catalog, audited 2026-11-06. See @doc/api/observed-protocol-index for source IDs, transport envelope, redaction and interpretation rules.

44 distinct method/feature pairs. Fields below are observed type unions through two nesting levels; they are not required-field definitions or complete server schemas. `<key>` means dynamic dictionary key; empty arrays reveal no element contract. Counts include repeated calls and bootstrap batches.

## battlePass_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].battlePassExp: number
$[].endTime: number
$[].energyBoost: number
$[].energyBoostStartTime: number
$[].farmedRewards: object
$[].goldenPassPurchaseDate: number
$[].goldenPassType: null
$[].id: number
$[].nextDayTime: number
$[].type: string
```

## chatGetAll

Occurrences: 7; response present without error: 7; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.chatType: string
```

Successful `result.response` fields:
```text
$: object
$.chatStatus: string
$.messages: array
$.messages[]: object
$.subscribers: array
$.subscribers[]: number
$.users: object
$.users.<key>: object
```

## chatGetInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.banUntil: string
$.blackList: array
$.lastMessageTime: string
$.settings: array
$.subscribeServer: string
```

## chatSendText

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
$.chatType: string
$.text: string
```

Successful `result.response` fields:
```text
$: null
```

## chatServerSubscribe

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: null
```

## chat_getBanStatus:chat

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.isBanned: boolean
```

## chat_getBlackList:chat

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.userInfos: array
```

## chat_getPrivateChats:chat

Occurrences: 3; response present without error: 3; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.count: number
$.offset: number
```

Successful `result.response` fields:
```text
$: object
$.userInfos: array
$.userInfos[]: string
```

## cinemaGetCounters

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.available: number
$.boxyResetTime: number
$.consolationPrize: boolean
$.placementAvailable: number
$.placementRewards: array
$.placementRewards[]: object
$.placementViewed: number
$.resetTime: number
$.viewed: number
```

## claimChest:clanVersus

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S01.

Request `args` fields:
```text
$: object
$.chestNumber: number
```

Successful `result.response` fields:
```text
$: object
```

## clanClash_getCurrentState

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.ClashEventId: number
```

Successful `result.response` fields:
```text
$: object
$.clashEvent: object
$.clashEvent.boosters: object
$.clashEvent.boostersUpdateTime: number
$.clashEvent.clans: array
$.clashEvent.currentState: object
$.clashEvent.cycleId: number
$.clashEvent.groupRanking: array
$.clashEvent.id: number
$.clashEvent.lanes: array
$.clashEvent.players: array
$.clashEvent.round: object
$.clashEvent.updateTimestamp: number
```

## clanGetActivityStat

Occurrences: 3; response present without error: 3; RPC errors: 0; missing/unmatched response: 0. Sources: S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.clanActivity: number
$.dungeonActivity: number
$.stat: object
$.stat.activityForRuneAvailable: boolean
$.stat.activitySum: number
$.stat.dungeonActivitySum: number
$.stat.raidDamage: object
$.stat.todayActivity: number
$.stat.todayDungeonActivity: number
$.stat.todayItemsActivity: number
```

## clanWarChampInfo_getBriefInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.arePointsMax: boolean
$.hasActiveWar: boolean
$.hasBothTeams: boolean
$.ourPoints: null|string
$.rivalPoints: null|number
$.seasonId: number
$.seasonStatus: object
$.seasonStatus.current: object
$.seasonStatus.next: object
$.tries: number
```

## clanWarGetBriefInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.arePointsMax: boolean
$.hasActiveWar: boolean
$.nearestWarEndTime: number
$.nextWarTime: number
$.tries: number
```

## clanWarGetWarlordInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: null
```

## dailyBonusGetInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.availableToday: boolean
$.availableVip: boolean
$.currentDay: string
$.daysInMonth: number
$.heroId: number
$.month: number
$.year: string
```

## eventPicker_info

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: object
$.<key>.current_round: number
$.<key>.final_reward: object
$.<key>.freeRun: boolean
$.<key>.restart_count: number
$.<key>.rewards: array
$.<key>.status: string
```

## expeditionGet

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].attemptsLeft: number
$[].day: string
$[].duration: number
$[].endTime: number
$[].heroes: array
$[].id: number
$[].power: number
$[].rarity: number
$[].reward: object
$[].slotId: number
$[].status: number
$[].storyId: number
```

## gacha_getInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: object
$.<key>.rollCount: number
$.<key>.rolledReward: array|object
```

## getAllFortresses:fortress

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.mapId: string
```

Successful `result.response` fields:
```text
$: object
$.clans: array
$.clans[]: object
$.fortresses: array
$.fortresses[]: object
$.serverTime: number
$.state: object
$.state.clanWarsDeclaredToday: number
```

## getBattlepassState:battlepass

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.battlepasses: array
$.battlepasses[]: object
```

## getChapters:quest

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.allChaptersCompleted: boolean
$.completedChapters: array
$.completedChapters[]: number
$.quests: array
$.quests[]: object
```

## getCurrentBattle:clanVersus

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
$.clanId: number
```

Successful `result.response` fields:
```text
$: object
$.bestEnemyPlayer: object
$.bestEnemyPlayer.avatarUrl: string
$.bestEnemyPlayer.clanId: number
$.bestEnemyPlayer.level: number
$.bestEnemyPlayer.userId: number
$.bestPlayer: object
$.bestPlayer.avatarUrl: string
$.bestPlayer.clanId: number
$.bestPlayer.level: number
$.bestPlayer.userId: number
$.clan: object
$.clan.icon: object
$.clan.id: number
$.clan.isActive: boolean
$.clan.name: string
$.clan.server: string
$.clanBattleScore: number
$.clanBattleTotalPoints: number
$.clanRoundPoints: number
$.enemyClan: object
$.enemyClan.icon: object
$.enemyClan.id: number
$.enemyClan.isActive: boolean
$.enemyClan.name: string
$.enemyClan.server: string
$.enemyClanBattleScore: number
$.enemyClanBattleTotalPoints: number
$.enemyClanRoundPoints: number
$.league: string
$.remainingTime: number
$.rounds: array
$.rounds[]: object
```

## getDailyQuests:quest

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.quests: array
$.quests[]: object
```

## getEmailInfo:EmailCollector

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.email: string
$.emailChangeAllowedStamp: number
$.emailLinked: boolean
$.marketingConsent: boolean
$.rewardCollected: boolean
$.subscribed: boolean
```

## getEventInfo:fortress

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.endDate: number
$.id: number
$.startDate: number
```

## getGrowthQuests:quest

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.quests: array
$.quests[]: object
```

## getInfo:clanVersus

Occurrences: 3; response present without error: 3; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.clanId: number
```

Successful `result.response` fields:
```text
$: object
$.battleEndTime: number
$.battleId: number
$.battleNumber: number
$.battlesPerSeason: number
$.challenges: array
$.challenges[]: object
$.currentNumActiveUsers: number
$.eventId: number
$.guildRequirementsIsSatisfied: boolean
$.is6DayDisabled: boolean
$.league: number
$.numActiveUsers: number
$.personalRequirementsIsSatisfied: boolean
$.roundEndTime: number
$.roundId: number
$.roundNumber: number
$.weeklyUserActivity: number
```

## getLeaderboardPowerSummary:leaderboardPower

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.places: array
$.places[]: object
$.topScores: array
$.topScores[]: object
```

## getPage:report

Occurrences: 11; response present without error: 11; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S04, S08, S10, S11, S13.

Request `args` fields:
```text
$: object
$.cursor: null|object
$.cursor.createdAt: number
$.cursor.id: string
$.limit: number
```

Successful `result.response` fields:
```text
$: object
$.reports: array
$.reports[]: object
```

## getRatingInfo:fortress

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.ratingEndDate: number
$.ratingStartDate: number
$.rewards: array
```

## getRewardList:clanVersus

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.qualifyingClanRank: number
$.seasonClanRank: number
$.userBattlePoints: number
$.userClanRank: number
$.userRoundPoints: number
$.userSeasonPoints: number
```

## getSpecialQuestState:quest

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.events: array
$.events[]: object
```

## getUserPlace:leaderboard

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.leaderboardType: string
```

Successful `result.response` fields:
```text
$: object
$.place: number
$.totalMemberCount: number
```

## getUserProgress:clanVersus

Occurrences: 5; response present without error: 5; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.chestNumbers: array
$.chestNumbers[]: number
$.progress: object
$.progress.score: number
```

## getWars:fortress

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.clans: array
$.wars: array
```

## mailGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.letters: array
$.letters[]: object
$.users: array|object
$.users.<key>: object
```

## questGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].id: number
$[].multiplier: number
$[].order: number
$[].progress: number
$[].reward: object
$[].state: number
```

## questGetEvents

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].assets: null
$[].back_image: null|object
$[].clientData: object
$[].desc_localeKey: string
$[].endTime: number
$[].eventLoopData: null
$[].exchangeRule: null
$[].id: number
$[].localeKey: string
$[].name_localeKey: string
$[].sortOrder: number
$[].startTime: number
$[].tab_icon: object
```

## questGetPaymentDependent

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```

## topGet

Occurrences: 10; response present without error: 10; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.selfOnly: boolean
$.type: string
```

Successful `result.response` fields:
```text
$: object
$.count: number
$.reference: object
$.reference.list: object
$.reference.type: string
$.top: array
$.top[]: object
```

## user_getClanInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.clanData: object
$.clanData.clan: object
$.clanData.clanWarEndSeasonTime: number
$.clanData.freeClanChangeInterval: object
$.clanData.membersStat: array
$.clanData.serverResetTime: number
$.clanData.stat: object
$.clanRole: number
```

## worldStars_getAvailable

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].id: number
$[].passed: boolean
```

## zeppelinGiftGet

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.available: boolean
$.reward: object
$.reward.consumable: object
```
