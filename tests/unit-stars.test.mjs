import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import UnitStars from './helpers/unit-stars.mjs';

const render = props => renderToString(createSSRApp({ render: () => h(UnitStars, props) }));

test('absolute rating renders one legacy SVG with accessible six-star label in every layout', async () => {
  const legacy = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const path = legacy.match(/const JUSTICE_STAR_SVG_PATH = '([^']+)'/)[1];
  for (const compact of [undefined, 'prefix', 'suffix']) {
    const html = await render({ count: '6', compact });
    assert.equal((html.match(/<svg/g) || []).length, 1);
    assert.ok(html.includes(`d="${path}"`));
    assert.match(html, /aria-label="6 stars \(Absolute\)"/);
    assert.doesNotMatch(html, /★/);
  }
});

test('lower ratings preserve repeated and compact forms without an absolute icon', async () => {
  for (let count = 1; count <= 5; count++) {
    const html = await render({ count });
    assert.ok(html.includes('★'.repeat(count)));
    assert.doesNotMatch(html, /<svg/);
    assert.match(await render({ count, compact: 'prefix' }), new RegExp(`★${count}`));
    assert.match(await render({ count, compact: 'suffix' }), new RegExp(`${count}★`));
  }
  assert.match(await render({ count: null }), /aria-label="0 stars"/);
});
