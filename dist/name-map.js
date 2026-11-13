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
  function artifact(id) { return lookup('artifact', id); }
  function building(id) { return lookup('building', id) || (id ? `Building #${id}` : null); }
  function research(id) { return lookup('research', id) || (id ? `Research #${id}` : null); }
  function item(category, id) {
    const group = itemGroups[category] || category;
    const name = group && lookup(group, id);
    return name ? (category.startsWith('fragment') ? `${name} fragment` : name) : null;
  }
  globalThis.hwaHelperNameMap = { hero, item, building, research, artifact };
})();
