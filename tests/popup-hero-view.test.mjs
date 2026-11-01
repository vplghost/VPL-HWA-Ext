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
    if (selector === '.hero-hover-card') {
      return this.children.find(c => c.className?.includes('hero-hover-card')) || null;
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

// Extract helper functions and run in context
const context = {
  document: mockDoc,
  globalThis: {},
  formatNumber: (n) => String(n)
};
vm.runInNewContext(heroMetaJs, context);
vm.runInNewContext(titanMetaJs, context);
vm.runInNewContext(heroStatJs, context);

// Extract the required functions: starIcons, starGlowClass, createInitialsBadge, createHeroInline, factionColors
const codeToRun = popupJs.slice(
  popupJs.indexOf('function starIcons('),
  popupJs.indexOf('function createTeamSquadCell')
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

  // Glyphs (Hero 2 Galahad glyphs: PA, HP, Arm, Crit, Str)
  assert.ok(text.includes('PA: 40') && text.includes('HP: 20') && text.includes('Arm: 20') && text.includes('Crit: 20') && text.includes('Str: 0'), 'Should render Glyphs with stat name and level');

  // Artifacts
  assert.ok(text.includes('Wpn: 3★ Lv.40') && text.includes('Book: 2★ Lv.24') && text.includes('Ring: 2★ Lv.23'), 'Should render Artifacts with stars and level');
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
