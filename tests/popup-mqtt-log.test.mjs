import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const popup = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text || this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
}

test('Log tab displays MQTT direction, topic, and payload', () => {
  const view = new Element('main');
  const status = new Element('p');
  const context = { document: { createElement: (tag) => new Element(tag) },
    view, status, logSort: { value: 'newest' }, matches: () => true,
    formatTime: () => '12:00', showEmpty: () => {} };
  const source = popup.slice(popup.indexOf('function renderLog('), popup.indexOf('async function recordedEntries('));
  runInNewContext(source, context);
  context.renderLog([{
    transport: 'websocket', method: 'PUBLISH',
    endpoint: 'wss://emqx-hwmb-wss.nextersglobal.com/mqtt',
    status: null, durationMs: 0, outcome: 'completed', timestamp: '2026-11-05T12:00:00Z',
    direction: 'received', topic: 'hero/update', qos: 1,
    payload: '{"hero":1}', encoding: 'utf8', payloadBytes: 10,
    eventMethod: 'msg', eventType: 'rallyCreated'
  }], { active: true });
  assert.match(status.textContent, /1 entries/);
  assert.match(view.textContent, /PUBLISHreceivedMQTT/);
  assert.match(view.textContent, /hero\/update/);
  assert.match(view.textContent, /rallyCreated/);
  assert.match(view.textContent, /\{"hero":1\}/);
});
