globalThis.hwaHelperNextExportName = async (storage, date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  const minute = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
  const previous = await storage.get(['hwaExportMinute', 'hwaExportSequence']);
  const sequence = previous.hwaExportMinute === minute ? (previous.hwaExportSequence || 0) + 1 : 1;
  await storage.set({ hwaExportMinute: minute, hwaExportSequence: sequence });
  return `hwa-api-${minute}${sequence > 1 ? `-${sequence}` : ''}.json`;
};
