(() => {
  const names = globalThis.hwaHelperNameData?.names || {};
  const itemGroups = {
    consumable: 'consumable', gear: 'gear', scroll: 'scroll', coin: 'coin',
    fragmentHero: 'hero', fragmentTitan: 'hero', fragmentGear: 'gear',
    fragmentScroll: 'scroll', fragmentArtifact: 'artifact', fragmentSkin: 'skin'
  };

  function lookup(group, id) {
    const entries = names[group];
    return entries && Object.hasOwn(entries, id) ? entries[id] : null;
  }
  function hero(id) { return lookup('hero', id); }
  function item(category, id) {
    const group = itemGroups[category];
    const name = group && lookup(group, id);
    return name ? (category.startsWith('fragment') ? `Mảnh ${name}` : name) : null;
  }
  globalThis.hwaHelperNameMap = { hero, item };
})();
