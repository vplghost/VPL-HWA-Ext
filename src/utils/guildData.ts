const numeric = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function currentGuild(cache: Record<string, any>) {
  const data = cache.guildStatus?.data;
  const account = cache.accountStatus?.data?.id ?? cache.userGetInfo?.data?.id;
  return account != null && data?.accountId === String(account) ? data : null;
}

export function guildRole(member: any, guild: any): string {
  if (String(member.id) === String(guild.ownerId) || String(member.clanRole) === '255') return 'Guild Master';
  if (String(member.clanRole) === '4') return guild.roleNames?.officer || 'Officer';
  if (String(member.clanRole) === '3') return guild.roleNames?.member || 'Member';
  return 'Role unavailable';
}

export function guildMembers(cache: Record<string, any>) {
  const data = currentGuild(cache);
  if (!data?.guild) return [];
  return Object.entries(data.members || {}).map(([id, value]) => {
    const member = value as any, stats = member.stats || {}, outpost = data.outposts?.[id];
    const lastLogin = numeric(member.lastLoginTime);
    return {
      id, name: String(member.name || 'Unknown member'), level: numeric(member.level),
      server: member.serverId == null ? null : String(member.serverId),
      role: guildRole(member, data.guild), lastLoginAt: lastLogin == null || lastLogin <= 0 ? null : lastLogin * 1000,
      activityToday: numeric(stats.todayActivity), activityTotal: numeric(stats.activitySum),
      titaniteToday: numeric(stats.todayDungeonActivity), titaniteTotal: numeric(stats.dungeonActivitySum),
      wasChampion: stats.wasChampion === true,
      raidDamage: stats.raidDamage || {},
      raidDamageTotal: Object.keys(stats.raidDamage || {}).length ? Object.values(stats.raidDamage).reduce<number>((sum, value) => sum + Math.max(0, numeric(value) ?? 0), 0) : null,
      outpost: outpost || null,
      outpostLevel: numeric(outpost?.outpostLevel),
      coordinates: Number.isFinite(outpost?.coordinates?.x) && Number.isFinite(outpost?.coordinates?.y)
        ? { x: outpost.coordinates.x, y: outpost.coordinates.y } : null,
      observedAt: member.observedAt,
    };
  });
}
