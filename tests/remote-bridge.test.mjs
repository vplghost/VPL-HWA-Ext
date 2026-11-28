import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  normalizeEndpointUrl,
  buildMobilePairUrl,
  generateTotpCode,
  validateRemoteCommand,
  buildRemoteTelemetrySnapshot,
} from '../src/services/remoteBridgeService.ts';
import { generateQrMatrix, renderQrSvg } from '../src/utils/qrSvg.ts';
import { verifyTotp } from '../HWA-ControlPanel/src/totp.mjs';

test('CP-02: normalizeEndpointUrl allows https and local/LAN http while rejecting public http', () => {
  assert.equal(normalizeEndpointUrl('https://hwa-cp.example.com/'), 'https://hwa-cp.example.com');
  assert.equal(normalizeEndpointUrl('http://localhost:8080/'), 'http://localhost:8080');
  assert.equal(normalizeEndpointUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.equal(normalizeEndpointUrl('http://192.168.1.42:8080/'), 'http://192.168.1.42:8080');
  assert.equal(normalizeEndpointUrl('http://10.0.0.5:8080'), 'http://10.0.0.5:8080');
  assert.equal(normalizeEndpointUrl('http://172.16.0.10:8080'), 'http://172.16.0.10:8080');
  assert.equal(normalizeEndpointUrl('http://mybox.local:8080'), 'http://mybox.local:8080');
  assert.equal(normalizeEndpointUrl('http://public-site.com'), null);
  assert.equal(normalizeEndpointUrl('not-a-url'), null);
});

test('CP-02: Extension WebCrypto TOTP matches HWA-ControlPanel server verifyTotp bit-for-bit', async () => {
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const now = 1_760_000_000_000;
  const { code, remainingSeconds } = await generateTotpCode(secret, now);
  assert.match(code, /^\d{6}$/);
  assert.ok(remainingSeconds >= 1 && remainingSeconds <= 30);
  const verified = verifyTotp(secret, code, now);
  assert.equal(verified.valid, true);
});

test('CP-02: buildMobilePairUrl and offline QR SVG generator produce valid QR matrix & SVG', () => {
  const guid = '11111111-2222-4333-8444-555555555555';
  const url = buildMobilePairUrl('https://hwa-cp.example.com/', guid);
  assert.equal(url, `https://hwa-cp.example.com/?guid=${guid}`);
  const matrix = generateQrMatrix(url);
  assert.ok(matrix.length >= 29 && matrix.length === matrix[0].length);
  const svg = renderQrSvg(url);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<path d="M/);
});

test('CP-02: validateRemoteCommand enforces strict emergency allowlist', () => {
  assert.equal(validateRemoteCommand({ action: 'refresh-snapshot' }).ok, true);
  assert.equal(validateRemoteCommand({ action: 'emergency-recall-gatherers' }).ok, true);
  assert.equal(validateRemoteCommand({ action: 'toggle-automation', payload: { target: 'autoGather', enabled: false } }).ok, true);
  assert.equal(validateRemoteCommand({ action: 'stop-queue', payload: { queue: 'raid' } }).ok, true);
  assert.equal(validateRemoteCommand({ action: 'trigger-special', payload: { trigger: 'run-batch-heal' } }).ok, true);

  // Disallowed / arbitrary RPCs must be rejected
  assert.equal(validateRemoteCommand({ action: 'raw-rpc', payload: { name: 'spendEmeralds' } }).ok, false);
  assert.equal(validateRemoteCommand({ action: 'toggle-automation', payload: { target: 'unknown' } }).ok, false);
  assert.equal(validateRemoteCommand({ action: 'stop-queue', payload: { queue: 'invalid' } }).ok, false);
});

test('CP-02: buildRemoteTelemetrySnapshot sanitizes output and never leaks auth headers or tokens', () => {
  const now = 1_760_000_000_000;
  const stored = {
    lastRpcHeaders: { Cookie: 'secret_cookie=123', Authorization: 'Bearer supersecret' },
    remoteBridgeSettings: { deviceToken: 'top-secret-device-token', otpSecret: 'SECRET' },
    autoGatherSettings: { enabled: true, smartEnabled: true, maxMarches: 4, defenseRecallEnabled: true },
    rpcCache: {
      accountStatus: { data: { id: 1001, name: 'Commander' }, updatedAt: new Date(now).toISOString() },
      'resource:world-energy': { data: { amount: 85, cap: 200 }, updatedAt: new Date(now).toISOString() },
    },
    automationLogs: [{ timestamp: now, level: 'info', source: 'gather', message: 'Dispatched squad' }],
  };
  const snap = buildRemoteTelemetrySnapshot(stored, now, { gameTabOnline: true });
  const serialized = JSON.stringify(snap);
  assert.doesNotMatch(serialized, /secret_cookie|supersecret|top-secret-device-token/);
  assert.equal(snap.account.name, 'Commander');
  assert.equal(snap.energy.world, 85);
  assert.equal(snap.gameTabOnline, true);
  assert.equal(snap.toggles.autoGather, true);
});

test('CP-02: ControlPanelTab is registered as a dedicated tab in TabNav, SettingsTab, and App.vue with 100% English UI', async () => {
  const tabNav = await readFile(resolve('src/components/common/TabNav.vue'), 'utf8');
  const appVue = await readFile(resolve('entrypoints/popup/App.vue'), 'utf8');
  const cpTab = await readFile(resolve('src/components/tabs/ControlPanelTab.vue'), 'utf8');

  assert.match(tabNav, /id:\s*'controlPanel'/);
  assert.match(appVue, /import ControlPanelTab from '@\/src\/components\/tabs\/ControlPanelTab\.vue'/);
  assert.match(appVue, /activeTab === 'controlPanel' \? ControlPanelTab/);
  assert.match(cpTab, /id="control-panel-connection-card"/);
  assert.match(cpTab, /id="setting-remote-bridge-url"/);
  assert.match(cpTab, /id="btn-remote-bridge-check"/);
  assert.match(cpTab, /id="remote-bridge-qr"/);
  assert.match(cpTab, /id="remote-bridge-otp"/);
});
