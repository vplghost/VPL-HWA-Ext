(() => {
  const sameDay = (entry, now) => {
    const observed = new Date(entry?.updatedAt);
    return Number.isFinite(observed.getTime()) && observed.toDateString() === new Date(now).toDateString();
  };

  function dailyDashboard(cache = {}, now = Date.now()) {
    const data = (key) => sameDay(cache[key], now) ? cache[key].data : null;
    const row = (id, title, icon, state, detail) => ({ id, title, icon, state, detail });
    const unknown = 'Waiting for game data';
    const activities = [];

    const tower = data('towerStatus');
    activities.push(row('tower', 'Tower', '🗼', !tower ? 'unknown' : tower.isCleared ? 'done' : 'pending',
      !tower ? unknown : tower.isCleared ? 'Cleared today' : tower.floorNumber ? `Floor ${tower.floorNumber} / 25` : 'Ready to enter'));

    const arena = data('arenaGetAll');
    for (const [id, title, icon, rank, refillableId] of [
      ['arena', 'Arena', '⚔️', arena?.arenaPlace, 6],
      ['grand-arena', 'Grand Arena', '🛡️', arena?.grandPlace, 21]
    ]) {
      const amount = data(`resource:refillable:${refillableId}`)?.amount;
      const known = Number.isInteger(amount) && amount >= 0;
      activities.push(row(id, title, icon, !known ? 'unknown' : amount > 0 ? 'pending' : 'info',
        known ? `Rank ${rank ?? '—'} · ${amount} battles left today` :
          arena ? `Rank ${rank ?? '—'} · Battles remaining unavailable` : unknown));
    }

    const expeditions = data('expeditionGet');
    const slots = Array.isArray(expeditions) ? expeditions : null;
    const attempts = slots?.reduce((sum, slot) => sum + Math.max(0, Number(slot?.attemptsLeft) || 0), 0);
    activities.push(row('expeditions', 'Expeditions', '⛵', !slots ? 'unknown' : attempts > 0 ? 'pending' : 'info',
      !slots ? unknown : `${attempts} attempts left · ${slots.length} slots observed`));

    const dungeon = data('dungeonStatus');
    activities.push(row('dungeon', 'Guild Dungeon', '🏰', dungeon ? 'pending' : 'unknown',
      !dungeon ? unknown : `${Number(dungeon.dungeonActivity) || 0} activity points · Floor ${dungeon.floorNumber ?? '—'}`));

    const hydra = data('clanBoss_getAll');
    const tries = hydra ? (Number(hydra.tries) || 0) + (Number(hydra.superTries) || 0) : 0;
    activities.push(row('hydra', 'Hydra', '🐉', !hydra ? 'unknown' : tries > 0 ? 'pending' : 'info',
      !hydra ? unknown : `${hydra.tries ?? 0} regular · ${hydra.superTries ?? 0} super tries left`));

    const daily = data('getDailyQuests:quest');
    const quests = data('questGetAll');
    const dailyList = Array.isArray(daily?.quests) ? daily.quests : null;
    const ready = Array.isArray(quests) ? quests.filter((quest) => quest?.state === 2).length : 0;
    const questRows = [row('daily-quests', 'Daily Quests', '📜', ready > 0 ? 'pending' : dailyList || Array.isArray(quests) ? 'info' : 'unknown',
      dailyList ? `${dailyList.length} daily quests observed · ${ready} rewards ready to claim` :
        Array.isArray(quests) ? `${ready} quest rewards ready to claim · Daily list unavailable` : unknown)];

    const dailyBonus = data('dailyBonusGetInfo');
    const zeppelin = data('zeppelinGiftGet');
    const giftRows = [
      row('daily-bonus', 'Daily Login Bonus', '🎁', !dailyBonus ? 'unknown' : dailyBonus.availableToday ? 'pending' : 'info',
        !dailyBonus ? unknown : dailyBonus.availableToday ? 'Free reward available' : 'Already claimed or unavailable'),
      row('zeppelin-gift', 'Zeppelin Gift', '🎈', !zeppelin ? 'unknown' : zeppelin.available ? 'pending' : 'info',
        !zeppelin ? unknown : zeppelin.available ? 'Free gift available' : 'Already claimed or unavailable')
    ];
    for (const [id, title] of [[3, 'Bronze Free Chest'], [4, 'Gold Free Chest'], [35, 'Diamond Free Chest']]) {
      const chest = data(`resource:refillable:${id}`);
      const amount = Number(chest?.amount);
      giftRows.push(row(`chest-${id}`, title, '📦', !chest || !Number.isFinite(amount) ? 'unknown' : amount > 0 ? 'pending' : 'info',
        !chest || !Number.isFinite(amount) ? unknown : amount > 0 ? `${amount} available` : 'None available'));
    }
    return { activities, quests: questRows, gifts: giftRows };
  }

  globalThis.hwaHelperDashboardData = { dailyDashboard };
})();
