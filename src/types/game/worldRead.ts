export interface WorldReadEntry {
  call: any;
  tabId?: number;
  after: number;
  version?: number | null;
  sentVersion?: number | null;
  sentAt: number;
  until: number;
  pending: boolean;
}

export interface WorldReadState {
  accountId: string | null;
  entries: Record<string, WorldReadEntry>;
}

export interface WorldReadPlanOptions {
  tabId?: number;
  after?: number;
  version?: number | null;
  isRallyCreated?: boolean;
}

export interface WorldReadPlanResult {
  state: WorldReadState;
  calls: any[];
  wakeAt: number | null;
}
