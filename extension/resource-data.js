(() => {
  function amountAt(entry, now = Date.now()) {
    const data = entry?.data;
    if (!Number.isFinite(data?.amount)) return null;
    const { lastRefillAt, refillEveryMs, refillAmount, cap } = data;
    if (!Number.isFinite(lastRefillAt) || !Number.isFinite(refillEveryMs) ||
        refillEveryMs <= 0 || !Number.isFinite(refillAmount) || refillAmount <= 0 ||
        !Number.isFinite(cap)) return data.amount;
    if (data.amount >= cap) return data.amount;
    const elapsed = Math.max(0, now - lastRefillAt);
    return Math.min(cap, data.amount + Math.floor(elapsed / refillEveryMs) * refillAmount);
  }

  function nextRefillSeconds(entry, now = Date.now()) {
    const data = entry?.data;
    if (!Number.isFinite(data?.lastRefillAt) || !Number.isFinite(data.refillEveryMs) ||
        data.refillEveryMs <= 0 || !Number.isFinite(data.cap) ||
        amountAt(entry, now) >= data.cap) return null;
    const elapsed = Math.max(0, now - data.lastRefillAt);
    const remainder = elapsed % data.refillEveryMs;
    return Math.ceil((data.refillEveryMs - remainder) / 1000);
  }

  function minutesSeconds(seconds) {
    if (seconds == null) return '—';
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function remainingMinutes(entry, now = Date.now()) {
    const queues = entry?.data?.queues;
    if (!Array.isArray(queues) || !queues.length) return null;
    const ends = queues.map((queue) => queue.startDate + queue.durationMs)
      .filter((end) => Number.isFinite(end) && end > now);
    if (!ends.length) return null;
    return Math.ceil((Math.min(...ends) - now) / 60000);
  }

  function hoursMinutes(minutes) {
    if (minutes == null) return '—';
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  globalThis.hwaHelperResourceData = { amountAt, nextRefillSeconds, minutesSeconds,
    remainingMinutes, hoursMinutes };
})();
