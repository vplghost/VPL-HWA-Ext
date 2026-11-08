import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.attributes = {};
    this.open = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name, event = {}) { await this.listeners[name]?.({ currentTarget: this, target: this, ...event }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  all(tag) {
    return this.children.flatMap((c) => [
      ...(c.tagName === tag ? [c] : []),
      ...(typeof c.all === 'function' ? c.all(tag) : [])
    ]);
  }
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (this.attributes?.id === id || this.id === id) return this;
      for (const c of this.children) {
        if (c.querySelector) {
          const res = c.querySelector(sel);
          if (res) return res;
        }
      }
    }
    return null;
  }
  set innerHTML(html) {
    this._innerHTML = html;
    // Create simple representation text
    this.textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  get innerHTML() {
    if (this._innerHTML) return this._innerHTML;
    return this.children.map((c) => c.innerHTML).join(' ') || this.textContent;
  }
}

const popup = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');

test('popup.html defines building-dialog and research-dialog with title, status, and body', () => {
  assert.match(popupHtml, /<dialog id="building-dialog"[\s\S]*id="building-dialog-title"[\s\S]*id="building-dialog-status"[\s\S]*id="building-dialog-body"[\s\S]*<\/dialog>/);
  assert.match(popupHtml, /<dialog id="research-dialog"[\s\S]*id="research-dialog-title"[\s\S]*id="research-dialog-status"[\s\S]*id="research-dialog-body"[\s\S]*<\/dialog>/);
  assert.match(popupHtml, /<span id="building-badge"[\s\S]*<span id="building-time">/);
  assert.match(popupHtml, /<span id="research-badge"[\s\S]*<span id="research-time">/);
});

test('Header badge click opens building-dialog and research-dialog', async () => {
  const buildingBadge = new MockElement('span');
  const researchBadge = new MockElement('span');
  const buildingDialog = new MockElement('dialog');
  const researchDialog = new MockElement('dialog');
  const buildingBody = new MockElement('div');
  const researchBody = new MockElement('div');
  const buildingStatus = new MockElement('div');
  const researchStatus = new MockElement('div');

  const elements = {
    '#building-badge': buildingBadge,
    '#research-badge': researchBadge,
    '#building-dialog': buildingDialog,
    '#research-dialog': researchDialog,
    '#building-dialog-body': buildingBody,
    '#research-dialog-body': researchBody,
    '#building-dialog-status': buildingStatus,
    '#research-dialog-status': researchStatus
  };

  const context = vm.createContext({
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null,
      querySelectorAll: () => []
    },
    currentCache: {
      buildingStatus: {
        data: {
          queues: [{ buildingId: 20, level: 15, startDate: Date.now() - 1000, durationMs: 3600000, queueNumber: 0 }],
          buildings: [{ buildingId: 20, level: 14 }]
        }
      },
      researchStatus: {
        data: {
          queues: [{ researchId: 512, level: 4, startDate: Date.now() - 1000, durationMs: 1800000, queueNumber: 0 }],
          completedResearches: [{ researchId: 512, level: 3 }]
        }
      }
    },
    hwaHelperNameMap: {
      building: (id) => `BuildingName ${id}`,
      research: (id) => `ResearchName ${id}`
    },
    hwaHelperNameData: {
      names: {
        building: { '20': 'BuildingName 20', '21': 'BuildingName 21' },
        research: { '512': 'ResearchName 512', '513': 'ResearchName 513' }
      }
    }
  });

  const setupCode = popup.slice(
    popup.indexOf("let buildingSearchQuery = '';"),
    popup.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  context.setupBuildingAndResearchDialogs();

  // Test opening building dialog
  assert.equal(buildingDialog.open, false);
  await buildingBadge.fire('click');
  assert.equal(buildingDialog.open, true, 'building dialog opened on badge click');
  assert.ok(buildingBody.children.length > 0, 'building dialog body rendered');
  assert.match(buildingStatus.innerHTML, /Active:.*BuildingName 20.*Lv\. 15/);

  // Test opening research dialog
  assert.equal(researchDialog.open, false);
  await researchBadge.fire('click');
  assert.equal(researchDialog.open, true, 'research dialog opened on badge click');
  assert.ok(researchBody.children.length > 0, 'research dialog body rendered');
  assert.match(researchStatus.innerHTML, /Active:.*ResearchName 512.*Lv\. 4/);
});

test('renderBuildingDialog renders idle state when no active queues and lists next upgradable buildings', () => {
  const buildingBody = new MockElement('div');
  const buildingStatus = new MockElement('div');

  const elements = {
    '#building-dialog-body': buildingBody,
    '#building-dialog-status': buildingStatus
  };

  const context = vm.createContext({
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    hwaHelperNameMap: {
      building: (id) => `Building ${id}`
    },
    hwaHelperNameData: {
      names: {
        building: { '20': 'Hall of Heroes', '21': 'House 1', '26': 'Sawmill' }
      }
    }
  });

  const setupCode = popup.slice(
    popup.indexOf("let buildingSearchQuery = '';"),
    popup.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  context.renderBuildingDialog({
    buildingStatus: {
      data: {
        queues: [],
        buildings: [
          { buildingId: 20, level: 10 },
          { buildingId: 21, level: 5 }
        ]
      }
    }
  });

  // Verify idle status
  assert.match(buildingStatus.innerHTML, /Idle/);
  // Verify sections: Active Queue (idle), Next Upgradable, All City Buildings
  assert.equal(buildingBody.children.length, 3);
  const queueSection = buildingBody.children[0];
  assert.match(queueSection.innerHTML, /Builder is currently idle/);

  const nextSection = buildingBody.children[1];
  assert.match(nextSection.innerHTML, /Next Upgradable Buildings/);
  // Verify Upgrade/Build button exists in Next Upgradable card
  assert.match(nextSection.innerHTML, /Upgrade|Build/);

  const dirSection = buildingBody.children[2];
  assert.match(dirSection.innerHTML, /All City Buildings/);
});

test('renderResearchDialog renders idle state and filter tabs', () => {
  const researchBody = new MockElement('div');
  const researchStatus = new MockElement('div');

  const elements = {
    '#research-dialog-body': researchBody,
    '#research-dialog-status': researchStatus
  };

  const context = vm.createContext({
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    hwaHelperNameMap: {
      research: (id) => `Research ${id}`
    },
    hwaHelperNameData: {
      names: {
        research: { '512': 'Armor-Piercing', '513': 'Barrier Breaker' }
      }
    }
  });

  const setupCode = popup.slice(
    popup.indexOf("let buildingSearchQuery = '';"),
    popup.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  context.renderResearchDialog({
    researchStatus: {
      data: {
        queues: [],
        completedResearches: [
          { researchId: 512, level: 2 }
        ]
      }
    }
  });

  // Verify idle status
  assert.match(researchStatus.innerHTML, /Idle/);
  // Verify sections
  assert.equal(researchBody.children.length, 3);
  const queueSection = researchBody.children[0];
  assert.match(queueSection.innerHTML, /Academy is currently idle/);

  const nextSection = researchBody.children[1];
  assert.match(nextSection.innerHTML, /Next Research Candidates/);

  const dirSection = researchBody.children[2];
  assert.match(dirSection.innerHTML, /Personal Research Directory/);
});

test('renderBuildingDialog filters out unbuilt buildings, upgrading buildings, and buildings capped by Hall of Heroes', () => {
  const buildingBody = new MockElement('div');
  const buildingStatus = new MockElement('div');

  const elements = {
    '#building-dialog-body': buildingBody,
    '#building-dialog-status': buildingStatus
  };

  const context = vm.createContext({
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    hwaHelperNameMap: {
      building: (id) => `Building ${id}`
    },
    hwaHelperNameData: {
      names: {
        building: {
          '20': 'Hall of Heroes',
          '21': 'House 1',
          '22': 'House 2',
          '23': 'Bed',
          '26': 'Sawmill'
        }
      }
    }
  });

  const setupCode = popup.slice(
    popup.indexOf("let buildingSearchQuery = '';"),
    popup.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  // Hall of Heroes is Lv. 10.
  // House 1 (21) is Lv. 8 (can upgrade to 9 because 8 < 10) -> SHOULD be candidate
  // House 2 (22) is Lv. 10 (CANNOT upgrade because 10 >= 10, capped by Hall of Heroes) -> FILTERED OUT
  // Sawmill (26) is Lv. 5, but currently in activeQueues upgrading to 6 -> FILTERED OUT
  // Bed (23) is in dictionary but NOT built (level 0) -> FILTERED OUT
  // Hall of Heroes (20) itself is Lv. 10 and not upgrading -> SHOULD be candidate
  context.renderBuildingDialog({
    buildingStatus: {
      data: {
        queues: [
          { buildingId: 26, level: 6, startDate: Date.now() - 1000, durationMs: 3600000, queueNumber: 0 }
        ],
        buildings: [
          { buildingId: 20, level: 10 },
          { buildingId: 21, level: 8 },
          { buildingId: 22, level: 10 },
          { buildingId: 26, level: 5 }
        ]
      }
    }
  });

  const nextSection = buildingBody.children[1];
  const nextText = nextSection.innerHTML;
  assert.match(nextText, /2 ready/);
  assert.ok(nextText.includes('Building 20'), 'Hall of Heroes should be candidate');
  assert.ok(nextText.includes('Building 21'), 'House 1 (level 8 < 10) should be candidate');
  assert.ok(!nextText.includes('Building 22'), 'House 2 (level 10 == Hall level) must be filtered out');
  assert.ok(!nextText.includes('Building 23'), 'Bed (unbuilt level 0) must be filtered out');
  assert.ok(!nextText.includes('Building 26'), 'Sawmill (currently upgrading) must be filtered out');
});

test('renderResearchDialog filters out uncompleted tech, active tech, and tech exceeding Research Center level', () => {
  const researchBody = new MockElement('div');
  const researchStatus = new MockElement('div');

  const elements = {
    '#research-dialog-body': researchBody,
    '#research-dialog-status': researchStatus
  };

  const context = vm.createContext({
    document: {
      createElement: (tag) => new MockElement(tag),
      querySelector: (sel) => elements[sel] || null
    },
    hwaHelperNameMap: {
      research: (id) => `Research ${id}`
    },
    hwaHelperNameData: {
      names: {
        research: {
          '512': 'Armor-Piercing',
          '513': 'Barrier Breaker',
          '514': 'Magic Shield',
          '515': 'Locked Future Tech'
        }
      }
    }
  });

  const setupCode = popup.slice(
    popup.indexOf("let buildingSearchQuery = '';"),
    popup.indexOf('globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;') +
      'globalThis.setupBuildingAndResearchDialogs = setupBuildingAndResearchDialogs;'.length
  );
  vm.runInContext(setupCode, context);

  // Research Center (building 43) is Lv. 3
  // 512 is completed Lv. 2 -> nextLevel 3 <= 3 -> SHOULD be candidate
  // 513 is completed Lv. 3 -> nextLevel 4 > 3 -> FILTERED OUT (exceeds Research Center)
  // 514 is completed Lv. 1, but currently researching to 2 -> FILTERED OUT (actively researching)
  // 515 is in dictionary but uncompleted (level 0) -> FILTERED OUT
  context.renderResearchDialog({
    buildingStatus: {
      data: {
        buildings: [
          { buildingId: 43, level: 3 }
        ]
      }
    },
    researchStatus: {
      data: {
        queues: [
          { researchId: 514, level: 2, startDate: Date.now() - 1000, durationMs: 1800000, queueNumber: 0 }
        ],
        completedResearches: [
          { researchId: 512, level: 2 },
          { researchId: 513, level: 3 },
          { researchId: 514, level: 1 }
        ]
      }
    }
  });

  const nextSection = researchBody.children[1];
  const nextText = nextSection.innerHTML;
  assert.match(nextText, /1 available/);
  assert.ok(nextText.includes('Research 512'), 'Tech 512 (nextLevel 3 <= Research Center 3) should be candidate');
  assert.ok(!nextText.includes('Research 513'), 'Tech 513 (nextLevel 4 > Research Center 3) must be filtered out');
  assert.ok(!nextText.includes('Research 514'), 'Tech 514 (currently researching) must be filtered out');
  assert.ok(!nextText.includes('Research 515'), 'Tech 515 (unresearched level 0) must be filtered out');
});
