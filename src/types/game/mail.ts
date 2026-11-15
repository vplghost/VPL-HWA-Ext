export interface MailRewardItem {
  key: string;
  amount: number;
}

export interface MailLetterRow {
  id: string | number;
  expiresAtMs: number | null;
  rewards: MailRewardItem[];
  unclaimed: boolean;
  canClaim: boolean;
  [key: string]: any;
}

export interface MailReportRow {
  id: string | number;
  type?: string;
  expiresAtMs: number | null;
  rewards: MailRewardItem[];
  unclaimed: boolean;
  canClaim: boolean;
  [key: string]: any;
}

export interface MailRowsResult {
  letters: MailLetterRow[];
  reports: MailReportRow[];
  scoped: boolean;
}

export interface MailCounts {
  unclaimedLettersCount: number;
  unclaimedReportsCount: number;
  totalUnclaimed: number;
  hasUnclaimed: boolean;
  hasUnclaimedLetters: boolean;
  hasUnclaimedReports: boolean;
}

export interface MailReportGroup {
  type: string;
  label: string;
  count: number;
  expiresAtMs: number | null;
  canClaim: boolean;
  rewards: MailRewardItem[];
}

export interface MailDailyReport {
  day: string;
  total: number;
  wins: number;
  losses: number;
  types: Array<{ type: string; count: number; label: string }>;
  rewards: MailRewardItem[];
  [key: string]: any;
}

export interface MailClaimValidation {
  kind: 'letters' | 'reports';
  ids?: string[];
  types?: string[];
}
