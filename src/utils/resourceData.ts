export interface ResourceEntry {
  data?: {
    amount?: number;
    lastRefillAt?: number;
    refillEveryMs?: number;
    refillAmount?: number;
    cap?: number;
    [key: string]: any;
  };
}

export function formatResourceAmount(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) return '—';
  if (Math.abs(value) < 1_000_000) return value.toLocaleString('en-US');
  const roundedMillions = Math.round(Math.abs(value) / 100_000);
  const unit = Math.abs(value) >= 1_000_000_000 || roundedMillions >= 10_000 ? 1_000_000_000 : 1_000_000;
  const suffix = unit === 1_000_000_000 ? 'B' : 'M';
  return `${(value / unit).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}${suffix}`;
}

export function getAmountAt(entry: ResourceEntry | undefined, now = Date.now()): number | null {
  const data = entry?.data;
  if (!Number.isFinite(data?.amount)) return null;
  const { lastRefillAt, refillEveryMs, refillAmount, cap } = data!;
  if (
    !Number.isFinite(lastRefillAt) ||
    !Number.isFinite(refillEveryMs) ||
    (refillEveryMs || 0) <= 0 ||
    !Number.isFinite(refillAmount) ||
    (refillAmount || 0) <= 0 ||
    !Number.isFinite(cap)
  ) {
    return data!.amount!;
  }
  if (data!.amount! >= cap!) return data!.amount!;
  const elapsed = Math.max(0, now - lastRefillAt!);
  return Math.min(cap!, data!.amount! + Math.floor(elapsed / refillEveryMs!) * refillAmount!);
}

export function getNextRefillSeconds(entry: ResourceEntry | undefined, now = Date.now()): number | null {
  const data = entry?.data;
  if (
    !Number.isFinite(data?.lastRefillAt) ||
    !Number.isFinite(data?.refillEveryMs) ||
    (data?.refillEveryMs || 0) <= 0 ||
    !Number.isFinite(data?.cap)
  ) {
    return null;
  }
  const current = getAmountAt(entry, now);
  if (current === null || current >= data!.cap!) return null;

  const elapsed = Math.max(0, now - data!.lastRefillAt!);
  const remainder = elapsed % data!.refillEveryMs!;
  return Math.ceil((data!.refillEveryMs! - remainder) / 1000);
}
