export interface DraftHeroCandidate {
  id: number;
  name: string;
  avatarFile?: string;
  role?: string;
  class?: string;
  faction?: string;
  mainStat?: string;
  picked?: boolean;
}

export interface DraftDto {
  gameTimeTs?: number;
  stageFinishTs?: number;
  playerTeam?: {
    heroes: number[][]; // 5 steps x 3 candidate IDs
  };
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
  chosenDefenceHeroes: number[];
  chosenAttackHeroes: number[];
  rawCiphertext?: string | null;
  rawDecrypted?: string | null;
  error?: string | null;
  errorDetail?: string | null;
  updatedAt: number;
}
