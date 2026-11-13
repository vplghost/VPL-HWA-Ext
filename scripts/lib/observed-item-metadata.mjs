import { indexedRows } from '../generate-tower-rules.mjs';

const text = value => Buffer.isBuffer(value) ? value.toString('utf8') : null;
const clean = value => typeof value === 'string' && value.trim() && !/^(LIB|STRATEGIC)_[A-Z0-9_]+$/.test(value)
  ? value.trim() : null;

export function skinMetadata(bytes, locale, heroNames) {
  // skin.pb appends additional non-row indexes. Validate/decode only the indexed
  // row region specified by its header, never interpret that tail as more skins.
  const end = 8 + bytes.readUInt32LE(0) + bytes.readUInt32LE(4);
  const result = {};
  for (const [id, row] of indexedRows(bytes.subarray(0, end))) {
    const heroId = row.get(2)?.[0], titleKey = text(row.get(5)?.[0]);
    const title = clean(locale[titleKey]), hero = clean(heroNames[heroId]);
    result[id] = { ...(title && hero ? { name: `${hero} ${title}` } : {}),
      texture: text(row.get(7)?.[0]), heroId, titleKey };
  }
  return result;
}

export function patronName(row, locale, heroNames) {
  if (row?.ident === 'universal') return clean(locale.PATRON_UNIVERSAL_ITEM_NAME);
  const heroId = /^hero_(\d+)$/.exec(row?.ident || '')?.[1];
  const hero = clean(heroNames[heroId]), template = clean(locale.LIB_PATRON_NAME);
  return hero && template?.includes('%param1%') ? template.replace('%param1%', hero) : null;
}

export function refillableMetadata(row, pseudo, locale) {
  const ident = row.ident || '';
  const date = row.expiresAt && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row.expiresAt)
    ? Date.parse(row.expiresAt.replace(' ', 'T') + 'Z') : NaN;
  const specific = `LIB_PSEUDO_${ident.toUpperCase()}_${row.id}`;
  const common = `LIB_PSEUDO_${ident.toUpperCase()}`;
  const name = clean(locale[specific]) || clean(locale[common]);
  const candidates = Object.values(pseudo).filter(value => value.constName?.toLowerCase() === ident.toLowerCase());
  const icon = ident === 'refillable_energy' ? pseudo[row.id] : candidates.length === 1 ? candidates[0] : null;
  return { ident, ...(name ? { name } : {}), ...(Number.isFinite(date) ? { expiresAt: date } : {}),
    ...(/^shopReset_|(?:_cooldown|Cooldown)$/.test(ident) ? { internal: true } : {}), icon };
}

// Select only actual paths listed in a verified manifest. Metadata texture names
// take priority. Scoped strategic keys encode both the resource type and ID;
// there is no arithmetic mapping of item IDs to an unrelated texture number.
export function selectItemTexture(manifest, category, id, metadata = {}, localizedName = '') {
  metadata ||= {};
  const keys = Object.keys(manifest);
  const textures = [metadata.icon?.imagePath, metadata.resourceIcon?.imagePath,
    metadata.texture, metadata.assetTexture].filter(Boolean).map(name => name.replace(/\.png$/i, '') + '.img');
  for (const filename of textures) {
    const matches = keys.filter(key => key.startsWith('extends/') && key.endsWith('/' + filename));
    if (matches.length === 1) return { key: matches[0], mapping: 'metadata-texture' };
  }
  const types = { lootboxChanced: 'strategic_lootbox_chanced', lootboxChoiced: 'strategic_lootbox_choiced',
    speedUpConstruction: 'speed_up_construction', speedUpResearch: 'speed_up_research',
    speedUpUniversal: 'speed_up_universal', speedUpUnitTraining: 'speed_up_unit_training',
    speedUpUnitHealing: 'speed_up_unit_healing', teleporter: 'strategic_teleporter' };
  if (types[category]) for (const suffix of ['_icon.img', '_resource_icon.img']) {
    const matches = keys.filter(key => key.startsWith('extends/strategic/') && key.endsWith(`/${types[category]}_${id}${suffix}`));
    if (matches.length === 1) return { key: matches[0], mapping: 'manifest-typed-resource-id' };
  }
  if (category === 'material') {
    const semantic = { Wood: 'wood', Food: 'food', Stone: 'stone', Iron: 'iron', Elarite: 'elarite', Blueprints: 'blueprint' }[localizedName];
    const key = semantic && `extends/strategic/materials/material_${semantic}_icon.img`;
    if (key && manifest[key]) return { key, mapping: 'manifest-exact-resource-name' };
  }
  return null;
}
