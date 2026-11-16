import test from 'node:test';
import assert from 'node:assert/strict';

function setupMockChrome(initialStatus = null, onSendMessage = null) {
  let lastMessage = null;
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: '0.9.169' }),
      sendMessage: (msg, callback) => {
        lastMessage = msg;
        if (typeof onSendMessage === 'function') {
          onSendMessage(msg, callback);
        } else if (msg.kind === 'get-game-tab-status') {
          callback?.(initialStatus || { ok: true, hasGameTab: false, gameEngineStatus: null });
        } else if (msg.kind === 'reload-game-tab') {
          callback?.({ ok: true });
        }
      }
    },
    storage: {
      local: {
        get: async () => ({})
      }
    }
  };
  return { getLastMessage: () => lastMessage };
}

test('useGameConnection displays warning banner when no game window is open and needsRefresh is false', async () => {
  setupMockChrome({
    ok: true,
    hasGameTab: false,
    gameEngineStatus: null
  });

  const { useGameConnection } = await import('../src/composables/useGameConnection.ts');
  const conn = useGameConnection();
  await conn.checkStatus();

  assert.equal(conn.hasGameTab.value, false, 'Must indicate no game tab is open');
  assert.ok(conn.alertMessage.value, 'Alert banner must be present');
  assert.equal(conn.alertMessage.value.type, 'no-tab');
  assert.ok(conn.alertMessage.value.title.includes('No Game Window Detected'));
  assert.equal(conn.needsRefresh.value, false, 'Needs refresh must be false when no game tab');
});

test('useGameConnection displays refresh recommended when game window is open but not hooked', async () => {
  setupMockChrome({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: false, hasCanvas: false, hasRpcHeaders: false }
  });

  const { useGameConnection } = await import('../src/composables/useGameConnection.ts');
  const conn = useGameConnection();
  await conn.checkStatus();

  assert.equal(conn.hasGameTab.value, true);
  assert.ok(conn.alertMessage.value);
  assert.equal(conn.alertMessage.value.type, 'not-hooked');
  assert.ok(conn.alertMessage.value.title.includes('Refresh Recommended'));
  assert.ok(conn.alertMessage.value.body.includes('hooks are not yet connected'));
  assert.equal(conn.needsRefresh.value, true);
});

test('useGameConnection displays refresh recommendation when extension version changes', async () => {
  setupMockChrome({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: true, extensionVersion: '0.9.168' }
  });

  const { useGameConnection } = await import('../src/composables/useGameConnection.ts');
  const conn = useGameConnection();
  await conn.checkStatus();

  assert.ok(conn.alertMessage.value);
  assert.equal(conn.alertMessage.value.type, 'version-changed');
  assert.ok(conn.alertMessage.value.body.includes('Extension updated to v0.9.169'));
  assert.equal(conn.needsRefresh.value, true);
});

test('useGameConnection displays refresh recommendation when engine requests refresh', async () => {
  setupMockChrome({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: true, extensionVersion: '0.9.169', refreshRequired: true }
  });

  const { useGameConnection } = await import('../src/composables/useGameConnection.ts');
  const conn = useGameConnection();
  await conn.checkStatus();

  assert.ok(conn.alertMessage.value);
  assert.equal(conn.alertMessage.value.type, 'refresh-required');
  assert.ok(conn.alertMessage.value.body.includes('requested a refresh'));
  assert.equal(conn.needsRefresh.value, true);
});

test('reloadGameTab dispatches reload-game-tab message to background', async () => {
  let dispatched = null;
  setupMockChrome(
    { ok: true, hasGameTab: true, gameEngineStatus: { ready: false } },
    (msg, cb) => {
      if (msg.kind === 'reload-game-tab') {
        dispatched = msg;
        cb?.({ ok: true });
      } else if (msg.kind === 'get-game-tab-status') {
        cb?.({ ok: true, hasGameTab: true, gameEngineStatus: { ready: false } });
      }
    }
  );

  const { useGameConnection } = await import('../src/composables/useGameConnection.ts');
  const conn = useGameConnection();
  await conn.reloadGameTab();

  assert.ok(dispatched, 'Must dispatch reload-game-tab message');
  assert.equal(dispatched.kind, 'reload-game-tab');
});

test('useGameConnection hides warning banner when game window is healthy and hooked', async () => {
  setupMockChrome({
    ok: true,
    hasGameTab: true,
    gameEngineStatus: { ready: true, extensionVersion: '0.9.169' }
  });

  const { useGameConnection } = await import('../src/composables/useGameConnection.ts');
  const conn = useGameConnection();
  await conn.checkStatus();

  assert.equal(conn.hasGameTab.value, true);
  assert.equal(conn.isHealthy.value, true, 'Connection must be healthy');
  assert.equal(conn.alertMessage.value, null, 'Alert message must be null when healthy');
  assert.equal(conn.needsRefresh.value, false, 'Needs refresh must be false when healthy');
});
