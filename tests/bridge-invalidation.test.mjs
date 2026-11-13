import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/bridge.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

async function setup() {
  const timers = new Map(), sent = [], alerts = [];
  let nextId = 0, mode = 'healthy', onChanged;
  const stored = { raidEnergyAuto: { enabled: false } };
  for (const key of ['raidQueue', 'monsterQueue', 'towerRun', 'dungeonRun', 'buildingQueue', 'researchQueue']) {
    stored[key] = { enabled: true, phase: 'active', wakeAt: Date.now() + 1000, items: [{}] };
  }
  const chrome = {
    runtime: { onMessage: { addListener() {} }, sendMessage(message) {
      sent.push(message);
      if (mode === 'throw') throw Error('Extension context invalidated.');
      if (mode === 'reject') return Promise.reject(Error('Extension context invalidated.'));
      if (mode === 'ordinary') return Promise.reject(Error('Receiving end does not exist.'));
      return Promise.resolve({ watch: mode === 'watch' });
    } },
    storage: { onChanged: { addListener: listener => { onChanged = listener; } },
      local: { get: async () => stored } },
  };
  vm.runInNewContext(source, { chrome, Date, location: { origin: 'https://www.hero-wars-alliance.com' },
    window: { addEventListener() {}, postMessage() {} }, alert: value => alerts.push(value),
    setTimeout: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback: () => { timers.delete(id); callback(); }, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  await flush();
  return { timers, sent, alerts, stored, chrome, setMode: value => { mode = value; },
    change: changes => onChanged(changes, 'local') };
}

test('all queue timer callbacks catch synchronous and async invalidation and cancel stale timers', async () => {
  for (const mode of ['throw', 'reject']) for (let index = 0; index < 6; index++) {
    const env = await setup();
    assert.equal(env.timers.size, 6);
    const callbacks = [...env.timers.values()];
    env.setMode(mode);
    assert.doesNotThrow(callbacks[index].callback);
    await flush();
    assert.equal(env.timers.size, 0);
    const count = env.sent.length;
    for (const timer of callbacks) assert.doesNotThrow(timer.callback);
    env.change({ buildingQueue: { newValue: env.stored.buildingQueue },
      raidEnergyAuto: { newValue: { enabled: true } } });
    await flush();
    assert.equal(env.sent.length, count, 'Queued callbacks and storage changes cannot revive a dead bridge');
    assert.equal(env.timers.size, 0);
    assert.equal(env.alerts.length, 0, 'Background invalidation must not open an alert');
  }
});

test('asynchronous invalidation also stops timers, including the energy heartbeat', async () => {
  for (const mode of ['throw', 'reject']) {
    const env = await setup();
    env.setMode(mode);
    assert.doesNotThrow(() => env.change({ raidEnergyAuto: { newValue: { enabled: true } } }));
    await flush();
    assert.equal(env.timers.size, 0);
    assert.equal(env.alerts.length, 0);
  }
});

test('invalidation while reading queue state cancels timers and cannot revive the bridge', async () => {
  for (const mode of ['throw', 'reject']) {
    const env = await setup();
    env.setMode('watch');
    env.chrome.storage.local.get = () => {
      if (mode === 'throw') throw Error('Extension context invalidated.');
      return Promise.reject(Error('Extension context invalidated.'));
    };
    assert.doesNotThrow([...env.timers.values()][0].callback);
    await flush();
    assert.equal(env.timers.size, 0);
    assert.doesNotThrow(() => env.change({ captureSettings: { newValue: {} } }));
  }
});

test('a pending queue read cannot reschedule after another callback invalidates the context', async () => {
  const env = await setup();
  env.setMode('watch');
  let resolveRead;
  env.chrome.storage.local.get = () => new Promise(resolve => { resolveRead = resolve; });
  [...env.timers.values()][0].callback();
  await flush();
  env.setMode('throw');
  [...env.timers.values()][0].callback();
  await flush();
  resolveRead(env.stored);
  await flush();
  assert.equal(env.timers.size, 0);
});

test('normal queue replies reschedule and ordinary messaging errors do not invalidate all queues', async () => {
  const env = await setup();
  env.setMode('watch');
  const [id, timer] = [...env.timers][0];
  env.timers.delete(id); timer.callback(); await flush();
  assert.equal(env.timers.size, 6);
  env.setMode('ordinary');
  const [nextId, next] = [...env.timers][0];
  env.timers.delete(nextId); next.callback(); await flush();
  assert.equal(env.timers.size, 5);
  env.setMode('healthy');
  env.change({ raidEnergyAuto: { newValue: { enabled: true } } });
  await flush();
  assert.equal(env.timers.size, 6, 'An ordinary missing receiver does not kill the bridge');
});
