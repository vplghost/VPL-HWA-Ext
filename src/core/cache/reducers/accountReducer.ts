import type { CacheEntry, RpcCacheState } from '../../../types';

export function reduceAccountChange(next: RpcCacheState, entry: CacheEntry): boolean {
  if (
    entry.key === 'accountStatus' &&
    next.accountStatus?.data?.id != null &&
    entry.data?.id != null &&
    String(next.accountStatus.data.id) !== String(entry.data.id) &&
    (!next.accountStatus.updatedAt || next.accountStatus.updatedAt <= entry.updatedAt)
  ) {
    delete next.guildStatus;
    delete next.guildOutposts;
    delete next.heroGetAll;
    delete next.rallyPowerStatus;
    delete next.rallyReadStatus;
    delete next.marchStatus;
    delete next.marchReturnStatus;
    delete next.marchSnapshotStatus;
    delete next.gatheringStatus;
    delete next.incomingMineAttacks;
    delete next['getHealing:unit'];
    delete next.buildingStatus;
    delete next.mineMap;
    delete next.experimentalMapContext;
    delete next.experimentalMineSearch;
    delete next['getUnitSummary:unit'];
    delete next['getDailyQuests:quest'];
    delete next.expeditionStatus;
    delete next.expeditionCollectStatus;
    delete next.expeditionCollectReceipts;
    delete next.expeditionStartStatus;
    delete next.expeditionGet;
    delete next.freeAlchemySpinStatus;
    delete next.freeAlchemySpinReceipts;
    delete next.cinemaGiveRewardStatus;
    delete next.cinemaGiveRewardReceipts;
    delete next.cinemaGetCounters;
    delete next.attentionBonusStatus;
    delete next.attentionBonusCollectStatus;
    delete next.attentionBonusCollectReceipts;
    delete next.mailStatus;
    delete next.mailGetAll;
    delete next['getPage:report'];
    delete next.mailClaimReceipts;
    delete next.mailClaimStatus;
    delete next.battleReportSummary;
    next.mailAccountEpoch = {
      key: 'mailAccountEpoch',
      data: { accountId: String(entry.data.id) },
      updatedAt: entry.updatedAt
    };
    delete next.speedupInventory;
    delete next.speedupStatus;
    delete next.speedupReceipts;
    next.speedupAccountEpoch = {
      key: 'speedupAccountEpoch',
      data: { accountId: String(entry.data.id) },
      updatedAt: entry.updatedAt
    };
    delete next['resource:refillable:53'];
    return true;
  }
  return false;
}
