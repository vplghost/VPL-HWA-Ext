const CACHE_KEY = 'rpcCache';
const view = document.querySelector('#view');
const status = document.querySelector('#status');
const search = document.querySelector('#search');
const itemGroup = document.querySelector('#item-group');
const logSort = document.querySelector('#log-sort');
const tabs = [...document.querySelectorAll('[data-tab]')];
let activeTab = 'heroes';
let settingsPending = Promise.resolve();
let renderTimer;
const sortState = {};

document.querySelector('#version').textContent = chrome.runtime.getManifest().version;
document.querySelector('#open-tab').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

const formatNumber = (value) => typeof value === 'number' ? value.toLocaleString() : '—';
const formatTime = (value) => value ? new Date(value).toLocaleString() : 'chưa có';
const byId = ([a], [b]) => Number(a) - Number(b);

function table(headings, rows) {
  const element = document.createElement('table');
  element.className = 'min-w-full border-collapse text-left text-xs';
  const header = document.createElement('tr');
  const selectedSort = sortState[activeTab];
  for (const [index, heading] of headings.entries()) {
    const cell = document.createElement('th');
    cell.className = 'sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-3 py-2 font-semibold whitespace-nowrap text-slate-700';
    cell.setAttribute('aria-sort', selectedSort?.column === index ?
      (selectedSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flex cursor-pointer items-center gap-1 text-left hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600';
    button.textContent = `${heading} ${selectedSort?.column === index ?
      (selectedSort.direction === 'asc' ? '↑' : '↓') : '↕'}`;
    button.addEventListener('click', () => {
      sortState[activeTab] = { column: index,
        direction: selectedSort?.column === index && selectedSort.direction === 'asc' ? 'desc' : 'asc' };
      render();
    });
    cell.append(button);
    header.append(cell);
  }
  element.append(header);
  const sortedRows = selectedSort ?
    globalThis.hwaHelperPopupData.sortRows(rows, selectedSort.column, selectedSort.direction) : rows;
  for (const values of sortedRows) {
    const line = document.createElement('tr');
    line.className = 'border-b border-slate-100 hover:bg-blue-50/50';
    for (const value of values) {
      const cell = document.createElement('td');
      cell.className = 'px-3 py-2 align-top text-slate-700';
      cell.textContent = String(value ?? '—');
      if (typeof value === 'number') cell.className += ' text-right tabular-nums';
      line.append(cell);
    }
    element.append(line);
  }
  return element;
}

function showEmpty(message) {
  const text = document.createElement('p');
  text.className = 'p-4 text-sm text-slate-500';
  text.textContent = message;
  view.append(text);
}

function matches(values) {
  const query = search.value.trim().toLocaleLowerCase();
  return !query || values.some((value) => String(value).toLocaleLowerCase().includes(query));
}

function showSnapshot(entry, headings, makeRows) {
  if (!entry?.data) {
    status.textContent = 'Chưa có cache. Dùng game bình thường để nhận RPC.';
    showEmpty('Chưa quan sát được RPC phù hợp.');
    return;
  }
  const rows = makeRows(entry.data).filter(matches);
  status.textContent = `${rows.length} dòng · Cập nhật ${formatTime(entry.updatedAt)}`;
  if (rows.length) view.append(table(headings, rows));
  else showEmpty('Không có dòng khớp bộ lọc.');
}

function renderLog(records, recordingState) {
  const recent = records.filter((record) => matches([record.endpoint, record.method]));
  if (logSort.value === 'oldest') recent.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  else if (logSort.value === 'duration-desc') recent.sort((a, b) => b.durationMs - a.durationMs);
  else if (logSort.value === 'duration-asc') recent.sort((a, b) => a.durationMs - b.durationMs);
  else recent.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  status.textContent = recordingState?.error ||
    `${records.length} request trong phiên trình duyệt · ${recordingState?.active ? 'Đang record' : 'Đã stop'}`;
  if (!recent.length) return showEmpty('Chưa có request phù hợp.');
  for (const record of recent) {
    const row = document.createElement('article');
    row.className = 'border-b border-slate-100 px-4 py-3 last:border-b-0';
    const summary = document.createElement('div');
    summary.className = 'flex flex-wrap items-baseline gap-2';
    const method = document.createElement('strong');
    method.className = 'font-semibold text-slate-800';
    method.textContent = record.method;
    const code = document.createElement('span');
    code.className = record.outcome === 'failed' ? 'font-semibold text-red-700' : 'text-slate-600';
    code.textContent = record.status === null ? record.outcome : String(record.status);
    const meta = document.createElement('span');
    meta.className = 'text-xs text-slate-500';
    meta.textContent = `${record.transport} · ${record.durationMs} ms · ${formatTime(record.timestamp)}`;
    summary.append(method, code, meta);
    const endpoint = document.createElement('div');
    endpoint.className = 'mt-1 break-all text-xs text-slate-600';
    endpoint.textContent = record.endpoint;
    row.append(summary, endpoint);
    if (record.method === 'POST') {
      const details = document.createElement('details');
      details.className = 'mt-2';
      const title = document.createElement('summary');
      title.className = 'cursor-pointer text-blue-700';
      const legacy = !Object.hasOwn(record, 'requestBody') && !Object.hasOwn(record, 'responseBody');
      title.textContent = legacy ? 'Log cũ: chưa có dữ liệu body' : 'Request / Response data';
      details.append(title);
      if (legacy) {
        const note = document.createElement('p');
        note.className = 'mt-2 text-slate-500';
        note.textContent = 'Bản ghi này có trước tính năng lưu body.';
        details.append(note);
      } else {
        for (const [label, field] of [['Request', 'requestBody'], ['Response', 'responseBody']]) {
          const heading = document.createElement('strong');
          heading.className = 'mt-2 block text-xs';
          heading.textContent = `${label}${record[`${field}Truncated`] ? ' (đã cắt bớt)' : ''}`;
          const body = document.createElement('pre');
          body.className = 'mt-1 max-h-44 overflow-auto rounded-lg bg-slate-100 p-2 whitespace-pre-wrap break-all text-xs';
          body.textContent = record[field] ?? '(không có hoặc không đọc được dữ liệu văn bản)';
          details.append(heading, body);
        }
      }
      row.append(details);
    }
    view.append(row);
  }
}

async function recordedEntries() {
  const stored = await chrome.storage.session.get(null);
  return Object.entries(stored).filter(([key]) => key.startsWith('record:'))
    .sort(([a], [b]) => Number(a.slice(7)) - Number(b.slice(7)))
    .map(([, record]) => record);
}

function updateItemGroups(data) {
  const selected = itemGroup.value;
  itemGroup.replaceChildren();
  for (const [value, label] of [['', 'Tất cả nhóm'],
    ...Object.keys(data ?? {}).sort().map((group) => [group, group])]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    itemGroup.append(option);
  }
  itemGroup.value = [...itemGroup.options].some((option) => option.value === selected) ? selected : '';
}

async function render() {
  const [stored, session] = await Promise.all([
    chrome.storage.local.get(CACHE_KEY), chrome.storage.session.get('recordingState')
  ]);
  const cache = stored[CACHE_KEY] || {};
  document.querySelector('#energy-value').textContent = formatNumber(cache.energyStatus?.data?.energy);
  document.querySelector('#world-energy-value').textContent = formatNumber(cache.worldEnergyStatus?.data?.energy);
  const recordingState = session.recordingState;
  const recordButton = document.querySelector('#record-toggle');
  recordButton.hidden = activeTab !== 'log';
  recordButton.textContent = recordingState?.active ? 'Stop' : 'Record';
  recordButton.className = recordingState?.active ?
    'cursor-pointer rounded-lg border border-slate-300 bg-slate-800 px-3 py-2 font-medium text-white hover:bg-slate-700' :
    'cursor-pointer rounded-lg border border-red-300 bg-red-50 px-3 py-2 font-medium text-red-800 hover:bg-red-100';
  view.replaceChildren();
  document.querySelector('#toolbar').hidden = activeTab === 'config';
  document.querySelector('#settings-panel').hidden = activeTab !== 'config';
  view.hidden = activeTab === 'config';
  document.querySelector('#export').hidden = activeTab !== 'log';
  document.querySelector('#item-group-filter').hidden = activeTab !== 'items';
  document.querySelector('#log-sort-wrap').hidden = activeTab !== 'log';
  document.querySelector('#search-label').textContent = activeTab === 'log' ? 'Lọc endpoint' : 'Lọc theo ID, tên hoặc nhóm';
  search.placeholder = activeTab === 'log' ? 'Lọc endpoint' : 'Nhập ID, tên hoặc nhóm';

  if (activeTab === 'config') {
    status.textContent = 'Cài đặt và dữ liệu lưu trên thiết bị này.';
  } else if (activeTab === 'heroes') {
    showSnapshot(cache.heroGetAll, ['Hero ID', 'Tên', 'Level', 'Star', 'Soul stone / cần', 'Power', 'Skin ID'], (data) =>
      Object.entries(data).sort(byId).map(([id, hero]) => {
        const { owned, needed } = globalThis.hwaHelperPopupData.heroSoulProgress(id, hero, cache.inventoryGet?.data);
        const soulStones = `${formatNumber(owned)} / ${typeof needed === 'number' ? formatNumber(needed) : needed ?? '—'}`;
        return [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(hero?.level),
          formatNumber(hero?.star), soulStones, formatNumber(hero?.power), formatNumber(hero?.currentSkin)];
      }));
  } else if (activeTab === 'items') {
    updateItemGroups(cache.inventoryGet?.data);
    showSnapshot(cache.inventoryGet, ['Nhóm', 'Item ID', 'Tên', 'Số lượng'], (data) =>
      Object.entries(data).filter(([category]) => !itemGroup.value || category === itemGroup.value).flatMap(([category, items]) =>
        Object.entries(items ?? {}).sort(byId).map(([id, quantity]) =>
          [category, id, globalThis.hwaHelperNameMap.item(category, id) || '—', formatNumber(quantity)])));
  } else if (activeTab === 'titans') {
    showSnapshot(cache.titanGetAll, ['Titan ID', 'Tên', 'Level', 'Star', 'Power'], (data) =>
      Object.entries(data).sort(byId).map(([id, titan]) =>
        [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(titan?.level),
          formatNumber(titan?.star), formatNumber(titan?.power)]));
  } else if (activeTab === 'teams') {
    showSnapshot(cache.teamGetAll, ['Chế độ', 'Đội', 'Số thành viên', 'Hero/Titan ID', 'Tên heroes/titans'], (data) =>
      globalThis.hwaHelperPopupData.teamRows(data, globalThis.hwaHelperNameMap));
  } else if (activeTab === 'other') {
    const entries = Object.values(cache).filter((entry) =>
      !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll', 'energyStatus', 'worldEnergyStatus'].includes(entry.key)
      && matches([entry.method, entry.feature || entry.group]));
    const rows = entries.map((entry) => [entry.method, entry.feature || entry.group,
      Array.isArray(entry.data) ? `${entry.data.length} phần tử` : `${Object.keys(entry.data ?? {}).length} khóa`,
      entry.updatedAt]);
    status.textContent = `${rows.length} snapshot khác`;
    if (rows.length) {
      view.append(table(['RPC', 'Nhóm/feature', 'Kích thước', 'Cập nhật'], rows));
      for (const entry of entries) {
        const details = document.createElement('details');
        details.className = 'border-b border-slate-100 px-4 py-2';
        const summary = document.createElement('summary');
        summary.className = 'cursor-pointer text-blue-700';
        summary.textContent = `Xem dữ liệu ${entry.key}`;
        details.append(summary);
        details.addEventListener('toggle', () => {
          if (!details.open || details.querySelector('pre')) return;
          const body = document.createElement('pre');
          body.className = 'mt-2 max-h-44 overflow-auto rounded-lg bg-slate-100 p-2 whitespace-pre-wrap break-all text-xs';
          body.textContent = JSON.stringify(entry.data, null, 2);
          details.append(body);
        });
        view.append(details);
      }
    } else showEmpty('Chưa có snapshot khác.');
  } else {
    renderLog(await recordedEntries(), recordingState);
  }
}

tabs.forEach((button) => button.addEventListener('click', () => {
  activeTab = button.dataset.tab;
  tabs.forEach((tab) => { tab.setAttribute('aria-selected', String(tab === button)); });
  search.value = '';
  render();
}));
search.addEventListener('input', render);
itemGroup.addEventListener('change', render);
logSort.addEventListener('change', render);

document.querySelector('#clear-cache').addEventListener('click', async () => {
  await chrome.storage.local.remove(CACHE_KEY);
  await render();
});

async function renderSettings() {
  const stored = await chrome.storage.local.get('captureSettings');
  document.querySelector('#intercept-enabled').checked = stored.captureSettings?.interceptEnabled !== false;
}

for (const [id, field] of [['intercept-enabled', 'interceptEnabled']]) {
  document.querySelector(`#${id}`).addEventListener('change', (event) => {
    const enabled = event.currentTarget.checked;
    settingsPending = settingsPending.catch(() => {}).then(async () => {
      const stored = await chrome.storage.local.get('captureSettings');
      await chrome.storage.local.set({ captureSettings: {
        ...(stored.captureSettings || {}), [field]: enabled
      } });
    });
    settingsPending.catch(() => { status.textContent = 'Không lưu được cài đặt theo dõi.'; });
  });
}

document.querySelector('#record-toggle').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const state = (await chrome.storage.session.get('recordingState')).recordingState;
    const result = await chrome.runtime.sendMessage({ kind: state?.active ? 'record-stop' : 'record-start' });
    if (result?.error) throw new Error(result.error);
    await render();
  } catch (error) {
    status.textContent = `Không đổi được chế độ record: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#export').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const records = await recordedEntries();
    const filename = await globalThis.hwaHelperNextExportName(chrome.storage.local);
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ kind: 'record-clear' });
  await render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if ('captureSettings' in changes) renderSettings();
    if (CACHE_KEY in changes) queueRender();
  } else if (area === 'session' && (activeTab === 'log' || 'recordingState' in changes)) {
    queueRender();
  }
});

function queueRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 80);
}

renderSettings();
render().then(async () => {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  if (!stored[CACHE_KEY] || !Object.keys(stored[CACHE_KEY]).length) {
    await chrome.runtime.sendMessage({ kind: 'rebuild-cache' }).catch(() => {});
    await render();
  }
});
