const patterns = {
  lootboxChanced: /^STRATEGIC_LOOTBOX_CHANCED_(\d+)_NAME$/,
  lootboxChoiced: /^STRATEGIC_LOOTBOX_CHOICED_(\d+)_NAME$/,
  material: /^STRATEGIC_RESOURCE_(\d+)_NAME$/,
  speedUpConstruction: /^STRATEGIC_SPEED_UP_CONSTRUCTION_(\d+)_NAME$/,
  speedUpResearch: /^STRATEGIC_SPEED_UP_RESEARCH_(\d+)_NAME$/,
  speedUpUniversal: /^STRATEGIC_SPEED_UP_UNIVERSAL_(\d+)_NAME$/,
  speedUpUnitTraining: /^STRATEGIC_SPEED_UP_UNIT_TRAINING_(\d+)_NAME$/,
  speedUpUnitHealing: /^STRATEGIC_SPEED_UP_UNIT_HEALING_(\d+)_NAME$/,
  teleporter: /^STRATEGIC_TELEPORTER_(\d+)_NAME$/,
};

export function extractStrategicResourceNames(locale) {
  const names = Object.fromEntries(Object.keys(patterns).map(category => [category, {}]));
  for (const [key, value] of Object.entries(locale)) {
    if (typeof value !== 'string' || !value.trim() || /^(?:LIB|STRATEGIC)_[A-Z0-9_]+$/.test(value.trim())) continue;
    for (const [category, pattern] of Object.entries(patterns)) {
      const match = pattern.exec(key);
      if (match) { names[category][match[1]] = value.trim(); break; }
    }
  }
  return names;
}
