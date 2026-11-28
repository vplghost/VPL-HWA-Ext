// HWA Control Panel Mobile WebView Client
// On-demand Refresh + Task-Only WebSocket Wait + 1-Year HttpOnly Cookie Session

const $ = (id) => document.getElementById(id);

let currentState = null;
let recallConfirmUntil = 0;
let recallResetTimer = null;

function formatRelativeTime(ts) {
  if (!ts) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function showView(authenticated) {
  $('cp-login-view').classList.toggle('hidden', authenticated);
  $('cp-dashboard-view').classList.toggle('hidden', !authenticated);
}

function setTaskStatus(text, tone = 'info') {
  const el = $('cp-task-status');
  if (!text) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.textContent = text;
  const tones = {
    info: 'border-indigo-700 bg-indigo-950/60 text-indigo-200',
    ok: 'border-emerald-700 bg-emerald-950/60 text-emerald-200',
    error: 'border-rose-700 bg-rose-950/60 text-rose-200',
  };
  el.className = `rounded-xl border px-3 py-2 text-xs font-medium ${tones[tone] || tones.info}`;
}

function renderState(data) {
  currentState = data;
  const snap = data?.snapshot || null;

  const extEl = $('cp-ext-status');
  if (data?.extensionOnline) {
    extEl.textContent = snap?.gameTabOnline ? '● Online · Game Active' : '● Online · No Game Tab';
    extEl.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800';
  } else {
    extEl.textContent = `○ Offline (${formatRelativeTime(data?.lastSeenAt)})`;
    extEl.className = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold bg-slate-800 text-slate-400 border border-slate-700';
  }
  $('cp-sync-time').textContent = `Synced ${formatRelativeTime(data?.snapshotUpdatedAt)}`;

  if (!snap) return;

  $('cp-account-label').textContent = snap.account?.name || (snap.account?.id ? `#${snap.account.id}` : '');
  $('cp-world-energy').textContent =
    snap.energy?.world != null
      ? `${snap.energy.world}${snap.energy.worldCap ? '/' + snap.energy.worldCap : ''}`
      : '--';
  $('cp-campaign-energy').textContent =
    snap.energy?.campaign != null
      ? `${snap.energy.campaign}${snap.energy.campaignCap ? '/' + snap.energy.campaignCap : ''}`
      : '--';

  const g = snap.gathering || {};
  $('cp-gathering-stat').textContent = `${g.activeMarches ?? 0}/${g.maxMarches ?? '?'}${g.progressPct != null ? ` · ${g.progressPct}%` : ''}`;
  $('cp-gathering-sub').textContent = g.waitingForTroops ? 'Waiting for troops' : g.enabled ? 'Auto Active' : 'Paused';

  const inf = snap.infirmary;
  $('cp-infirmary-stat').textContent = inf ? `${inf.pct}%` : '--';
  $('cp-defense-sub').textContent = snap.mineDefense?.enabled ? '🛡️ Defense On' : 'Defense Off';

  // Mine attack alert
  const alertBox = $('cp-mine-alert');
  if (snap.mineDefense?.alertActive) {
    alertBox.classList.remove('hidden');
    $('cp-mine-alert-text').textContent = `⚠️ ${snap.mineDefense.status || 'Incoming Mine Attack Detected'}`;
  } else {
    alertBox.classList.add('hidden');
  }

  // Toggle button labels
  const gatherOn = snap.toggles?.autoGather === true;
  $('cp-btn-toggle-gather').textContent = gatherOn ? '⏸️ Pause Auto-Gather' : '▶️ Resume Auto-Gather';
  const defOn = snap.toggles?.mineDefense !== false;
  $('cp-btn-toggle-defense').textContent = defOn ? '🛡️ Defense: ON' : '🛡️ Defense: OFF';

  // Active Automations pills
  const listEl = $('cp-automations-list');
  const items = Array.isArray(snap.activeAutomations) ? snap.activeAutomations : [];
  if (items.length === 0) {
    listEl.innerHTML = '<span class="text-slate-500">No active automations running.</span>';
  } else {
    listEl.innerHTML = '';
    for (const item of items) {
      const span = document.createElement('span');
      const toneCls =
        item.statusTone === 'warning'
          ? 'bg-rose-950/70 text-rose-300 border-rose-800'
          : item.statusTone === 'waiting'
            ? 'bg-amber-950/70 text-amber-300 border-amber-800'
            : 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
      span.className = `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneCls}`;
      span.textContent = `${item.icon || '⚙️'} ${item.label}`;
      listEl.appendChild(span);
    }
  }

  // Dynamic Stop Queue buttons for active queues
  const stopBox = $('cp-active-queues-stop');
  const stoppable = items.filter((i) => ['raid', 'monster', 'tower', 'dungeon'].includes(i.id));
  if (stoppable.length > 0) {
    stopBox.classList.remove('hidden');
    stopBox.innerHTML = '';
    for (const q of stoppable) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cp-btn flex-1 rounded-xl bg-amber-900/60 hover:bg-amber-800 border border-amber-700 py-2 px-3 text-xs font-bold text-amber-200';
      btn.textContent = `🛑 Stop ${q.id.toUpperCase()}`;
      btn.addEventListener('click', () => void dispatchCommand('stop-queue', { queue: q.id }));
      stopBox.appendChild(btn);
    }
  } else {
    stopBox.classList.add('hidden');
    stopBox.innerHTML = '';
  }

  // Recent commands & logs
  const histEl = $('cp-commands-history');
  const cmds = Array.isArray(data?.recentCommands) ? data.recentCommands : [];
  histEl.innerHTML = '';
  if (cmds.length === 0) {
    histEl.innerHTML = '<div class="text-slate-500">No recent commands.</div>';
  } else {
    for (const c of cmds.slice(0, 10)) {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 rounded-lg bg-slate-800/70 px-2.5 py-1.5 border border-slate-700/70';
      const left = document.createElement('div');
      left.className = 'min-w-0 truncate';
      left.textContent = `${c.action}${c.result?.message ? ' · ' + c.result.message : ''}`;
      const badge = document.createElement('span');
      badge.className = `shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
        c.status === 'done'
          ? 'bg-emerald-950 text-emerald-300'
          : c.status === 'failed'
            ? 'bg-rose-950 text-rose-300'
            : 'bg-amber-950 text-amber-300'
      }`;
      badge.textContent = c.status;
      row.append(left, badge);
      histEl.appendChild(row);
    }
  }
}

async function loadState() {
  const res = await fetch('/api/web/state', { credentials: 'include' });
  if (res.status === 401) {
    showView(false);
    return null;
  }
  const data = await res.json();
  if (data?.ok) renderState(data);
  return data;
}

/**
 * Opens a temporary /ws/web socket ONLY while waiting for an in-flight command result,
 * then closes it immediately once settled to save mobile battery.
 */
function waitForCommandCompletion(commandId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/web`);
    let settled = false;

    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close(1000, 'Done');
      } catch (_) {}
      resolve(outcome);
    };

    const timer = setTimeout(() => finish({ timedOut: true }), timeoutMs);

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg?.type === 'command_updated' && msg.command?.id === commandId) {
        if (['done', 'failed'].includes(msg.command.status)) {
          finish({ command: msg.command });
        }
      }
    });

    ws.addEventListener('error', () => finish({ error: 'WebSocket error' }));
    ws.addEventListener('close', () => finish({ closed: true }));
  });
}

async function dispatchCommand(action, payload = {}) {
  setTaskStatus(`⏳ Sending ${action}…`, 'info');
  try {
    const res = await fetch('/api/web/command', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    if (res.status === 401) {
      showView(false);
      return;
    }
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      setTaskStatus(`✕ ${data?.error || 'Command failed'}`, 'error');
      return;
    }
    if (!data.delivered) {
      setTaskStatus('⚠️ Extension is offline; showing last cached snapshot.', 'error');
      await loadState();
      return;
    }

    setTaskStatus(`⏳ Waiting for Extension (${action})…`, 'info');
    const waitRes = await waitForCommandCompletion(data.command.id, 15000);
    await loadState();

    if (waitRes.command?.status === 'done') {
      setTaskStatus(`✓ ${waitRes.command.result?.message || 'Completed'}`, 'ok');
    } else if (waitRes.command?.status === 'failed') {
      setTaskStatus(`✕ ${waitRes.command.result?.message || 'Failed'}`, 'error');
    } else {
      setTaskStatus('⚠️ Timed out waiting for Extension ack. Tap Refresh to recheck.', 'error');
    }
  } catch (err) {
    setTaskStatus(`✕ ${err?.message || 'Network error'}`, 'error');
  }
}

async function init() {
  // Pre-fill GUID from QR query parameter ?guid=...
  const params = new URLSearchParams(window.location.search);
  const qrGuid = params.get('guid');
  if (qrGuid) {
    $('cp-guid-input').value = qrGuid.trim();
  }

  // Check 1-year HttpOnly cookie session
  try {
    const sess = await fetch('/api/web/session', { credentials: 'include' }).then((r) => r.json());
    if (sess?.authenticated) {
      showView(true);
      await loadState();
    } else {
      showView(false);
    }
  } catch {
    showView(false);
  }

  // Login form
  $('cp-login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = $('cp-login-error');
    errEl.classList.add('hidden');
    const guid = $('cp-guid-input').value.trim();
    const otp = $('cp-otp-input').value.trim();
    $('cp-login-submit').disabled = true;
    try {
      const res = await fetch('/api/web/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guid, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        errEl.textContent = data?.error || 'Authentication failed';
        errEl.classList.remove('hidden');
        return;
      }
      $('cp-otp-input').value = '';
      showView(true);
      await loadState();
    } catch (err) {
      errEl.textContent = err?.message || 'Network error';
      errEl.classList.remove('hidden');
    } finally {
      $('cp-login-submit').disabled = false;
    }
  });

  // On-demand Refresh
  $('cp-refresh-btn').addEventListener('click', async () => {
    const btn = $('cp-refresh-btn');
    btn.disabled = true;
    $('cp-refresh-icon').classList.add('animate-spin');
    try {
      await dispatchCommand('refresh-snapshot', {});
    } finally {
      btn.disabled = false;
      $('cp-refresh-icon').classList.remove('animate-spin');
    }
  });

  // Logout
  $('cp-logout-btn').addEventListener('click', async () => {
    await fetch('/api/web/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setTaskStatus('');
    showView(false);
  });

  // 2-step Emergency Recall All Gatherers
  $('cp-btn-recall-all').addEventListener('click', async () => {
    const now = Date.now();
    const btn = $('cp-btn-recall-all');
    if (now > recallConfirmUntil) {
      recallConfirmUntil = now + 5000;
      btn.textContent = '⚠️ Tap again within 5s to CONFIRM Recall All';
      clearTimeout(recallResetTimer);
      recallResetTimer = setTimeout(() => {
        recallConfirmUntil = 0;
        btn.textContent = '🚨 Emergency Recall All Gatherers';
      }, 5000);
      return;
    }
    recallConfirmUntil = 0;
    clearTimeout(recallResetTimer);
    btn.textContent = '🚨 Emergency Recall All Gatherers';
    await dispatchCommand('emergency-recall-gatherers', {});
  });

  $('cp-btn-toggle-gather').addEventListener('click', () => {
    const cur = currentState?.snapshot?.toggles?.autoGather === true;
    void dispatchCommand('toggle-automation', { target: 'autoGather', enabled: !cur });
  });

  $('cp-btn-toggle-defense').addEventListener('click', () => {
    const cur = currentState?.snapshot?.toggles?.mineDefense !== false;
    void dispatchCommand('toggle-automation', { target: 'mineDefense', enabled: !cur });
  });

  $('cp-btn-autopilot').addEventListener('click', () => {
    void dispatchCommand('trigger-special', { trigger: 'run-daily-autopilot' });
  });

  $('cp-btn-batch-heal').addEventListener('click', () => {
    void dispatchCommand('trigger-special', { trigger: 'run-batch-heal' });
  });
}

void init();
