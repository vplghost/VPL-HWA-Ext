import '../../extension/item-resources.js';

const aliases: Record<string, string> = {
  fragmentHero: 'heroes', fragmentTitan: 'titans', fragmentGear: 'gear',
  fragmentScroll: 'scroll', fragmentArtifact: 'artifact', fragmentSkin: 'skin',
};

export function getItemIcon(category: string, id: string | number): string | null {
  const path = (globalThis as any).hwaHelperItemResources?.icons?.[aliases[category] || category]?.[String(id)];
  return typeof path === 'string' && /^assets\/(?:items\/[\w-]+|heroes|titans)\/\d+\.png$/.test(path) ? path : null;
}

export function isInactiveResource(entry: { key?: string } | undefined, now = Date.now()): boolean {
  const [namespace, category, id = '0'] = entry?.key?.split(':') || [];
  if (namespace !== 'resource') return false;
  const metadata = (globalThis as any).hwaHelperItemResources?.items?.[category || '']?.[id];
  return metadata?.internal === true || (Number.isFinite(metadata?.expiresAt) && metadata.expiresAt <= now);
}

export function getResourceIcon(entry: { key?: string } | undefined): string | null {
  const [namespace, category, id = '0'] = entry?.key?.split(':') || [];
  if (namespace !== 'resource') return null;
  return category ? getItemIcon(category, id) : null;
}
