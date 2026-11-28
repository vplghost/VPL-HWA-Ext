import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { createControlPanelServer, SESSION_COOKIE_NAME, ONE_YEAR_SECONDS } from '../HWA-ControlPanel/src/app.mjs';
import { generateTotp } from '../HWA-ControlPanel/src/totp.mjs';

const requireFromCp = createRequire(new URL('../HWA-ControlPanel/package.json', import.meta.url));
const { WebSocket } = requireFromCp('ws');

const TEST_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function waitMessage(ws, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS message timeout')), timeoutMs);
    const onMsg = (raw) => {
      const data = JSON.parse(String(raw));
      if (!predicate || predicate(data)) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(data);
      }
    };
    ws.on('message', onMsg);
  });
}

test('CP-01: GUID+OTP issues 1-year HttpOnly cookie, blocks replay & brute-force (429), and supports session revocation', async () => {
  let fakeNow = 1_760_000_000_000;
  const server = createControlPanelServer({ dataDir: ':memory:', now: () => fakeNow });
  const addr = await server.start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    // Health & readiness probes
    const h = await fetch(`${base}/healthz`).then((r) => r.json());
    assert.equal(h.ok, true);
    const rd = await fetch(`${base}/readyz`).then((r) => r.json());
    assert.equal(rd.ok, true);

    const guid = crypto.randomUUID();
    const deviceToken = crypto.randomBytes(24).toString('hex');

    // Pair extension
    const pairRes = await fetch(`${base}/api/ext/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientGuid: guid, deviceToken, otpSecret: TEST_SECRET }),
    });
    assert.equal(pairRes.status, 200);

    // Authenticate mobile with valid OTP -> 1-year HttpOnly cookie
    const { code } = generateTotp(TEST_SECRET, fakeNow);
    const authRes = await fetch(`${base}/api/web/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ guid, otp: code }),
    });
    assert.equal(authRes.status, 200);
    const setCookie = authRes.headers.get('set-cookie') || '';
    assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
    assert.match(setCookie, new RegExp(`Max-Age=${ONE_YEAR_SECONDS}`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);

    const cookiePair = setCookie.split(';')[0];

    // Session endpoint recognizes cookie
    const sess = await fetch(`${base}/api/web/session`, { headers: { Cookie: cookiePair } }).then((r) => r.json());
    assert.equal(sess.authenticated, true);
    assert.equal(sess.guid, guid);

    // Replay of same OTP step is blocked
    const replayRes = await fetch(`${base}/api/web/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guid, otp: code }),
    });
    assert.equal(replayRes.status, 401);

    // Revoke all web sessions from extension -> cookie invalidated immediately
    const revRes = await fetch(`${base}/api/ext/revoke-sessions`, {
      method: 'POST',
      headers: { 'X-Client-Guid': guid, Authorization: `Bearer ${deviceToken}` },
    });
    assert.equal(revRes.status, 200);
    const sessAfterRevoke = await fetch(`${base}/api/web/session`, { headers: { Cookie: cookiePair } }).then((r) => r.json());
    assert.equal(sessAfterRevoke.authenticated, false);

    // Rate-limit brute-force after 5 failed attempts -> 429
    for (let i = 0; i < 4; i++) {
      const bad = await fetch(`${base}/api/web/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guid, otp: '000000' }),
      });
      assert.equal(bad.status, 401);
    }
    const limited = await fetch(`${base}/api/web/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guid, otp: '000000' }),
    });
    assert.equal(limited.status, 429);
  } finally {
    await server.close();
  }
});

test('CP-01: SQLite persists state across server restarts and relays commands over WS /ws/extension and /ws/web', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hwa-cp-test-'));
  const fakeNow = 1_760_000_000_000;
  const guid = crypto.randomUUID();
  const deviceToken = crypto.randomBytes(24).toString('hex');

  let cookiePair = '';
  // Instance 1: pair, auth, push snapshot, close
  const s1 = createControlPanelServer({ dataDir: tmpDir, now: () => fakeNow });
  const a1 = await s1.start(0, '127.0.0.1');
  const base1 = `http://127.0.0.1:${a1.port}`;
  try {
    await fetch(`${base1}/api/ext/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientGuid: guid, deviceToken, otpSecret: TEST_SECRET }),
    });
    const { code } = generateTotp(TEST_SECRET, fakeNow);
    const authRes = await fetch(`${base1}/api/web/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guid, otp: code }),
    });
    cookiePair = (authRes.headers.get('set-cookie') || '').split(';')[0];
    // Over HTTP localhost, Secure flag is omitted so LAN/local browser stores cookie
    assert.doesNotMatch(authRes.headers.get('set-cookie') || '', /;\s*Secure\b/i);

    await fetch(`${base1}/api/ext/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Guid': guid,
        Authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify({ snapshot: { worldEnergy: 120, activeAutomations: [{ id: 'gather' }] } }),
    });
  } finally {
    await s1.close();
  }

  // Instance 2 (restarted against same SQLite file): cookie & snapshot survive, WS command relay works
  const s2 = createControlPanelServer({ dataDir: tmpDir, now: () => fakeNow + 60_000 });
  const a2 = await s2.start(0, '127.0.0.1');
  const base2 = `http://127.0.0.1:${a2.port}`;
  const wsBase2 = `ws://127.0.0.1:${a2.port}`;

  let wsExt;
  let wsWeb;
  try {
    const state = await fetch(`${base2}/api/web/state`, { headers: { Cookie: cookiePair } }).then((r) => r.json());
    assert.equal(state.ok, true);
    assert.equal(state.snapshot.worldEnergy, 120);

    // Connect Extension WS using first-frame auth (MV3 compatible)
    wsExt = new WebSocket(`${wsBase2}/ws/extension`);
    await new Promise((res) => wsExt.once('open', res));
    const extConnected = waitMessage(wsExt, (m) => m.type === 'connected');
    wsExt.send(JSON.stringify({ type: 'auth', guid, token: deviceToken }));
    await extConnected;

    // Connect Web WS using 1-year cookie
    wsWeb = new WebSocket(`${wsBase2}/ws/web`, { headers: { Cookie: cookiePair } });
    await waitMessage(wsWeb, (m) => m.type === 'subscribed');

    // Web dispatches emergency recall -> Extension receives -> Extension acks -> Web receives command_updated
    const extCmdPromise = waitMessage(wsExt, (m) => m.type === 'command');
    const webAckPromise = waitMessage(wsWeb, (m) => m.type === 'command_updated' && m.command?.status === 'done');

    const cmdRes = await fetch(`${base2}/api/web/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookiePair },
      body: JSON.stringify({ action: 'emergency-recall-gatherers', payload: {} }),
    }).then((r) => r.json());
    assert.equal(cmdRes.ok, true);
    assert.equal(cmdRes.delivered, true);

    const extMsg = await extCmdPromise;
    assert.equal(extMsg.command.id, cmdRes.command.id);
    assert.equal(extMsg.command.action, 'emergency-recall-gatherers');

    wsExt.send(JSON.stringify({ type: 'command-ack', id: extMsg.command.id, status: 'done', result: { recalled: 3 } }));
    const webAck = await webAckPromise;
    assert.equal(webAck.command.result.recalled, 3);
  } finally {
    wsExt?.close();
    wsWeb?.close();
    await s2.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('CP-01: Docker, Jenkinsfile, docker-compose and K8s manifests exist with safe configurations', async () => {
  const root = path.resolve('HWA-ControlPanel');
  const dockerfile = await fs.readFile(path.join(root, 'Dockerfile'), 'utf8');
  const jenkinsfile = await fs.readFile(path.join(root, 'Jenkinsfile'), 'utf8');
  const deployment = await fs.readFile(path.join(root, 'k8s/deployment.yaml'), 'utf8');
  const pvc = await fs.readFile(path.join(root, 'k8s/pvc.yaml'), 'utf8');
  const service = await fs.readFile(path.join(root, 'k8s/service.yaml'), 'utf8');
  const ingress = await fs.readFile(path.join(root, 'k8s/ingress.yaml'), 'utf8');

  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  assert.match(jenkinsfile, /withCredentials\(\[usernamePassword\(/);
  assert.match(jenkinsfile, /--password-stdin/);
  assert.match(deployment, /type:\s*Recreate/);
  assert.match(deployment, /\/healthz/);
  assert.match(deployment, /\/readyz/);
  assert.match(pvc, /ReadWriteOnce/);
  assert.match(service, /ClusterIP/);
  assert.match(ingress, /websocket-services/);
});
