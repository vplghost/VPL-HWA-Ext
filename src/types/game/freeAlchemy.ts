export interface FreeAlchemyDayInfo {
  next: number;
  start: number;
}

export interface FreeAlchemyAvailability {
  ready: boolean;
  readyAt: number;
  remainingSeconds: number;
}

export interface FreeAlchemyPolicy {
  availability: (cache: Record<string, any>, now?: number) => FreeAlchemyAvailability;
  day: (cache: Record<string, any>, now: number) => FreeAlchemyDayInfo;
  cycle: (cache: Record<string, any>, now: number) => string;
}
