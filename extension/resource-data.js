(() => {
  function formatAmount(value) {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) < 1000000) return value.toLocaleString('en-US');
    const roundedMillions = Math.round(Math.abs(value) / 100000);
    const unit = Math.abs(value) >= 1000000000 || roundedMillions >= 10000 ?
      1000000000 : 1000000;
    const suffix = unit === 1000000000 ? 'B' : 'M';
    return `${(value / unit).toLocaleString('en-US', {
      minimumFractionDigits: 1, maximumFractionDigits: 1
    })}${suffix}`;
  }

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

  function refillDescription(entry, now = Date.now()) {
    const data = entry?.data;
    if (!Number.isFinite(data?.refillEveryMs) || data.refillEveryMs <= 0 ||
        !Number.isFinite(data.refillAmount) || data.refillAmount <= 0) return null;
    const perMinute = data.refillAmount * 60000 / data.refillEveryMs;
    if (perMinute >= 1) return `+${Number(perMinute.toFixed(2)).toLocaleString('en-US')}/min`;
    const next = nextRefillSeconds(entry, now);
    if (next != null) return `Next +${data.refillAmount} in ${minutesSeconds(next)}`;
    return Number.isFinite(data.cap) && amountAt(entry, now) >= data.cap ?
      'Full; refill resumes after spending' : 'Next refill time unavailable';
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
    remainingMinutes, hoursMinutes, formatAmount, refillDescription };
})();
