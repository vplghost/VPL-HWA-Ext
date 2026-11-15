import type { CacheEntry, RpcRecord } from '../../../types';

export function normalizeIncomingAttack(raw: Record<string, any>): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || typeof raw.routeId !== 'string') return null;
  const startedAt = Number(raw.startedAt || 0);
  const duration = Number(raw.durationMs ?? raw.duration ?? 0);
  return {
    routeId: raw.routeId,
    attackerId: raw.attackerId ? String(raw.attackerId) : null,
    targetMineId: raw.targetMineId ? String(raw.targetMineId) : null,
    startedAt,
    arriveAt: startedAt + duration,
    version: Number(raw.version || 1),
    enemySquadIds: (raw.squads || [])
      .map((row: any) => row?.squad?.squadId)
      .filter((id: any): id is string => typeof id === 'string')
  };
}

export function rallyTeam(squad: any): { heroes?: any[]; titans?: any[] } {
  if (!squad || typeof squad !== 'object') return {};
  const heroes = squad.heroes || squad.heroList || [];
  const titans = squad.titans || squad.titanList || [];
  return {
    heroes: Array.isArray(heroes) ? heroes : Object.values(heroes),
    titans: Array.isArray(titans) ? titans : Object.values(titans)
  };
}

export function extractSocket(record: RpcRecord): CacheEntry[] {
  if (
    record?.transport !== 'websocket' ||
    record.direction !== 'received' ||
    record.encoding !== 'utf8' ||
    record.payloadTruncated ||
    record.endpoint !== 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt'
  ) {
    return [];
  }
  try {
    const payloadStr = typeof record.payload === 'string' ? record.payload : '';
    const message = JSON.parse(payloadStr);
    const type = message?.result?.type;
    const body = message?.result?.body;
    if (!body || typeof body !== 'object') return [];
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : new Date(record.timestamp || Date.now()).toISOString();
    const entry = (key: string, group: string, data: any, feature: string | null = null): CacheEntry => ({
      key,
      method: type,
      feature,
      group,
      data,
      updatedAt: timestamp
    });

    if (type === 'marchAttackDetected') {
      const attack = normalizeIncomingAttack(body);
      return attack
        ? [entry('incomingMineAction', 'internal', { action: 'detected', accountId: body.pushUserId, attacks: [attack] })]
        : [];
    }
    if (type === 'marchAttackEnded' && typeof body.squadId === 'string') {
      return [
        entry('incomingMineAction', 'internal', {
          action: 'ended',
          accountId: body.pushUserId,
          enemySquadId: body.squadId,
          mapId: body.mapId
        })
      ];
    }
    if (type === 'routeCompleted' && typeof body.routeId === 'string') {
      return [entry('incomingMineAction', 'internal', { action: 'routeEnded', routeId: body.routeId })];
    }
    if (type === 'gatheringMineCompleted' && typeof body.mineId === 'string') {
      const actions = [
        entry('incomingMineAction', 'internal', { action: 'mineEnded', accountId: body.pushUserId, mineId: body.mineId })
      ];
      const route = body.routeToOutpost;
      const duration = route?.durationMs ?? route?.duration;
      if (
        typeof body.squadId === 'string' &&
        typeof route?.routeId === 'string' &&
        route.from?.object?.objectId === body.mineId &&
        route.to?.object?.objectType === 'outpost' &&
        Number.isFinite(route.startedAt) &&
        Number.isFinite(duration) &&
        duration >= 0
      ) {
        actions.push(
          entry('mineMarchAction', 'internal', {
            accountId: body.pushUserId,
            action: 'returning',
            mineId: body.mineId,
            squadId: body.squadId,
            routeId: route.routeId,
            startedAt: route.startedAt,
            returnAt: route.startedAt + duration
          })
        );
      }
      return actions;
    }
    if (type === 'returnFromMineCompleted' && typeof body.squadId === 'string') {
      return [entry('mineMarchAction', 'internal', { accountId: body.pushUserId, action: 'returned', squadId: body.squadId })];
    }
    if (type === 'specialQuestEvents' && Array.isArray(body.events)) {
      return [
        entry('specialQuestStatus', 'events', {
          events: body.events,
          accountId: body.pushUserId ?? null
        })
      ];
    }
    if (type === 'chatMessage' && body.chatType === 'clan' && body.id && body.userId) {
      const { id, userId, messageType, chatType, ctime, data, user } = body;
      return [
        entry(
          'guildChat',
          'chat',
          {
            messages: [{ id: String(id), userId: String(userId), messageType, chatType, ctime: String(ctime), data }],
            users: user ? { [String(userId)]: user } : {}
          },
          'clan'
        )
      ];
    }
    if (type === 'newReport' && typeof body.reportId === 'string') {
      return [
        entry(
          'mailStatus',
          'header',
          {
            reports: [
              {
                id: body.reportId,
                type: body.type || null,
                read: false,
                claimedReward: false,
                createdAt: Number.isFinite(body.pushTs) ? body.pushTs * 1000 : Date.parse(timestamp)
              }
            ]
          },
          'report'
        )
      ];
    }
    if (type === 'mobRallyAttackResult' && typeof body.squadId === 'string' && typeof body.rallyId === 'string') {
      const route = body.routeToOutpost;
      const duration = route?.durationMs ?? route?.duration;
      return [
        entry('rallyAction', 'internal', {
          action: 'socketResult',
          squadId: body.squadId,
          rallyId: body.rallyId,
          returnRouteId: route?.routeId,
          mobConfigId: body.mobConfigId,
          result: body.battleResult?.battleResult,
          returnAt: Number.isFinite(route?.startedAt) && Number.isFinite(duration) ? route.startedAt + duration : null
        })
      ];
    }
    if (type === 'rallyUserAutojoined' && typeof body.rallyId === 'string' && typeof body.squad?.squadId === 'string') {
      const route = body.route;
      const duration = route?.durationMs ?? route?.duration;
      return [
        entry('rallyAction', 'internal', {
          action: 'socketAutojoined',
          rallyId: body.rallyId,
          squadId: body.squad.squadId,
          team: rallyTeam(body.squad),
          endsAt: Number.isFinite(route?.startedAt) && Number.isFinite(duration) ? route.startedAt + duration : null
        })
      ];
    }
    if (type === 'returnFromMobCompleted' && typeof body.squadId === 'string') {
      return [entry('rallyAction', 'internal', { action: 'socketReturnCompleted', squadId: body.squadId })];
    }
    return [];
  } catch (_) {
    return [];
  }
}
