export interface RefillableRule {
  label: string;
  interval: number;
  cap?: number;
  capFromTeamLevel?: boolean;
}
