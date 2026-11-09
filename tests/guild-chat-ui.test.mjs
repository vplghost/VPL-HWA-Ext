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
  get innerHTML() { return this._innerHTML || ''; }
  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = String(val).replace(/<[^>]*>/g, '');
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
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener() {}
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector(selector) {
    return this.children.find(c => c.className?.includes(selector.replace('.', ''))) || null;
  }
  querySelectorAll() {
    return [];
  }
}

const otherList = new MockElement('div');
const otherCount = new MockElement('span');
const chatBadge = new MockElement('span');
const chatCount = new MockElement('span');
const chatMessages = new MockElement('div');
const chatPanel = new MockElement('div');

const mockLocalStorage = {};
const mockChrome = {
  storage: {
    local: {
      get: async (keys) => {
        const res = {};
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) {
          if (k in mockLocalStorage) res[k] = mockLocalStorage[k];
        }
        return res;
      },
      set: async (obj) => {
        Object.assign(mockLocalStorage, obj);
      }
    }
  }
};

const mockDoc = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (_, tag) => new MockElement(tag),
  querySelector: (sel) => {
    if (sel === '#config-other-list') return otherList;
    if (sel === '#config-other-count') return otherCount;
    if (sel === '#guild-chat-badge') return chatBadge;
    if (sel === '#guild-chat-count') return chatCount;
    if (sel === '#guild-chat-messages') return chatMessages;
    if (sel === '#guild-chat-panel') return chatPanel;
    return null;
  }
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
  chrome: mockChrome,
  currentGuildChatLastReadTime: 0,
  showEmpty: (msg) => {
    const p = new MockElement('p');
    p.textContent = msg;
    view.append(p);
  }
};

vm.runInNewContext(popupDataJs, context);

// Extract renderConfigOther and renderGuildChat functions
const startIdx = popupJs.indexOf('function renderConfigOther(');
const endIdx = popupJs.indexOf('async function render()');
const chatCode = popupJs.slice(startIdx, endIdx);
vm.runInNewContext(chatCode, context);

test('renderGuildChat shows empty prompt when no chat data is in cache', () => {
  view.replaceChildren();
  chatMessages.replaceChildren();
  search.value = '';
  context.renderGuildChat({});
  assert.match(chatMessages.textContent, /No guild chat messages observed yet/);
  assert.equal(view.children.length, 0, 'main view must not be overwritten');
});

test('renderGuildChat renders message cards with sender, role, time, and content', () => {
  view.replaceChildren();
  chatMessages.replaceChildren();
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

  const text = chatMessages.textContent;
  assert.ok(text.includes('BobMember'), 'Should render member name');
  assert.ok(text.includes('Lv.75'), 'Should render member level');
  assert.ok(text.includes('Thanks for the gift code!'), 'Should render member text');
  assert.ok(text.includes('AliceLeader'), 'Should render leader name');
  assert.ok(text.includes('Lv.90'), 'Should render leader level');
  assert.ok(text.includes('Announcement'), 'Should render Announcement badge');
  assert.ok(text.includes('Code: CRIMSONGROVE'), 'Should render announcement text');
  assert.equal(chatCount.textContent, '2');
  assert.equal(view.children.length, 0, 'main view must not be overwritten');
});

test('renderGuildChat filters messages according to search query', () => {
  view.replaceChildren();
  chatMessages.replaceChildren();
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

  const text = chatMessages.textContent;
  assert.ok(text.includes('Code: CRIMSONGROVE'), 'Should include matching announcement');
  assert.ok(!text.includes('Thanks for the gift code!'), 'Should exclude non-matching member text');
  assert.equal(chatCount.textContent, '2');
  assert.equal(view.children.length, 0, 'main view must not be overwritten');
});

test('renderGuildChat limits visible messages to latest batch and indicates older messages', () => {
  view.replaceChildren();
  chatMessages.replaceChildren();
  search.value = '';
  const messages = [];
  for (let i = 1; i <= 25; i++) {
    messages.push({
      id: String(i),
      userId: '1001',
      ctime: String(1793538500 + i),
      chatType: 'clan',
      data: { text: `Message number ${i}`, clanRole: '3' }
    });
  }
  const cache = {
    guildChat: {
      data: {
        messages,
        users: { '1001': { id: '1001', name: 'Member1', level: '50', clanRole: '3' } }
      }
    }
  };

  context.renderGuildChat(cache);
  assert.equal(chatCount.textContent, '25');
  assert.ok(chatMessages.textContent.includes('Scroll up for older messages (10 more)'));
  assert.ok(chatMessages.textContent.includes('Message number 25'));
  assert.ok(chatMessages.textContent.includes('Message number 11'));
  assert.ok(!chatMessages.textContent.includes('Message number 10'));
  assert.equal(view.children.length, 0, 'main view must not be overwritten');
});

test('renderGuildChat sorts messages chronologically ascending with newest at the bottom', () => {
  view.replaceChildren();
  chatMessages.replaceChildren();
  search.value = '';
  // Messages provided out of order / descending ctime (as cached from server)
  const messages = [
    { id: '3', userId: '1001', ctime: '1793539000', chatType: 'clan', data: { text: 'Newest message (bottom)', clanRole: '3' } },
    { id: '1', userId: '1001', ctime: '1793537000', chatType: 'clan', data: { text: 'Oldest message (top)', clanRole: '3' } },
    { id: '2', userId: '1001', ctime: '1793538000', chatType: 'clan', data: { text: 'Middle message', clanRole: '3' } }
  ];
  const cache = {
    guildChat: {
      data: {
        messages,
        users: { '1001': { id: '1001', name: 'Member1', level: '60', clanRole: '3' } }
      }
    }
  };

  context.renderGuildChat(cache);
  assert.equal(chatCount.textContent, '3');
  assert.equal(chatMessages.children.length, 3);
  assert.ok(chatMessages.children[0].textContent.includes('Oldest message (top)'));
  assert.ok(chatMessages.children[1].textContent.includes('Middle message'));
  assert.ok(chatMessages.children[2].textContent.includes('Newest message (bottom)'));
  assert.equal(view.children.length, 0, 'main view must not be overwritten');
});

test('renderConfigOther populates other snapshots section with keys and count', () => {
  otherList.replaceChildren();
  const cache = {
    heroGetAll: { key: 'heroGetAll', data: {} },
    unknownRpcSnapshot: { key: 'unknownRpcSnapshot', method: 'clanRaid_getInfo', feature: 'clan', data: { raidId: 123, active: true } },
    customSettingSnapshot: { key: 'customSettingSnapshot', method: 'user_getSettings', feature: 'user', data: [1, 2, 3] }
  };

  context.renderConfigOther(cache);
  assert.equal(otherCount.textContent, '2 snapshots');
  assert.ok(otherList.textContent.includes('clanRaid_getInfo'));
  assert.ok(otherList.textContent.includes('user_getSettings'));
});

test('updateGuildChatBadge computes unread count accurately against lastReadTime and toggles badge', () => {
  const cache = {
    guildChat: {
      data: {
        messages: [
          { id: '1', ctime: '1793530000', data: { text: 'Msg 1' } },
          { id: '2', ctime: '1793531000', data: { text: 'Msg 2' } },
          { id: '3', ctime: '1793532000', data: { text: 'Msg 3' } }
        ]
      }
    }
  };

  // When lastReadTime is 0 (never read), all messages are unread
  const unread1 = context.updateGuildChatBadge(cache, 0);
  assert.equal(unread1, 3);
  assert.equal(chatBadge.hidden, false);
  assert.equal(chatBadge.textContent, '3');
  assert.equal(chatCount.textContent, '3');

  // When lastReadTime is 1793531000, only message 3 is unread
  const unread2 = context.updateGuildChatBadge(cache, 1793531000);
  assert.equal(unread2, 1);
  assert.equal(chatBadge.hidden, false);
  assert.equal(chatBadge.textContent, '1');

  // When lastReadTime is 1793532000 (all read), badge is hidden
  const unread3 = context.updateGuildChatBadge(cache, 1793532000);
  assert.equal(unread3, 0);
  assert.equal(chatBadge.hidden, true);
  assert.equal(chatBadge.textContent, '');
});

test('markGuildChatAsRead persists max ctime in chrome.storage.local and clears badge', async () => {
  const cache = {
    guildChat: {
      data: {
        messages: [
          { id: '1', ctime: '1793530000', data: { text: 'Msg 1' } },
          { id: '2', ctime: '1793535000', data: { text: 'Msg 2' } }
        ]
      }
    }
  };

  context.currentGuildChatLastReadTime = 1793530000;
  await context.markGuildChatAsRead(cache);

  assert.equal(context.currentGuildChatLastReadTime, 1793535000);
  assert.equal(mockLocalStorage.guildChatLastReadTime, 1793535000);
  assert.equal(chatBadge.hidden, true);
});

test('renderGuildChat flags messages newer than previousReadTime with New badge', () => {
  view.replaceChildren();
  chatMessages.replaceChildren();
  search.value = '';
  const cache = {
    guildChat: {
      data: {
        messages: [
          { id: '1', userId: '1001', ctime: '1793530000', chatType: 'clan', data: { text: 'Old message' } },
          { id: '2', userId: '1001', ctime: '1793535000', chatType: 'clan', data: { text: 'Brand new message' } }
        ],
        users: { '1001': { id: '1001', name: 'Member1', level: '70', clanRole: '3' } }
      }
    }
  };

  // Pass previousReadTime as 1793530000 -> message 2 should have New badge
  context.renderGuildChat(cache, false, 1793530000);

  assert.equal(chatMessages.children.length, 2);
  const oldCard = chatMessages.children[0];
  const newCard = chatMessages.children[1];

  assert.ok(!oldCard.textContent.includes('New'));
  assert.ok(newCard.textContent.includes('New'));
  assert.ok(newCard.textContent.includes('Brand new message'));
  assert.equal(view.children.length, 0, 'main view must not be overwritten');
});

test('renderGuildChat falls back to view and updates status only when chatMessages element is absent', () => {
  view.replaceChildren();
  status.textContent = 'Original Status';
  search.value = '';
  const cache = {
    guildChat: {
      data: {
        messages: [
          { id: '1', userId: '1001', ctime: '1793530000', chatType: 'clan', data: { text: 'Fallback message' } }
        ],
        users: { '1001': { id: '1001', name: 'Member1', level: '70', clanRole: '3' } }
      }
    }
  };

  const savedQuerySelector = mockDoc.querySelector;
  mockDoc.querySelector = (sel) => (sel === '#guild-chat-messages' ? null : savedQuerySelector(sel));
  try {
    context.renderGuildChat(cache);
    assert.equal(view.children.length, 1);
    assert.ok(view.textContent.includes('Fallback message'));
    assert.equal(status.textContent, '1 guild message');
  } finally {
    mockDoc.querySelector = savedQuerySelector;
  }
});

test('opening guild chat FAB preserves existing page tab content in view and status bar', () => {
  view.replaceChildren();
  const heroCard = new MockElement('div');
  heroCard.textContent = 'Dante (Hero details)';
  view.append(heroCard);
  status.textContent = '54 heroes';
  chatMessages.replaceChildren();

  const cache = {
    guildChat: {
      data: {
        messages: [
          { id: '1', userId: '1001', ctime: '1793530000', chatType: 'clan', data: { text: 'Guild message' } }
        ]
      }
    }
  };

  context.renderGuildChat(cache);

  // FAB panel gets the messages
  assert.ok(chatMessages.textContent.includes('Guild message'));
  // Main view content and status remain completely untouched
  assert.equal(view.children.length, 1);
  assert.equal(view.children[0].textContent, 'Dante (Hero details)');
  assert.equal(status.textContent, '54 heroes');
});

test('renderGuildChat and updateGuildChatBadge auto clear messages older than 3 days of cache updatedAt', () => {
  view.replaceChildren();
  chatMessages.replaceChildren();
  search.value = '';

  const atNow = '2026-11-05T12:00:00.000Z';
  const nowSec = Math.floor(Date.parse(atNow) / 1000);
  const twoDaysAgo = String(nowSec - 2 * 86400);
  const fourDaysAgo = String(nowSec - 4 * 86400);

  const cache = {
    guildChat: {
      updatedAt: atNow,
      data: {
        messages: [
          { id: 'recent', userId: '1001', ctime: twoDaysAgo, chatType: 'clan', data: { text: 'Recent 2d message' } },
          { id: 'expired', userId: '1002', ctime: fourDaysAgo, chatType: 'clan', data: { text: 'Expired 4d message' } }
        ],
        users: {
          '1001': { id: '1001', name: 'ActiveMember' },
          '1002': { id: '1002', name: 'OldMember' }
        }
      }
    }
  };

  context.renderGuildChat(cache);
  assert.ok(chatMessages.textContent.includes('Recent 2d message'), 'Recent message should be rendered');
  assert.ok(!chatMessages.textContent.includes('Expired 4d message'), 'Messages older than 3 days should be cleared');

  const unread = context.updateGuildChatBadge(cache, 0);
  assert.equal(unread, 1, 'Only active 1 message within 3 days should count towards unread');
});
