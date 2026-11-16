import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recorderEntries, filterRecorderEntries } from '../src/composables/useRecorder.ts';

test('Log tab and recorderEntries handle MQTT direction, topic, and payload', async () => {
  const stored = {
    'record:1': {
      transport: 'websocket',
      method: 'PUBLISH',
      endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt',
      status: null,
      durationMs: 0,
      outcome: 'completed',
      timestamp: '2026-11-05T12:00:00Z',
      direction: 'received',
      topic: 'hero/update',
      qos: 1,
      payload: '{"hero":1}',
      encoding: 'utf8',
      payloadBytes: 10,
      eventMethod: 'msg',
      eventType: 'rallyCreated',
    }
  };

  const entries = recorderEntries(stored);
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.method, 'PUBLISH');
  assert.equal(entry.topic, 'hero/update');
  assert.equal(entry.eventType, 'rallyCreated');
  assert.equal(entry.payload, '{"hero":1}');

  const filteredTopic = filterRecorderEntries(entries, 'hero/update');
  assert.equal(filteredTopic.length, 1);

  const filteredEvent = filterRecorderEntries(entries, 'rallyCreated');
  assert.equal(filteredEvent.length, 1);

  const source = await readFile(new URL('../src/components/tabs/LogTab.vue', import.meta.url), 'utf8');
  assert.ok(source.includes('log.topic || log.endpoint'));
  assert.ok(source.includes('log.payload ?? log.requestBody'));
});
