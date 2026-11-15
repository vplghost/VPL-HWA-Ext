import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isTargetRpcUrl,
  isMqttUrl,
  createApiRecordMessage,
  createQueueStatusMessage
} from '../entrypoints/interceptor.content.ts';

test('isTargetRpcUrl and isMqttUrl identify game endpoints accurately', () => {
  assert.equal(isTargetRpcUrl('https://api.hero-wars-alliance.com/api/rpc'), true);
  assert.equal(isTargetRpcUrl('https://hero-wars-alliance.com/api/rpc'), true);
  assert.equal(isTargetRpcUrl('https://other-domain.com/api/rpc'), true);
  assert.equal(isTargetRpcUrl('https://example.com/asset.png'), false);
  assert.equal(isTargetRpcUrl(null), false);

  assert.equal(isMqttUrl('wss://emqx-hwmb-wss.nextersglobal.com/mqtt'), true);
  assert.equal(isMqttUrl('wss://game.hero-wars.com/mqtt'), true);
  assert.equal(isMqttUrl('wss://other-socket.com/ws'), false);
  assert.equal(isMqttUrl(null), false);
});

test('createApiRecordMessage and createQueueStatusMessage construct valid messages', () => {
  const dummyRecord = {
    endpoint: 'https://api.hero-wars-alliance.com/api/rpc',
    method: 'POST',
    status: 200,
    timestamp: '2026-11-15T12:00:00Z'
  };
  const msg = createApiRecordMessage(dummyRecord);
  assert.equal(msg.source, 'hwa-helper-api');
  assert.equal(msg.kind, 'api-record');
  assert.equal(msg.record.status, 200);

  // Queue status count clamped between 0 and 64
  assert.equal(createQueueStatusMessage(5).count, 5);
  assert.equal(createQueueStatusMessage(-3).count, 0);
  assert.equal(createQueueStatusMessage(120).count, 64);
});

test('entrypoints/interceptor.content.ts defines WXT defineContentScript with MAIN world', async () => {
  const content = await readFile(new URL('../entrypoints/interceptor.content.ts', import.meta.url), 'utf8');
  assert.ok(content.includes('defineContentScript('), 'Must use WXT defineContentScript entrypoint');
  assert.ok(content.includes("world: 'MAIN'"), "Must execute in MAIN world");
  assert.ok(content.includes('https://www.hero-wars-alliance.com/*'), 'Must match game domain');
  assert.ok(content.includes('document_start'), 'Must run at document_start');
});
