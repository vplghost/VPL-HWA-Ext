import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this._textContent = '';
    this.value = '';
  }
  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => c.textContent).join('');
  }
  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }
  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new MockElement('#text');
        textNode.textContent = node;
        this.children.push(textNode);
      } else if (node) {
        this.children.push(node);
      }
    }
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener() {}
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector(selector) {
    return this.children.find(c => c.className?.includes(selector.replace('.', ''))) || null;
  }
  querySelectorAll() {
    return [];
  }
}

const mockDoc = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (_, tag) => new MockElement(tag)
};

const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const popupDataJs = await readFile(new URL('../extension/popup-data.js', import.meta.url), 'utf8');

const view = new MockElement('div');
const status = new MockElement('p');
const search = new MockElement('input');

const context = {
  document: mockDoc,
  globalThis: {},
  view,
  status,
  search,
  showEmpty: (msg) => {
    const p = new MockElement('p');
    p.textContent = msg;
    view.append(p);
  }
};

vm.runInNewContext(popupDataJs, context);

// Extract renderGuildChat function
const startIdx = popupJs.indexOf('function renderGuildChat(');
const endIdx = popupJs.indexOf('async function render()');
const chatCode = popupJs.slice(startIdx, endIdx);
vm.runInNewContext(chatCode, context);

test('renderGuildChat shows empty prompt when no chat data is in cache', () => {
  view.replaceChildren();
  search.value = '';
  context.renderGuildChat({});
  assert.match(view.textContent, /No guild chat messages observed yet/);
});

test('renderGuildChat renders message cards with sender, role, time, and content', () => {
  view.replaceChildren();
  search.value = '';
  const cache = {
    guildChat: {
      data: {
        messages: [
          {
            id: '1',
            userId: '1001',
            ctime: '1793538537',
            chatType: 'clan',
            data: { text: 'Thanks for the gift code!', clanRole: '3' }
          },
          {
            id: '2',
            userId: '1002',
            ctime: '1793538600',
            chatType: 'announcement',
            data: { text: 'Code: CRIMSONGROVE', clanRole: '255' }
          }
        ],
        users: {
          '1001': { id: '1001', name: 'BobMember', level: '75', clanRole: '3' },
          '1002': { id: '1002', name: 'AliceLeader', level: '90', clanRole: '255' }
        }
      }
    }
  };

  context.renderGuildChat(cache);

  const text = view.textContent;
  assert.ok(text.includes('BobMember'), 'Should render member name');
  assert.ok(text.includes('Lv.75'), 'Should render member level');
  assert.ok(text.includes('Thanks for the gift code!'), 'Should render member text');
  assert.ok(text.includes('AliceLeader'), 'Should render leader name');
  assert.ok(text.includes('Lv.90'), 'Should render leader level');
  assert.ok(text.includes('Announcement'), 'Should render Announcement badge');
  assert.ok(text.includes('Code: CRIMSONGROVE'), 'Should render announcement text');
  assert.equal(status.textContent, '2 guild messages');
});

test('renderGuildChat filters messages according to search query', () => {
  view.replaceChildren();
  search.value = 'CRIMSON';
  const cache = {
    guildChat: {
      data: {
        messages: [
          {
            id: '1',
            userId: '1001',
            ctime: '1793538537',
            chatType: 'clan',
            data: { text: 'Thanks for the gift code!', clanRole: '3' }
          },
          {
            id: '2',
            userId: '1002',
            ctime: '1793538600',
            chatType: 'announcement',
            data: { text: 'Code: CRIMSONGROVE', clanRole: '255' }
          }
        ],
        users: {
          '1001': { id: '1001', name: 'BobMember', level: '75', clanRole: '3' },
          '1002': { id: '1002', name: 'AliceLeader', level: '90', clanRole: '255' }
        }
      }
    }
  };

  context.renderGuildChat(cache);

  const text = view.textContent;
  assert.ok(text.includes('Code: CRIMSONGROVE'), 'Should include matching announcement');
  assert.ok(!text.includes('Thanks for the gift code!'), 'Should exclude non-matching member text');
  assert.equal(status.textContent, '1 guild message');
});
