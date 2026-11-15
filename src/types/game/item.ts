export type ItemCategory =
  | 'artifact'
  | 'border'
  | 'coin'
  | 'consumable'
  | 'energy'
  | 'gear'
  | 'gold'
  | 'heroes'
  | 'lootboxChanced'
  | 'lootboxChoiced'
  | 'material'
  | 'patron'
  | 'refillable'
  | 'scroll'
  | 'skin'
  | 'speedUpConstruction'
  | 'speedUpResearch'
  | 'speedUpUnitHealing'
  | 'speedUpUnitTraining'
  | 'speedUpUniversal'
  | 'starMoney'
  | 'teleporter'
  | 'titans'
  | 'fragmentHero'
  | 'fragmentTitan'
  | 'fragmentGear'
  | 'fragmentScroll'
  | 'fragmentArtifact'
  | 'fragmentSkin'
  | string;

export interface ItemResourceMetadata {
  name?: string;
  icon?: string;
  internal?: boolean;
  expiresAt?: number;
  [key: string]: any;
}

export interface ItemResourcesData {
  icons: Record<string, Record<string, string>>;
  items: Record<string, Record<string, ItemResourceMetadata>>;
  source?: Record<string, any>;
}

export interface NameDataGroup {
  assetUrl?: string;
  assetMd5?: string;
  assetSize?: number;
  clientVersion?: string;
  indexCapturedAt?: string;
  names: Record<string, Record<string, string>>;
}
