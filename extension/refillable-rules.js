// From Hero Wars: Alliance webgl 1.292.0 splitlib/refillable.json and level_teamDelta.json.
// Only counters with an identified automatic refill are eligible for the header.
(() => {
  const rules = {
    1: { label: 'Energy', interval: 360000, capFromTeamLevel: true },
    2: { label: 'Skill Points', interval: 300000, cap: 10 },
    3: { label: 'Bronze Free Chest', interval: 600000, cap: 1 },
    4: { label: 'Gold Free Chest', interval: 129600000, cap: 1 },
    35: { label: 'Diamond Free Chest', interval: 259200000, cap: 1 },
    40: { label: 'Blue Egg Chest', interval: 600000, cap: 1 },
    41: { label: 'Purple Egg Chest', interval: 14400000, cap: 1 },
    43: { label: 'Blue Easter Chest', interval: 600000, cap: 1 },
    44: { label: 'Purple Easter Chest', interval: 7200000, cap: 1 },
    58: { label: 'Sky Arena Fuel', interval: 900000, cap: 200 },
    59: { label: 'Adventure Energy', interval: 3600000, cap: 50 },
    60: { label: 'Draft Chips', interval: 10800000, cap: 5 },
    61: { label: 'Event Energy #61', interval: 3600000, cap: 100 },
    68: { label: 'Event Boss Battles', interval: 1800000, cap: 5 }
  };
  for (const id of [64, 66, 67, 69, 70, 71, 72, 75, 76, 77, 79, 80, 81, 82,
    83, 84, 85, 86, 87, 506, 507, 508, 509, 510, 511, 512]) {
    rules[id] = { label: `Event Energy #${id}`, interval: 3600000, cap: 200 };
  }
  globalThis.hwaHelperRefillableRules = rules;
})();
