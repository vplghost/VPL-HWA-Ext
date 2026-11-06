---
id: doc-9bf73c6f40e832fce097e6d507c4287c
title: Account System Rpc Catalog
description: Observed 40 RPC method contracts with request/response field types, counts and source evidence
createdAt: '2026-11-06T04:06:01.698Z'
updatedAt: '2026-11-06T04:06:01.698Z'
tags:
  - api
  - rpc
  - catalog
  - captured
---

# Account System Rpc Catalog

Captured evidence catalog, audited 2026-11-06. See @doc/api/observed-protocol-index for source IDs, transport envelope, redaction and interpretation rules.

40 distinct method/feature pairs. Fields below are observed type unions through two nesting levels; they are not required-field definitions or complete server schemas. `<key>` means dynamic dictionary key; empty arrays reveal no element contract. Counts include repeated calls and bootstrap batches.

## League_getInfo

Occurrences: 6; response present without error: 6; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.type: string
```

Successful `result.response` fields:
```text
$: object
$.league: number
$.leagueClaimedRewards: array
$.leagueClaimedRewards[]: object
$.rewards: array
$.rewards[]: object
```

## Webshop_getWebshopTransaction

Occurrences: 10; response present without error: 10; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S03, S08, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```

## applyMigrationsBeforeInit:user

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
```

## billingGetAll

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.currency: string
```

Successful `result.response` fields:
```text
$: object
$.billings: array
$.billings[]: object
$.bundle: array
$.bundle[]: object
$.priceVersion: string
```

## billingGetLast

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.lastUpdateDate: number
```

## billing_customStoreGetNotGiven

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
```

## common_getCustomStoresDirect

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.region: string
$.stores: array
```

## getGameInfo:WebGL

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.accountId: string
$.buildUrl: string
$.loadingAssets: object
$.loadingAssets.css: array
$.loadingAssets.deferredJs: array
$.loadingAssets.js: array
$.networkIdent: string
$.userId: number
$.version: string
```

## getLuckyChestInfo:luckyChest

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.chestLevel: number
$.openCost: array
$.openCost[]: object
$.openedChestsAtCurrentLevel: number
$.openedChestsCount: number
```

## getNameChangedCount

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: number
```

## getPushdCredentials

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.accountId: string
$.applicationId: string
$.authToken: string
$.host: string
$.networkIdent: string
$.port: string
$.token: string
$.topics: array
$.topics[]: string
$.type: string
$.wssHost: string
```

## getTime

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: number
```

## indexGet

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
$.deviceId: string
$.hash: string
$.variant: string
```

Successful `result.response` fields:
```text
$: object
$.assetLib: object
$.assetLib.asset: object
$.clientConfig: object
$.clientConfig.applePlugins: string
$.clientConfig.bloomreach: string
$.clientConfig.embrace: object
$.clientConfig.performanceProfileSettings: object
$.clientConfig.rpcTransportTest: object
$.clientConfig.syncSystem: string
$.currentVersionIndex: string
$.geoCountry: string
$.index: object
$.index.base: object
$.index.hash: string
$.index.static: string
$.index.url: string
$.lib: object
$.lib.<key>: object
$.lib.static: string
$.locale: object
$.locale.<key>: object
$.locale.static: string
$.staticVersionUrl: string
$.syncSystem: object
$.syncSystem.version: number
```

## liveOpsInit

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.availableMechanics: array
$.availableMechanics[]: string
```

## liveOps_refresh

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: null
```

## misc_preLogin

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
$.device: object
$.device.height: number
$.device.name: string
$.device.os: string
$.device.ram: number
$.device.width: number
$.language: string
```

Successful `result.response` fields:
```text
$: array
```

## mobileLogin

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.adid: null
$.appsflyerId: string
$.att: string
$.device: object
$.device.height: number
$.device.name: string
$.device.os: string
$.device.ram: number
$.device.width: number
$.deviceId: string
$.language: string
$.reason: string
$.sessionId: string
$.store: string
```

Successful `result.response` fields:
```text
$: object
$.sessionId: string
$.supportLink: object
$.supportLink.token: string
$.supportLink.ts: number
$.userId: string
```

## offerGetAll

Occurrences: 4; response present without error: 4; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: object
$[].billings: array
$[].clientData: array|object
$[].endTime: number
$[].freeRewardObtained: boolean
$[].id: number
$[].isActive: boolean
$[].notAvailableBillings: array
$[].offerData: array|object
$[].offerType: string
$[].reward: array|object
$[].skinShop: array
$[].type: string
```

## onLogin

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: null
```

## rateUsGetCooldown

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.cooldown: number
$.nativeCooldown: number
$.shortAttemptsLeft: number
```

## remoteConfigInit

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.lang: string
```

Successful `result.response` fields:
```text
$: object
$.gameTimeShift: string
$.index: object
$.index.configs: object
$.index.id: string
```

## remoteConfigProvideArchive:RemoteConfig

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
$.lang: string
```

Successful `result.response` fields:
```text
$: object
$.content: array
$.content[]: string
$.index: object
$.index.artifact: object
$.index.artifactBattleEffect: object
$.index.artifactType: object
$.index.battleConfig: object
$.index.battleEffect: object
$.index.battleFeatures: object
$.index.battleUnit: object
$.index.battlepassPointsView: object
$.index.battlepassTrackResourceView: object
$.index.coin: object
$.index.dailyQuestsChestConfig: object
$.index.dataStorageMode: object
$.index.featureFlags: object
$.index.fortressFeatureFlags: object
$.index.hapticSignals: object
$.index.heroFaction: object
$.index.legacyLocalization: object
$.index.localeFeatureFlags: object
$.index.newbieGiftsSettings: object
$.index.patronSkill: object
$.index.ratingFeatureFlags: object
$.index.skill: object
$.index.techConfig: object
$.url: string
```

## resourceSubscription_getAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.error: string
$.errorCode: number
```

## sendConsent:WebGL

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
$.accepted: boolean
$.metrics: boolean
$.mode: string
$.partners: boolean
$.version: number
```

Successful `result.response` fields:
```text
$: object
```

## sendCookie:WebGL

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
$.cookies: array
$.cookies[]: object
```

Successful `result.response` fields:
```text
$: object
```

## serverGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.servers: array
$.servers[]: object
$.users: array
$.users[]: object
```

## settingsGetAll

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: boolean
$.battleSettings: string
$.brawlPopup: boolean
$.clanWarAttackScreen: boolean
$.clanWarPlanScreen: boolean
$.clanWarStartScreen: boolean
$.draftsPresentationViewed: boolean
$.expeditionsQuickCollect: boolean
$.mechanicSettings: string
$.music: boolean
$.simpleHealthView: boolean
$.skillPointBundlesPopupWasShown: boolean
$.skinShopSavedSkin: number
$.sounds: boolean
$.zeppelinPopup: boolean
```

## settingsSet

Occurrences: 25; response present without error: 25; RPC errors: 0; missing/unmatched response: 0. Sources: S08, S10.

Request `args` fields:
```text
$: object
$.battleSettings: string
$.mechanicSettings: string
```

Successful `result.response` fields:
```text
$: null
```

## settings_getAccount

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.playerPlatforms: string
$.registrationPlatform: string
```

## splitGetMap

Occurrences: 3; response present without error: 3; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.webshop_rule: string
```

## stashClient

Occurrences: 109; response present without error: 109; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S03, S05, S06, S07, S08, S09, S10, S11, S12, S13.

Request `args` fields:
```text
$: object
$.data: array
$.data[]: object
```

Successful `result.response` fields:
```text
$: array
$[]: boolean
```

## subscriptionGetInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.dailyReward: object
$.dailyReward.availableFarm: boolean
$.dailyReward.currentReward: null
$.dailyReward.dailyReward: object
$.dailyReward.notFarmedDays: number
$.subscription: null
```

## townGate_getLastMinigame

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.mapId: number
$.rewardClaimed: boolean
$.towerId: number
```

## tutorialGetInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.<key>: number
```

## userActivityMarkers_getKeyValues

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.boss_last_ts: string
$.heroChest_last_ts: string
$.magicTower_last_reset_ts: string
```

## userGetAvailableAvatars

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: array
$[]: number
```

## userGetInfo

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.accountId: string
$.avatarId: string
$.battleIsAllowed: boolean
$.borderId: number
$.clanId: string
$.clanRole: string
$.experience: string
$.feedbackRating: number
$.flagId: number
$.flags: string
$.frameId: number
$.gold: number
$.id: string
$.isChatModerator: boolean
$.lastLoginTime: string
$.level: string
$.maxLevel: number
$.maxMigrationServer: number
$.name: string
$.nextDayTs: number
$.offerWallId: string
$.refillable: array
$.refillable[]: object
$.region: number
$.registrationTime: string
$.serverId: string
$.starMoney: number
$.timeZone: number
$.tutorialStep: string
$.vipPoints: string
```

## userGetInfoByIds

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
$.ids: array
$.ids[]: string
```

Successful `result.response` fields:
```text
$: object
$.users: array
$.users[]: object
```

## user_getNextDayTime

Occurrences: 1; response present without error: 1; RPC errors: 0; missing/unmatched response: 0. Sources: S02.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.ts: number
```

## user_isEnableIdfa

Occurrences: 2; response present without error: 2; RPC errors: 0; missing/unmatched response: 0. Sources: S02, S10.

Request `args` fields:
```text
$: object
```

Successful `result.response` fields:
```text
$: object
$.enable: boolean
```
