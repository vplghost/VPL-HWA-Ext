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
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className?.includes(cls)) return this;
      for (const c of this.children) {
        const found = c.querySelector?.(selector);
        if (found) return found;
      }
    } else {
      const tag = selector.toUpperCase();
      if (this.tagName === tag) return this;
      for (const c of this.children) {
        const found = c.querySelector?.(selector);
        if (found) return found;
      }
    }
    return null;
  }
}

const mockDoc = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (_, tag) => new MockElement(tag)
};

const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const heroMetaJs = await readFile(new URL('../extension/hero-metadata.js', import.meta.url), 'utf8');
const titanMetaJs = await readFile(new URL('../extension/titan-metadata.js', import.meta.url), 'utf8');
const heroStatJs = await readFile(new URL('../extension/hero-stat-data.js', import.meta.url), 'utf8');
const popupDataJs = await readFile(new URL('../extension/popup-data.js', import.meta.url), 'utf8');

// Extract helper functions and run in context
const context = {
  document: mockDoc,
  globalThis: {},
  formatNumber: (n) => String(n),
  currentCache: {},
  sortState: {},
  activeTab: 'heroes',
  favoriteHeroes: new Set(),
  favoriteTitans: new Set()
};
vm.runInNewContext(heroMetaJs, context);
vm.runInNewContext(titanMetaJs, context);
vm.runInNewContext(heroStatJs, context);
vm.runInNewContext(popupDataJs, context);

// Extract helper functions including table(headings, rows)
const codeToRun = popupJs.slice(
  popupJs.indexOf('function starIcons('),
  popupJs.indexOf('function showEmpty(')
);
vm.runInNewContext(codeToRun, context);

test('starGlowClass produces correct glow classes for star counts', () => {
  const { starGlowClass } = context;
  assert.equal(starGlowClass(1), 'avatar-star-1');
  assert.equal(starGlowClass(2), 'avatar-star-2');
  assert.equal(starGlowClass(3), 'avatar-star-3');
  assert.equal(starGlowClass(4), 'avatar-star-4');
  assert.equal(starGlowClass(5), 'avatar-star-5');
  assert.equal(starGlowClass(6), 'avatar-star-6');
  assert.equal(starGlowClass(undefined), 'avatar-star-default');
  assert.equal(starGlowClass(0), 'avatar-star-default');

  assert.equal(starGlowClass(1, true), 'avatar-star-lg-1');
  assert.equal(starGlowClass(6, true), 'avatar-star-lg-6');
  assert.equal(starGlowClass(null, true), 'avatar-star-lg-default');
});

test('createHeroInline wraps both avatar and text inside .hero-hover-trigger', () => {
  const { createHeroInline } = context;
  const container = createHeroInline('1', 'Aurora', { star: 5, power: 125000 });

  assert.ok(container.className.includes('hero-hover-trigger'), 'Container should be hover trigger');
  assert.ok(container.className.includes('cursor-pointer'), 'Container should have cursor pointer');

  const smallImg = container.children.find(c => c.tagName === 'IMG');
  assert.ok(smallImg, 'Container should include small avatar img');
  assert.equal(smallImg.src, 'assets/heroes/1.webp');
  assert.ok(smallImg.className.includes('avatar-star-5'), 'Avatar should have 5-star glow');

  const nameSpan = container.children.find(c => c.textContent === 'Aurora');
  assert.ok(nameSpan, 'Container should directly include name text span');

  const card = container.querySelector('.hero-hover-card');
  assert.ok(card, 'Card should be inside container');

  const bigImg = card.children[0].children.find(c => c.tagName === 'IMG');
  assert.ok(bigImg, 'Card should contain large avatar img');
  assert.ok(bigImg.className.includes('avatar-star-lg-5'), 'Large avatar should have 5-star lg glow');

  // Verify no parentheses star text like (5★)
  assert.ok(!card.textContent.includes('(5★)'), 'Card should not contain (5★) text');
});

test('createHeroInline renders skills, skins, glyphs, artifacts, and spark of power', () => {
  const { createHeroInline } = context;
  const heroSnapshot = {
    star: 5,
    power: 27826,
    titanGiftLevel: 22,
    skills: { '270': 40, '271': 40, '272': 50, '273': 60 },
    currentSkin: 307,
    skins: { '2': 54, '307': 20 },
    hero_runes: [40, 20, 20, 20, 0],
    artifacts: [
      { artifactType: 'weapon', star: 3, level: 40 },
      { artifactType: 'book', star: 2, level: 24 },
      { artifactType: 'ring', star: 2, level: 23 }
    ]
  };

  const container = createHeroInline('2', 'Galahad', heroSnapshot);
  const card = container.querySelector('.hero-hover-card');
  assert.ok(card, 'Card should exist');

  const text = card.textContent;
  // Spark of Power
  assert.ok(text.includes('Spark of Power') && text.includes('Lv. 22 / 30'), 'Should render Spark of Power');

  // Skills
  assert.ok(text.includes('S1: 40') && text.includes('S2: 40') && text.includes('S3: 50') && text.includes('S4: 60'), 'Should render Skills levels');

  // Skins (skin 2 is default PA, skin 307 is PA)
  assert.ok(text.includes('PA: 54') && text.includes('PA: 20'), 'Should render Skins with stat name and level');

  // Glyphs (Hero 2 Galahad glyphs: PA, Arm, HP, MD, Str)
  assert.ok(text.includes('PA: 40') && text.includes('Arm: 20') && text.includes('HP: 20') && text.includes('MD: 20') && text.includes('Str: 0'), 'Should render Glyphs with stat name and level');

  // Artifacts
  assert.ok(text.includes('Wpn: 3★ Lv.40') && text.includes('Book: 2★ Lv.24') && text.includes('Ring: 2★ Lv.23'), 'Should render Artifacts with stars and level');
});

test('createHeroInline renders accurate glyph stats and titles for Dante and Somna', () => {
  const { createHeroInline } = context;
  // Dante (Hero 16): PA: 30, Arm: 15, HP: 6, Dodge: 23, Agi: 15
  const danteCard = createHeroInline('16', 'Dante', {
    star: 5,
    hero_runes: [30, 15, 6, 23, 15]
  });
  const danteText = danteCard.textContent;
  assert.ok(danteText.includes('PA: 30'), 'Dante should have PA glyph');
  assert.ok(danteText.includes('Arm: 15'), 'Dante should have Arm glyph');
  assert.ok(danteText.includes('HP: 6'), 'Dante should have HP glyph');
  assert.ok(danteText.includes('Dodge: 23'), 'Dante should have Dodge glyph');
  assert.ok(danteText.includes('Agi: 15'), 'Dante should have Agi glyph');

  // Somna (Hero 70): PA: 15, HP: 10, Tough: 10, Arm: 0, Agi: 0
  const somnaCard = createHeroInline('70', 'Somna', {
    star: 4,
    hero_runes: [15, 10, 10, 0, 0]
  });
  const somnaText = somnaCard.textContent;
  assert.ok(somnaText.includes('PA: 15'), 'Somna should have PA glyph');
  assert.ok(somnaText.includes('HP: 10'), 'Somna should have HP glyph');
  assert.ok(somnaText.includes('Tough: 10'), 'Somna should have Tough glyph');
  assert.ok(somnaText.includes('Arm: 0'), 'Somna should have Arm glyph');
  assert.ok(somnaText.includes('Agi: 0'), 'Somna should have Agi glyph');
});

test('createHeroInline supports converted PNG avatars (e.g. Hero 65 Tempus)', () => {
  const { createHeroInline } = context;
  const container = createHeroInline('65', 'Tempus', { star: 4, power: 85000 });

  const smallImg = container.children.find(c => c.tagName === 'IMG');
  assert.ok(smallImg);
  assert.equal(smallImg.src, 'assets/heroes/65.png');
  assert.ok(smallImg.className.includes('avatar-star-4'));
});

test('createHeroInline renders fallback badge with star glow when avatar is absent (Hero 78)', () => {
  const { createHeroInline } = context;
  const container = createHeroInline('78', 'Wodryn', { star: 6 });

  const badge = container.children.find(c => c.tagName === 'SPAN' && c.textContent === 'W');
  assert.ok(badge, 'Should render initials badge W for Wodryn');
  assert.ok(badge.className.includes('avatar-star-6'), 'Badge should have 6-star glow');
});

test('createTitanInline creates hover trigger, avatar, star-glow, and card for titans', () => {
  const { createTitanInline } = context;
  const container = createTitanInline('4000', 'Sigurd', { star: 6, power: 150000 });

  assert.ok(container.className.includes('hero-hover-trigger'), 'Container should be hover trigger');
  assert.ok(container.className.includes('cursor-pointer'), 'Container should have cursor pointer');

  const smallImg = container.children.find(c => c.tagName === 'IMG');
  assert.ok(smallImg, 'Container should include small avatar img');
  assert.equal(smallImg.src, 'assets/titans/4000.png');
  assert.ok(smallImg.className.includes('avatar-star-6'), 'Avatar should have 6-star glow');

  const nameSpan = container.children.find(c => c.textContent === 'Sigurd');
  assert.ok(nameSpan, 'Container should directly include name text span');

  const card = container.querySelector('.hero-hover-card');
  assert.ok(card, 'Card should be inside container');

  const bigImg = card.children[0].children.find(c => c.tagName === 'IMG');
  assert.ok(bigImg, 'Card should contain large avatar img');
  assert.ok(bigImg.className.includes('avatar-star-lg-6'), 'Large avatar should have 6-star lg glow');

  assert.ok(card.textContent.includes('Water'), 'Card should mention Water element');
  assert.ok(card.textContent.includes('Tank'), 'Card should mention Tank role');
  assert.ok(!card.textContent.includes('(6★)'), 'Card should not contain (6★) text');
});

test('table highlights rows when soul stones meet or exceed upgrade threshold', () => {
  const { table } = context;
  const headings = ['Hero ID', 'Name', 'Level', 'Star', 'Soul stones', 'Power'];
  const rows = [
    ['1', 'Aurora', '120', 3, '100 / 100', '150,000'],
    ['2', 'Galahad', '120', 4, '40 / 150', '160,000'],
    ['3', 'Keira', '120', 6, '500 / Max', '180,000'],
    ['4', 'Astaroth', '120', 2, '— / 50', '140,000']
  ];

  const tableEl = table(headings, rows);
  const dataRows = tableEl.children.filter(c => c.tagName === 'TR').slice(1);
  assert.equal(dataRows.length, 4);

  // Sorted by default Power descending: Keira (180k), Galahad (160k), Aurora (150k), Astaroth (140k)
  // Row 2: Aurora (100 / 100) -> eligible for evolution
  assert.equal(dataRows[2].dataset.canEvolve, 'true');
  assert.ok(dataRows[2].className.includes('bg-emerald-50/70'));
  const soulCell2 = dataRows[2].children[4];
  assert.ok(soulCell2.className.includes('text-emerald-800'));
  assert.ok(soulCell2.className.includes('font-bold'));

  // Row 0: Keira (500 / Max) -> already maxed
  assert.notEqual(dataRows[0].dataset.canEvolve, 'true');
  assert.ok(!dataRows[0].className.includes('bg-emerald-50/70'));

  // Row 1: Galahad (40 / 150) -> not eligible
  assert.notEqual(dataRows[1].dataset.canEvolve, 'true');
  assert.ok(!dataRows[1].className.includes('bg-emerald-50/70'));

  // Row 3: Astaroth (— / 50) -> fragments unknown/null
  assert.notEqual(dataRows[3].dataset.canEvolve, 'true');
  assert.ok(!dataRows[3].className.includes('bg-emerald-50/70'));
});

test('table defaults to Power descending sort on Heroes tab', () => {
  const { table } = context;
  const headings = ['Hero ID', 'Name', 'Level', 'Star', 'Soul stones', 'Power'];
  const rows = [
    ['1', 'Aurora', '120', 3, '100 / 100', '150,000'],
    ['2', 'Galahad', '120', 4, '40 / 150', '160,000'],
    ['3', 'Keira', '120', 6, '500 / Max', '180,000'],
    ['4', 'Astaroth', '120', 2, '— / 50', '140,000']
  ];

  const tableEl = table(headings, rows);
  const dataRows = tableEl.children.filter(c => c.tagName === 'TR').slice(1);

  // Sorted by Power descending: Keira (180k), Galahad (160k), Aurora (150k), Astaroth (140k)
  assert.equal(dataRows[0].children[0].textContent, '3');
  assert.equal(dataRows[1].children[0].textContent, '2');
  assert.equal(dataRows[2].children[0].textContent, '1');
  assert.equal(dataRows[3].children[0].textContent, '4');

  // Power header has descending sort mark
  const headerCells = tableEl.children.find(c => c.tagName === 'TR').children;
  const powerHeader = headerCells[5];
  assert.equal(powerHeader.getAttribute('aria-sort'), 'descending');
  assert.ok(powerHeader.textContent.includes('Power ↓'));
});

test('favorite hero icon toggles favorite state and prioritizes favorite heroes at the top', () => {
  const { table } = context;
  context.favoriteHeroes = new Set(['1', '4']); // Aurora and Astaroth are favorites
  const headings = ['Hero ID', 'Name', 'Level', 'Star', 'Soul stones', 'Power'];
  const rows = [
    ['1', 'Aurora', '120', 3, '100 / 100', '150,000'],
    ['2', 'Galahad', '120', 4, '40 / 150', '160,000'],
    ['3', 'Keira', '120', 6, '500 / Max', '180,000'],
    ['4', 'Astaroth', '120', 2, '— / 50', '140,000']
  ];

  const tableEl = table(headings, rows);
  const dataRows = tableEl.children.filter(c => c.tagName === 'TR').slice(1);

  // Favorites at top (Aurora 150k, Astaroth 140k), then non-favorites (Keira 180k, Galahad 160k)
  assert.equal(dataRows[0].children[0].textContent, '1');
  assert.equal(dataRows[1].children[0].textContent, '4');
  assert.equal(dataRows[2].children[0].textContent, '3');
  assert.equal(dataRows[3].children[0].textContent, '2');

  assert.equal(dataRows[0].dataset.favorite, 'true');
  assert.equal(dataRows[1].dataset.favorite, 'true');
  assert.equal(dataRows[2].dataset.favorite, undefined);
  assert.equal(dataRows[3].dataset.favorite, undefined);

  // Favorite hero button has filled star and Remove favorite title
  const favBtn0 = dataRows[0].children[0].querySelector('button');
  assert.ok(favBtn0);
  assert.equal(favBtn0.getAttribute('title'), 'Remove favorite');
  const svg0 = favBtn0.querySelector('svg');
  assert.equal(svg0.getAttribute('fill'), 'currentColor');

  // Non-favorite hero button has outline star and Add favorite title
  const favBtn2 = dataRows[2].children[0].querySelector('button');
  assert.ok(favBtn2);
  assert.equal(favBtn2.getAttribute('title'), 'Add favorite');
  const svg2 = favBtn2.querySelector('svg');
  assert.equal(svg2.getAttribute('fill'), 'none');

  context.favoriteHeroes.clear();
});

test('createHeroInline renders Dante skin stats accurately with Dodge for skin 58', () => {
  const { createHeroInline } = context;
  const danteSnapshot = {
    star: 3,
    power: 26461,
    baseSkinId: 16,
    currentSkin: 58,
    skins: { '16': 32, '58': 21 }
  };

  const container = createHeroInline('16', 'Dante', danteSnapshot);
  const card = container.querySelector('.hero-hover-card');
  assert.ok(card, 'Card should exist');
  assert.ok(card.textContent.includes('Agi: 32'), 'Base skin should show Agi');
  assert.ok(card.textContent.includes('Dodge: 21'), 'Active skin 58 should show Dodge');
  assert.ok(!card.textContent.includes('PA: 21'), 'Skin 58 should NOT show PA');
});

test('createTitanInline renders enriched hover card with skills, skins, and artifacts', () => {
  const { createTitanInline } = context;
  const sigurdSnapshot = {
    star: 3,
    level: 45,
    power: 7358,
    skills: { '4001': 45 },
    currentSkin: 10001,
    skins: { '10001': 20, '10013': 10 },
    artifacts: [
      { level: 20, star: 3 },
      { level: 15, star: 1 },
      { level: 20, star: 2 }
    ]
  };

  const container = createTitanInline('4000', 'Sigurd', sigurdSnapshot);
  const card = container.querySelector('.hero-hover-card');
  assert.ok(card, 'Card should exist');
  assert.ok(card.textContent.includes('Tank'), 'Should mention Tank');
  assert.ok(card.textContent.includes('Water'), 'Should mention Water');
  assert.ok(card.textContent.includes('S1: 45'), 'Should display skill level');
  assert.ok(card.textContent.includes('Arm: 20'), 'Should display skin 10001 with Armor stat');
  assert.ok(card.textContent.includes('MD: 10'), 'Should display skin 10013 with MD stat');
  assert.ok(card.textContent.includes('Wpn: 3★ Lv.20'), 'Should display weapon artifact');
  assert.ok(card.textContent.includes('Crown: 1★ Lv.15'), 'Should display crown artifact');
  assert.ok(card.textContent.includes('Seal: 2★ Lv.20'), 'Should display seal artifact');
});

test('table supports favorite titans toggle and prioritizes favorites at the top', () => {
  const { table } = context;
  context.activeTab = 'titans';
  context.favoriteTitans = new Set(['4000', '4020']); // Sigurd and Angus are favorites
  const headings = ['Titan ID', 'Name', 'Level', 'Star', 'Soul stones', 'Artifacts', 'Power'];
  const rows = [
    ['4000', 'Sigurd', '45', 3, '100 / 150', '20 - 15 - 20', '7,358'],
    ['4001', 'Nova', '45', 4, '50 / 500', '10 - 5 - 10', '8,200'],
    ['4013', 'Araji', '45', 3, '200 / 150', '20 - 10 - 10', '12,500'],
    ['4020', 'Angus', '45', 3, '80 / 150', '10 - 10 - 16', '7,100']
  ];

  const tableEl = table(headings, rows);
  const dataRows = tableEl.children.filter(c => c.tagName === 'TR').slice(1);

  // Favorites at top (Sigurd 7358, Angus 7100), then non-favorites (Araji 12500, Nova 8200)
  assert.equal(dataRows[0].children[0].textContent, '4000');
  assert.equal(dataRows[1].children[0].textContent, '4020');
  assert.equal(dataRows[2].children[0].textContent, '4013');
  assert.equal(dataRows[3].children[0].textContent, '4001');

  assert.equal(dataRows[0].dataset.favorite, 'true');
  assert.equal(dataRows[1].dataset.favorite, 'true');
  assert.equal(dataRows[2].dataset.favorite, undefined);
  assert.equal(dataRows[3].dataset.favorite, undefined);

  // Favorite titan button has filled star
  const favBtn0 = dataRows[0].children[0].querySelector('button');
  assert.ok(favBtn0);
  assert.equal(favBtn0.getAttribute('title'), 'Remove favorite');
  assert.equal(favBtn0.querySelector('svg')?.getAttribute('fill'), 'currentColor');

  // Non-favorite titan button has outline star
  const favBtn2 = dataRows[2].children[0].querySelector('button');
  assert.ok(favBtn2);
  assert.equal(favBtn2.getAttribute('title'), 'Add favorite');
  assert.equal(favBtn2.querySelector('svg')?.getAttribute('fill'), 'none');

  context.favoriteTitans.clear();
  context.activeTab = 'heroes';
});

test('table renders Artifacts column with bold level when upgradable', () => {
  const { table } = context;
  context.activeTab = 'titans';
  context.currentCache = {
    titanGetAll: {
      data: {
        '4000': {
          level: 45,
          artifacts: [
            { level: 20, star: 3 },
            { level: 15, star: 1 },
            { level: 20, star: 2 }
          ]
        },
        '4001': {
          level: 45,
          artifacts: [
            { level: 45, star: 4 },
            { level: 45, star: 4 },
            { level: 45, star: 4 }
          ]
        }
      }
    },
    inventoryGet: {
      data: {
        coin: { '18': 500, '1': 1000000 },
        fragmentArtifact: { '11001': 10, '12003': 10, '13003': 10 }
      }
    }
  };

  const headings = ['Titan ID', 'Name', 'Level', 'Star', 'Soul stones', 'Artifacts', 'Power'];
  const rows = [
    ['4000', 'Sigurd', '45', 3, '100 / 150', '20 - 15 - 20', '7,358'],
    ['4001', 'Nova', '45', 4, '50 / 500', '45 - 45 - 45', '8,200']
  ];

  const tableEl = table(headings, rows);
  const dataRows = tableEl.children.filter(c => c.tagName === 'TR').slice(1);

  const sigurdRow = dataRows.find(r => r.children[0].textContent.includes('4000'));
  const sigurdArtCell = sigurdRow.children[5];
  assert.equal(sigurdArtCell.textContent, '20 - 15 - 20');
  const boldNodes = sigurdArtCell.children.filter(c => c.tagName === 'STRONG');
  assert.equal(boldNodes.length, 3, 'All 3 upgradable artifact levels should be strong/bolded');

  const novaRow = dataRows.find(r => r.children[0].textContent.includes('4001'));
  const novaArtCell = novaRow.children[5];
  assert.equal(novaArtCell.textContent, '45 - 45 - 45');
  const novaBoldNodes = novaArtCell.children.filter(c => c.tagName === 'STRONG');
  assert.equal(novaBoldNodes.length, 0, 'No artifacts should be bolded when at level cap and lacking fragments');

  context.activeTab = 'heroes';
  context.currentCache = {};
});
