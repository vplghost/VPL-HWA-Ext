(() => {
  const rules = globalThis.hwaHelperProductionRules;
  const bonusById = new Map(rules.bonusRows.map(([id, materialId, kind, value, percentage]) =>
    [id, { materialId, kind, value, percentage }]));
  const producerByMaterial = { 4: 1, 5: 2, 3: 3, 2: 4 };

  function ratePerMinute(cache, materialId) {
    const config = cache.productionConfigStatus?.data;
    if (config?.bonusUrl !== rules.bonusUrl || config?.campaignUrl !== rules.campaignUrl) return null;
    if (materialId === 1) {
      const completed = new Set(cache.missionProgressStatus?.data?.completed);
      if (!completed.size) return null;
      const rate = rules.campaignRows.filter(([mission]) => mission === 0 || completed.has(mission))
        .reduce((latest, [, perSecond]) => perSecond, null);
      return Number.isFinite(rate) ? rate * 60 : null;
    }
    const producerId = producerByMaterial[materialId];
    const producer = cache.productionStatus?.data?.producers?.find((item) => item.id === producerId);
    const active = cache.productionBonusStatus?.data?.bonuses;
    if (!producer || !Array.isArray(active)) return null;
    const totals = { main: 0, optional: 0, stations: 0, capacity: 1, percent: 0 };
    for (const [id, count] of active) {
      const bonus = bonusById.get(id);
      if (bonus?.materialId !== materialId || !Number.isFinite(count)) continue;
      if (bonus.percentage) totals.percent += bonus.value * count;
      else totals[bonus.kind] += bonus.value * count;
    }
    // The observed log has every resident slot occupied. Partial staffing needs separate validation.
    if (producer.residentCount !== totals.capacity || totals.stations < 1) return null;
    const perSecond = (totals.main + totals.stations * totals.optional) *
      (1 + totals.percent / 100);
    return Number.isFinite(perSecond) && perSecond >= 0 ? perSecond * 60 : null;
  }

  globalThis.hwaHelperProductionData = { ratePerMinute };
})();
