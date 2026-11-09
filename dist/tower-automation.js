(() => {
  function priorityOrder(ids, preferred = []) {
    const available = [...new Set(ids.filter(Number.isInteger))];
    return [...new Set([...preferred, ...available])].filter((id) => available.includes(id));
  }

  function chooseBuff(offered, preferred) {
    if (!Array.isArray(offered) || !offered.length) return null;
    const order = priorityOrder(offered, preferred);
    return order[0] ?? null;
  }

  function chooseBattleRoom(rooms, preferred, history = [], floor = null) {
    const battles = Object.values(rooms).filter((room) => {
      if (!['hero_battle', 'boss_battle'].includes(room?.type)) return false;
      if (room.state !== 'initial') return false;
      const alreadyWon = history.some((e) =>
        e.action === 'endBattle' && e.floor === floor && Number(e.room) === Number(room.roomNumber) && e.win);
      return !alreadyWon;
    }).sort((a, b) => Number(a.roomNumber) - Number(b.roomNumber));

    if (!battles.length) return null;
    const rank = (room) => {
      const next = rooms[Number(room.roomNumber) + 1];
      if (next?.type !== 'buffs') return Infinity;
      const buff = chooseBuff(next.buffs, preferred);
      const index = preferred.indexOf(buff);
      return index < 0 ? Infinity : index;
    };
    return battles.reduce((best, room) => rank(room) < rank(best) ? room : best);
  }

  function plan(cache, preferred = [], random = Math.random, preferredTeam = null) {
    const session = cache?.towerSession?.data;
    const status = cache?.towerStatus?.data;
    if (session?.completed || status?.isCleared || status?.state === 'win') return { kind: 'complete' };
    if (!session || !Number.isInteger(session.floorNumber) || !session.rooms ||
        !cache?.towerSession?.updatedAt || !Number.isFinite(Date.parse(cache.towerSession.updatedAt))) {
      return { kind: 'need-snapshot' };
    }
    const rooms = session.rooms;
    const roomNumber = Number(session.roomNumber) || 0;
    const room = rooms[roomNumber];
    const history = session.history || [];
    if (roomNumber === 0) {
      const choice = chooseBattleRoom(rooms, preferred, history, session.floorNumber);
      if (choice) {
        return { kind: 'rpc', call: { name: 'magicTower_enterRoom',
          args: { number: Number(choice.roomNumber) } }, floor: session.floorNumber,
          room: Number(choice.roomNumber) };
      }
      const wonOnFloor = history.some((e) => e.action === 'endBattle' && e.floor === session.floorNumber && e.win);
      const isBossFloor = Object.values(rooms).some((r) => r?.type === 'boss_battle');
      if (wonOnFloor && (isBossFloor || session.floorNumber >= 20)) {
        return { kind: 'complete' };
      }
      return { kind: 'stop', reason: 'No available Tower battle room.' };
    }
    if (!room) return { kind: 'need-snapshot' };
    if (room.type === 'hero_battle' || room.type === 'boss_battle') {
      const team = (Array.isArray(preferredTeam) && preferredTeam.length === 5 && preferredTeam.every(Number.isInteger))
        ? preferredTeam
        : cache?.teamGetAll?.data?.magicTower;
      if (!Array.isArray(team) || team.length !== 5 || team.some((id) => !Number.isInteger(id))) {
        return { kind: 'stop', reason: 'Saved magicTower team is missing or invalid. Select 5 heroes in Tower settings.' };
      }
      return { kind: 'battle', team, skipState: status?.skipState ?? null,
        floor: session.floorNumber, room: roomNumber };
    }
    if (room.type === 'buffs') {
      const chosen = history.some((event) => event.action === 'activateBuff' &&
        event.floor === session.floorNumber && event.room === roomNumber);
      if (chosen || !room.buffs?.length) {
        return { kind: 'rpc', call: { name: 'magicTower_enterNextFloor', args: {} },
          floor: session.floorNumber, room: roomNumber };
      }
      const buffId = chooseBuff(room.buffs, preferred);
      return buffId == null ? { kind: 'rpc', call: { name: 'magicTower_enterNextFloor', args: {} },
        floor: session.floorNumber, room: roomNumber } :
        { kind: 'rpc', call: { name: 'magicTower_activateBuff', args: { id: buffId } },
          floor: session.floorNumber, room: roomNumber };
    }
    if (room.type === 'chests') {
      const opened = history.some((event) => event.action === 'openChest' &&
        event.floor === session.floorNumber && event.room === roomNumber);
      if (opened) return { kind: 'rpc', call: { name: 'magicTower_enterNextFloor', args: {} },
        floor: session.floorNumber, room: roomNumber };
      const free = Object.entries(room.openCosts || {}).filter(([number, cost]) =>
        cost === null && room.openChests?.[number] == null).map(([number]) => Number(number));
      if (!free.length) return { kind: 'stop', reason: 'No unopened free Tower chest.' };
      const choice = free[Math.min(free.length - 1, Math.max(0, Math.floor(random() * free.length)))];
      return { kind: 'rpc', call: { name: 'magicTower_openChest', args: { number: choice } },
        floor: session.floorNumber, room: roomNumber };
    }
    return { kind: 'stop', reason: `Unsupported Tower room type: ${room.type || 'unknown'}.` };
  }

  globalThis.hwaHelperTowerAutomation = { plan, priorityOrder, chooseBuff, chooseBattleRoom };
})();
