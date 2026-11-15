export type HeroRole = 'Front' | 'Middle' | 'Back' | string;
export type HeroClass = 'Tank' | 'Warrior' | 'Mage' | 'Support' | 'Marksman' | 'Control' | string;
export type HeroFaction =
  | 'Way of Nature'
  | 'Way of Mystery'
  | 'Way of Progress'
  | 'Way of Eternity'
  | 'Way of Chaos'
  | 'Way of Honor'
  | string;

export interface HeroMetadataItem {
  name: string;
  role?: HeroRole;
  class?: HeroClass;
  faction?: HeroFaction;
  hasAvatar?: boolean;
  avatarFile?: string;
  skills?: string[];
  equipment?: Record<string | number, number[]>;
  fragmentCount?: number;
  gold?: number;
  [key: string]: any;
}

export type HeroMetadataDict = Record<string | number, HeroMetadataItem>;
export type HeroGlyphsDict = Record<string | number, string[]>;
export type SkinStatsDict = Record<string | number, string>;
