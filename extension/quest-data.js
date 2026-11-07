(() => {
  // specialQuestEventView/48be248d9c2a3f0df5f3ee0cd6800ac7.json (game config 1.293.1010).
  const hiddenViewIds = new Set([29, 30, 61, 93, 95, 106, 107, 108, 116, 118, 119, 120]);
  const viewTitles = {
    65: 'Clan Clash Event', 94: 'Hero Upgrade Event', 99: 'Hero’s Way',
    126: 'Faction Event I', 127: 'Faction Event II', 128: 'Faction Event III',
    129: 'Relic Pass', 67: 'Glory Pass'
  };
  const dailyTitles = {
    346: 'Complete a building upgrade', 356: 'Gather 10,000 stone',
    363: 'Win 5 camp battles'
  };
  const nextReset = (cache, now) => {
    const next = cache?.questResetStatus?.data?.nextDayAt;
    if (!Number.isFinite(next)) return null;
    return next > now ? next : next + (Math.floor((now - next) / 86400000) + 1) * 86400000;
  };
  function dailyQuests(cache, now = Date.now()) {
    const entry = cache?.['getDailyQuests:quest'];
    if (!Array.isArray(entry?.data?.quests)) return null;
    const observedAt = Date.parse(entry.updatedAt);
    const resetAt = nextReset(cache, now);
    if (!Number.isFinite(observedAt) || (resetAt != null
      ? observedAt < resetAt - 86400000 : new Date(observedAt).toDateString() !== new Date(now).toDateString())) return null;
    return entry.data.quests;
  }
  function visibleGroups(event) {
    return (event?.groups || []).filter((group) => group && !group.hide).map((group) => ({
      ...group,
      quests: (group.quests || []).filter((quest) =>
        quest && !group.inactiveQuestIds?.some((id) => String(id) === String(quest.id)))
    }));
  }
  function visibleEvents(cache, now = Date.now()) {
    const entry = cache?.specialQuestStatus;
    const resetAt = nextReset(cache, now);
    const observedAt = Date.parse(entry?.updatedAt);
    const dailyFresh = resetAt == null || observedAt >= resetAt - 86400000;
    return (entry?.data?.events || []).filter((event) =>
      Number.isFinite(event?.start) && Number.isFinite(event?.end) &&
      event.start <= now && now < event.end && Number.isInteger(event.viewId) &&
      !hiddenViewIds.has(event.viewId))
      .map((event) => ({ ...event, groups: visibleGroups(event).filter((group) =>
        group.repeatType !== 'daily' || dailyFresh) }))
      .filter((event) => event.groups.length > 0);
  }
  function visibleMetadata(cache, now = Date.now()) {
    return (cache?.questEvents?.data?.events || []).filter((event) =>
      !event?.clientData?.hideInSpecialQuestPopup &&
      Number.isFinite(event.startTime) && Number.isFinite(event.endTime) &&
      event.startTime * 1000 <= now && now < event.endTime * 1000);
  }
  const title = (event) => viewTitles[event?.viewId] || `Special Event #${event?.id}`;
  const dailyTitle = (quest) => dailyTitles[quest?.id] || `Daily Quest #${quest?.id}`;
  globalThis.hwaHelperQuestData = { dailyQuests, visibleEvents, visibleMetadata,
    visibleGroups, nextReset, title, dailyTitle };
})();
