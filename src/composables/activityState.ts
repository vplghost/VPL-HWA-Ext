export function towerActivityState(cache: Record<string, any>) {
  const tower = cache.towerStatus?.data;
  const session = cache.towerSession?.data;
  const cleared = Boolean(tower?.isCleared || tower?.state === 'win' || tower?.state === 'completed' ||
    session?.completed || cache.magicTower_briefInfo?.data?.state === 'win' || cache.magicTower_briefInfo?.state === 'win');
  return {
    state: cleared ? 'done' as const : !tower && !session ? 'unknown' as const : 'pending' as const,
    detail: cleared ? 'Cleared today' : !tower && !session ? 'Waiting for game data'
      : tower?.floorNumber ? `Floor ${tower.floorNumber} / 25` : 'Ready to enter',
  };
}
export function readyQuestCount(cache: Record<string, any>) {
  const quests = cache.questGetAll?.data ?? cache.quest_getAll?.data;
  return quests && typeof quests === 'object' ? Object.values(quests).filter((quest: any) => Number(quest?.state) === 2).length : 0;
}
