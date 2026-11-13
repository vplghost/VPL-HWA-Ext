// Remote config uses .NET TimeSpan strings: [days.]hours:minutes:seconds.
export function parseRemoteDurationSeconds(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds) && seconds >= 0) return seconds;
    throw Error('Invalid duration seconds: ' + value);
  }
  if (typeof value !== 'string') throw Error('Invalid duration type');
  const match = /^(?:(\d+)\.)?(\d+):([0-5]\d):([0-5]\d)$/.exec(value);
  const short = /^(\d+):([0-5]\d)$/.exec(value);
  if (!match && !short) throw Error('Invalid remote duration: ' + value);
  if (match?.[1] != null && Number(match[2]) >= 24) throw Error('Invalid day duration hours: ' + value);
  const seconds = match
    ? Number(match[1] || 0) * 86400 + Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4])
    : Number(short[1]) * 60 + Number(short[2]);
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw Error('Unsafe duration: ' + value);
  return seconds;
}
