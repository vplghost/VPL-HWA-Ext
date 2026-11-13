export function questRefreshCalls() {
  return [
    { name: 'getDailyQuests', feature: 'quest', args: {} },
    { name: 'getSpecialQuestState', feature: 'quest', args: {} },
    { name: 'questGetAll' },
    { name: 'questGetEvents' },
  ];
}

export function questClaimCalls(questId: string | number | Array<string | number>) {
  return [
    { name: 'quest_multiFarm', args: { questIds: Array.isArray(questId) ? questId : [questId] } },
    { name: 'questGetAll' },
  ];
}

interface QuestClaimResponse { ok: boolean; queued?: boolean; error?: string }

/** Claim actions require their dedicated envelope to pass the background allowlist. */
export async function sendQuestClaim(
  questIds: string | number | Array<string | number>,
  send: (message: { kind: 'claim-rewards'; calls: ReturnType<typeof questClaimCalls> }) => Promise<unknown> =
    message => chrome.runtime.sendMessage(message),
): Promise<QuestClaimResponse> {
  try {
    const response = await send({ kind: 'claim-rewards', calls: questClaimCalls(questIds) });
    if (!response || typeof response !== 'object') return { ok: false, error: 'No response from reward claim.' };
    const result = response as QuestClaimResponse;
    return result.ok === true ? result : { ok: false, error: result.error || 'Reward claim rejected.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function towerSettingsForAccount(stored: unknown, accountId: unknown): { heroes?: number[]; buffPriority?: number[] } {
  if (!stored || typeof stored !== 'object' || accountId == null) return {};
  const value = stored as { accountId?: unknown; heroes?: unknown; buffPriority?: unknown };
  if (String(value.accountId) !== String(accountId)) return {};
  return {
    heroes: Array.isArray(value.heroes) ? value.heroes.map(Number).filter(Number.isFinite) : undefined,
    buffPriority: Array.isArray(value.buffPriority) ? value.buffPriority.map(Number).filter(Number.isFinite) : undefined,
  };
}

interface RaidResultEntry {
  updatedAt?: string;
  data?: { failed?: boolean; error?: string; currentDrops?: unknown; drops?: unknown };
}

/** A transport acknowledgement is not a completed game action. */
export async function waitForCampaignRaidResult(
  read: () => RaidResultEntry | undefined,
  previousUpdatedAt?: string,
  timeoutMs = 3500,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<{ ok: boolean; pending?: boolean; drops?: any; error?: string }> {
  const start = now();
  while (now() - start < timeoutMs) {
    const current = read();
    if (current?.updatedAt && current.updatedAt !== previousUpdatedAt) {
      if (current.data?.failed) return { ok: false, error: current.data.error || 'Raid failed' };
      return { ok: true, drops: current.data?.currentDrops || current.data?.drops };
    }
    await sleep(60);
  }
  return { ok: false, pending: true, error: 'Raid result is still pending. Wait for the game response before retrying.' };
}
