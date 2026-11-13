export function formatDuration(sec: number): string {
  if (sec <= 0) return 'Ready';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatFinishTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '—';
  if (date.toDateString() === new Date(now).toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString([], { month: 'short', day: 'numeric',
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' as const } : {}),
    hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(num: number | string | null | undefined): string {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString();
}

export function formatCompact(num: number | string | null | undefined): string {
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString();
}
