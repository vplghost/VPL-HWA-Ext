(() => {
  const DAY = 86400000, COOLDOWN = 28800000;
  function day(cache, now) {
    const reset = cache.questResetStatus?.data?.nextDayAt;
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    const next = Number.isFinite(reset) ? reset > now ? reset : reset + (Math.floor((now - reset) / DAY) + 1) * DAY : midnight.getTime();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    return { next, start: Number.isFinite(reset) ? next - DAY : startOfDay.getTime() };
  }
  function availability(cache, now = Date.now()) {
    const { next, start } = day(cache, now);
    const fresh = entry => Number.isFinite(Date.parse(entry?.updatedAt)) && Date.parse(entry.updatedAt) >= start && Date.parse(entry.updatedAt) <= now;
    const quota = cache['resource:refillable:53'], receipt = cache.freeAlchemySpinStatus;
    const hasReceipt = fresh(receipt) && Number.isFinite(receipt.data?.cooldownUntil);
    let readyAt = hasReceipt ? receipt.data.cooldownUntil : now;
    if (fresh(quota) && (!hasReceipt || Date.parse(quota.updatedAt) >= Date.parse(receipt.updatedAt))) {
      if (Number.isFinite(quota.data?.amount) && quota.data.amount > 0) readyAt = now;
      else if (quota.data?.amount === 0) readyAt = Number.isFinite(quota.data.lastRefillAt) ? quota.data.lastRefillAt + COOLDOWN : hasReceipt ? readyAt : next;
    }
    readyAt = Math.min(readyAt, next);
    const remainingSeconds = Math.max(0, Math.ceil((readyAt - now) / 1000));
    return { ready: remainingSeconds === 0, readyAt, remainingSeconds };
  }
  function cycle(cache, now) {
    return `${cache.accountStatus?.data?.id}:${day(cache, now).start}:${cache['resource:refillable:53']?.data?.lastRefillAt || 0}:${cache.freeAlchemySpinStatus?.data?.cooldownUntil || 0}`;
  }
  globalThis.hwaHelperFreeAlchemy = { availability, day, cycle };
})();
