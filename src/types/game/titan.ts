export type TitanRole = 'Tank' | 'Marksman' | 'Support' | 'Supertitan' | string;
export type TitanElement = 'Water' | 'Fire' | 'Earth' | 'Light' | 'Dark' | 'Spirit' | string;

export interface TitanMetadataItem {
  name: string;
  role?: TitanRole;
  element?: TitanElement;
  hasAvatar?: boolean;
  avatarFile?: string;
  artifacts?: number[];
  skills?: string[];
  [key: string]: any;
}

export type TitanMetadataDict = Record<string | number, TitanMetadataItem>;
export type TitanArtifactEvolveCostDict = Record<string | number, number>;
export type TitanArtifactLevelCost = [fragments: number, gold: number] | null;
