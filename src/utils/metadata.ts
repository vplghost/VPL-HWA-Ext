import '~/extension/hero-metadata.js';
import '~/extension/titan-metadata.js';

export interface HeroMeta {
  name: string;
  role?: string;
  class?: string;
  faction?: string;
  hasAvatar?: boolean;
  avatarFile?: string;
  skills?: string[];
  equipment?: Record<string, number[]>;
}

export interface TitanMeta {
  name: string;
  role?: string;
  element?: string;
  hasAvatar?: boolean;
  avatarFile?: string;
  artifacts?: number[];
}

export function getHeroMetadata(heroId: number | string): HeroMeta | undefined {
  const metaMap = (globalThis as any).hwaHelperHeroMetadata;
  return metaMap?.[String(heroId)];
}

export function getAllHeroMetadata(): Record<string, HeroMeta> {
  return (globalThis as any).hwaHelperHeroMetadata || {};
}

export function getTitanMetadata(titanId: number | string): TitanMeta | undefined {
  const metaMap = (globalThis as any).hwaHelperTitanMetadata;
  return metaMap?.[String(titanId)];
}

export function getAllTitanMetadata(): Record<string, TitanMeta> {
  return (globalThis as any).hwaHelperTitanMetadata || {};
}
