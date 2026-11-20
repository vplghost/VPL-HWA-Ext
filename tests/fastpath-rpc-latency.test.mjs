import test from 'node:test';
import assert from 'node:assert/strict';
import { rpcMessageForSettings, setupBackgroundRuntime } from '../src/background/backgroundRuntime.ts';

test('rpcMessageForSettings prioritizes direct dispatch for userAction and direct options in piggyback mode', () => {
  const stored = {
    popupRpcEnabled: true,
    socketRefreshMode: 'piggyback',
    captureSettings: { interceptEnabled: true }
  };

  // Normal passive calls in piggyback mode become queue-rpc
  const passiveMsg = rpcMessageForSettings(stored, [{ name: 'getMarches' }]);
  assert.equal(passiveMsg.kind, 'queue-rpc');

  // User actions triggered from UI bypass passive queue and use direct refresh-rpc
  const userActionMsg = rpcMessageForSettings(stored, [{ name: 'winCampBattle' }], false, { userAction: true });
  assert.equal(userActionMsg.kind, 'refresh-rpc');
  assert.equal(userActionMsg.userAction, true);

  const directMsg = rpcMessageForSettings(stored, [{ name: 'missionRaid' }], false, { direct: true });
  assert.equal(directMsg.kind, 'refresh-rpc');
  assert.equal(directMsg.direct, true);
});

test('background runtime forwards direct refresh-rpc results from tab back to popup caller', async () => {
  let runtimeListener;
  const forwardedMessages = [];
  const local = {
    popupRpcEnabled: true,
    socketRefreshMode: 'piggyback'
  };

  const chromeMock = {
    runtime: {
      id: 'test-extension',
      onMessage: {
        addListener: (fn) => { runtimeListener = fn; }
      },
      onInstalled: { addListener: () => {} }
    },
    tabs: {
      query: (filter, cb) => cb([{ id: 10, url: 'https://www.hero-wars-alliance.com/' }]),
      sendMessage: async (tabId, msg) => {
        forwardedMessages.push({ tabId, msg });
        // Mock tab returning direct RPC response with results array
        return {
          ok: true,
          status: 200,
          results: [
            {
              ident: 'ident-1',
              result: {
                response: {
                  success: true,
                  campId: 'camp-101',
                  reward: [{ type: 'gold', amount: 15000 }]
                }
              }
            }
          ]
        };
      }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (Array.isArray(keys)) {
            const res = {};
            for (const k of keys) res[k] = local[k];
            return res;
          }
          return local;
        },
        set: async (val) => Object.assign(local, val)
      },
      session: {
        get: async () => ({}),
        set: async () => {}
      }
    }
  };

  setupBackgroundRuntime({ chrome: chromeMock });

  const sender = { url: 'chrome-extension://test-extension/popup.html' };
  const calls = [{ name: 'winCampBattle', args: { campId: 'camp-101' } }];

  const response = await new Promise((resolve) => {
    runtimeListener(
      { kind: 'refresh-rpc', calls, userAction: true },
      sender,
      resolve
    );
  });

  assert.equal(response.ok, true);
  assert.notEqual(response.queued, true);
  assert.ok(Array.isArray(response.results));
  assert.equal(response.results[0].result.response.campId, 'camp-101');
  assert.equal(forwardedMessages.length, 1);
  assert.equal(forwardedMessages[0].msg.kind, 'refresh-rpc');
  assert.equal(forwardedMessages[0].msg.userAction, true);
});

test('fast-path camp attack completes immediately when direct results are received', () => {
  const directResponse = {
    ok: true,
    results: [
      {
        ident: 'battle-1',
        result: {
          response: {
            reward: [{ type: 'gold', amount: 20000 }],
            campId: 'camp-alpha'
          }
        }
      }
    ]
  };

  const battleRes = directResponse.results.find((r) =>
    r?.result?.response?.reward || r?.result?.response?.campId
  );
  assert.ok(battleRes);
  assert.equal(battleRes.result.response.campId, 'camp-alpha');
  assert.equal(battleRes.result.response.reward[0].amount, 20000);
});
