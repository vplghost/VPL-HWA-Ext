export interface DraftHeroLiveStats {
  id: number;
  level?: number;
  color?: number;
  star?: number;
  power?: number;
  pool?: 'base' | 'swap';
}

export interface DraftHeroCandidate {
  id: number;
  name: string;
  avatarFile?: string;
  role?: string;
  class?: string;
  faction?: string;
  mainStat?: string;
  picked?: boolean;
  level?: number;
  color?: number;
  star?: number;
  power?: number;
  pool?: 'base' | 'swap';
}

export interface DraftDto {
  gameTimeTs?: number;
  stageFinishTs?: number;
  playerTeam?: {
    heroes: number[][]; // 5 steps x 3 candidate IDs
  };
  base?: Record<string, any> | any[] | null;
  swap?: Record<string, any> | any[] | null;
  chosenDefenceHeroes?: number[];
  chosenAttackHeroes?: number[];
  swappedRows?: any[];
}

export interface DraftEnemyUser {
  id?: string;
  name?: string;
  level?: string | number;
  clanTitle?: string;
  avatarId?: number;
}

export interface DraftSessionData {
  matchId: number | null;
  stageId: number | null; // 1: matching, 2: defense, 3: def submitted, 4: attack, 5: ready, 7: result
  phase: 'defense' | 'attack' | 'ready' | 'result' | 'idle';
  phaseLabel: string;
  stageFinishTs: number | null;
  gameTimeTs: number | null;
  userRating: number | null;
  enemyRating?: number | null;
  enemyUser: DraftEnemyUser | null;
  heroSteps: number[][]; // 5 columns (rounds 1-5), each with 3 hero IDs
  swapHeroIds?: number[]; // Optional swap pool hero IDs from decrypted { base, swap } payload
  heroDetails?: Record<number, DraftHeroLiveStats>; // Per-hero live stats (power, star, level, color)
  enemyHeroes?: DraftHeroLiveStats[]; // Decrypted enemy team heroes from draftEnemy (Stage 2 / Stage 4)
  chosenDefenceHeroes: number[];
  chosenAttackHeroes: number[];
  rawCiphertext?: string | null;
  rawEnemyCiphertext?: string | null;
  rawDecrypted?: string | null;
  rawEnemyDecrypted?: string | null;
  decryptMethod?: string | null;
  error?: string | null;
  errorDetail?: string | null;
  updatedAt: number;
}
