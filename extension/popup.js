const LOG_KEY = 'apiRecords';
const CACHE_KEY = 'rpcCache';
const view = document.querySelector('#view');
const status = document.querySelector('#status');
const search = document.querySelector('#search');
const tabs = [...document.querySelectorAll('[data-tab]')];
let activeTab = 'heroes';
let settingsPending = Promise.resolve();

document.querySelector('#version').textContent = chrome.runtime.getManifest().version;

const formatNumber = (value) => typeof value === 'number' ? value.toLocaleString() : '—';
const formatTime = (value) => value ? new Date(value).toLocaleString() : 'chưa có';
const byId = ([a], [b]) => Number(a) - Number(b);

function table(headings, rows) {
  const element = document.createElement('table');
  const header = document.createElement('tr');
  for (const heading of headings) {
    const cell = document.createElement('th');
    cell.textContent = heading;
    header.append(cell);
  }
  element.append(header);
  for (const values of rows) {
    const line = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value ?? '—');
      if (typeof value === 'number') cell.className = 'numeric';
      line.append(cell);
    }
    element.append(line);
  }
  return element;
}

function showEmpty(message) {
  const text = document.createElement('p');
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

function renderLog(records) {
  const recent = records.slice(-50).reverse().filter((record) => matches([record.endpoint, record.method]));
  status.textContent = `${records.length} request đang lưu · hiển thị tối đa 50 request gần nhất`;
  if (!recent.length) return showEmpty('Chưa có request phù hợp.');
  for (const record of recent) {
    const row = document.createElement('article');
    row.className = 'record';
    const summary = document.createElement('div');
    const method = document.createElement('strong');
    method.textContent = record.method;
    const code = document.createElement('span');
    code.className = record.outcome === 'failed' ? 'failed' : '';
    code.textContent = record.status === null ? record.outcome : String(record.status);
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${record.transport} · ${record.durationMs} ms · ${formatTime(record.timestamp)}`;
    summary.append(method, code, meta);
    const endpoint = document.createElement('div');
    endpoint.className = 'endpoint';
    endpoint.textContent = record.endpoint;
    row.append(summary, endpoint);
    if (record.method === 'POST') {
      const details = document.createElement('details');
      const title = document.createElement('summary');
      const legacy = !Object.hasOwn(record, 'requestBody') && !Object.hasOwn(record, 'responseBody');
      title.textContent = legacy ? 'Log cũ: chưa có dữ liệu body' : 'Request / Response data';
      details.append(title);
      if (legacy) {
        const note = document.createElement('p');
        note.textContent = 'Bản ghi này có trước tính năng lưu body.';
        details.append(note);
      } else {
        for (const [label, field] of [['Request', 'requestBody'], ['Response', 'responseBody']]) {
          const heading = document.createElement('strong');
          heading.textContent = `${label}${record[`${field}Truncated`] ? ' (đã cắt bớt)' : ''}`;
          const body = document.createElement('pre');
          body.textContent = record[field] ?? '(không có hoặc không đọc được dữ liệu văn bản)';
          details.append(heading, body);
        }
      }
      row.append(details);
    }
    view.append(row);
  }
}

async function render() {
  const stored = await chrome.storage.local.get([LOG_KEY, CACHE_KEY]);
  const cache = stored[CACHE_KEY] || {};
  const records = (Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] : [])
    .filter((record) => !globalThis.hwaHelperIsTrackingUrl(record.endpoint));
  view.replaceChildren();
  document.querySelector('#export').hidden = activeTab !== 'log';
  document.querySelector('#clear').hidden = activeTab !== 'log';
  document.querySelector('#clear-cache').hidden = activeTab === 'log';
  document.querySelector('#search-label').hidden = activeTab === 'log';
  search.placeholder = activeTab === 'log' ? 'Lọc endpoint' : 'Nhập ID hoặc tên nhóm';

  if (activeTab === 'heroes') {
    showSnapshot(cache.heroGetAll, ['Hero ID', 'Tên', 'Level', 'Star', 'Power', 'Skin ID'], (data) =>
      Object.entries(data).sort(byId).map(([id, hero]) =>
        [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(hero?.level),
          formatNumber(hero?.star), formatNumber(hero?.power), formatNumber(hero?.currentSkin)]));
  } else if (activeTab === 'items') {
    showSnapshot(cache.inventoryGet, ['Nhóm', 'Item ID', 'Tên', 'Số lượng'], (data) =>
      Object.entries(data).flatMap(([category, items]) =>
        Object.entries(items ?? {}).sort(byId).map(([id, quantity]) =>
          [category, id, globalThis.hwaHelperNameMap.item(category, id) || '—', formatNumber(quantity)])));
  } else if (activeTab === 'titans') {
    showSnapshot(cache.titanGetAll, ['Titan ID', 'Tên', 'Level', 'Star', 'Power'], (data) =>
      Object.entries(data).sort(byId).map(([id, titan]) =>
        [id, globalThis.hwaHelperNameMap.hero(id) || '—', formatNumber(titan?.level),
          formatNumber(titan?.star), formatNumber(titan?.power)]));
  } else if (activeTab === 'teams') {
    showSnapshot(cache.teamGetAll, ['Chế độ', 'Số phần tử', 'ID lớp đầu'], (data) =>
      Object.entries(data).map(([mode, members]) => [mode,
        Array.isArray(members) ? members.length : 0,
        Array.isArray(members) ? members.filter((value) => typeof value === 'number').join(', ') || 'đội lồng nhau' : '—']));
  } else if (activeTab === 'other') {
    const entries = Object.values(cache).filter((entry) =>
      !['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll'].includes(entry.key)
      && matches([entry.method, entry.feature || entry.group]));
    const rows = entries.map((entry) => [entry.method, entry.feature || entry.group,
      Array.isArray(entry.data) ? `${entry.data.length} phần tử` : `${Object.keys(entry.data ?? {}).length} khóa`,
      formatTime(entry.updatedAt)]);
    status.textContent = `${rows.length} snapshot khác`;
    if (rows.length) {
      view.append(table(['RPC', 'Nhóm/feature', 'Kích thước', 'Cập nhật'], rows));
      for (const entry of entries) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = `Xem dữ liệu ${entry.key}`;
        details.append(summary);
        details.addEventListener('toggle', () => {
          if (!details.open || details.querySelector('pre')) return;
          const body = document.createElement('pre');
          body.textContent = JSON.stringify(entry.data, null, 2);
          details.append(body);
        });
        view.append(details);
      }
    } else showEmpty('Chưa có snapshot khác.');
  } else {
    renderLog(records);
  }
}

tabs.forEach((button) => button.addEventListener('click', () => {
  activeTab = button.dataset.tab;
  tabs.forEach((tab) => { tab.setAttribute('aria-selected', String(tab === button)); });
  search.value = '';
  render();
}));
search.addEventListener('input', render);

document.querySelector('#clear-cache').addEventListener('click', async () => {
  await chrome.storage.local.remove(CACHE_KEY);
  await render();
});

async function renderSettings() {
  const stored = await chrome.storage.local.get('captureSettings');
  document.querySelector('#intercept-enabled').checked = stored.captureSettings?.interceptEnabled !== false;
  document.querySelector('#log-enabled').checked = stored.captureSettings?.logEnabled !== false;
}

for (const [id, field] of [['intercept-enabled', 'interceptEnabled'], ['log-enabled', 'logEnabled']]) {
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

document.querySelector('#export').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const stored = await chrome.storage.local.get(LOG_KEY);
    const records = (Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] : [])
      .filter((record) => !globalThis.hwaHelperIsTrackingUrl(record.endpoint));
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
  await chrome.storage.local.remove(LOG_KEY);
  await render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('captureSettings' in changes) renderSettings();
  if (LOG_KEY in changes || CACHE_KEY in changes) render();
});

renderSettings();
render().then(async () => {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  if (!stored[CACHE_KEY] || !Object.keys(stored[CACHE_KEY]).length) {
    await chrome.runtime.sendMessage({ kind: 'rebuild-cache' }).catch(() => {});
    await render();
  }
});
