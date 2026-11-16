import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MockClassList {
  constructor() { this.classes = new Set(); }
  add(cls) { this.classes.add(cls); }
  remove(cls) { this.classes.delete(cls); }
  contains(cls) { return this.classes.has(cls); }
  toggle(cls, force) {
    if (force) this.classes.add(cls);
    else this.classes.delete(cls);
    return this.classes.has(cls);
  }
}

test('SettingsTab and popup style support dark, light, and system themes', async () => {
  const settingsTab = await readFile(new URL('../src/components/tabs/SettingsTab.vue', import.meta.url), 'utf8');
  assert.ok(settingsTab.includes('value="dark"'), 'Theme selector should contain dark option');
  assert.ok(settingsTab.includes('value="light"'), 'Theme selector should contain light option');
  assert.ok(settingsTab.includes('value="system"'), 'Theme selector should contain system option');

  const css = await readFile(new URL('../entrypoints/popup/style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('@variant dark'), 'style.css should define @variant dark');
  assert.ok(css.includes('html.dark'), 'style.css should style html.dark');
  assert.ok(css.includes('color-scheme: dark'), 'style.css should define dark color-scheme');
});

test('applyTheme applies dark by default, toggles light, and supports system preference', async () => {
  const documentElement = { classList: new MockClassList(), style: {} };
  let matchMediaResult = true;
  globalThis.document = { documentElement, createElement: () => ({}) };
  globalThis.window = {
    matchMedia: (query) => ({
      matches: matchMediaResult,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  };

  const { useTheme } = await import('../src/composables/useTheme.ts');
  const { applyTheme } = useTheme();

  // 1. Default / undefined -> dark
  applyTheme(undefined);
  assert.ok(documentElement.classList.contains('dark'), 'default theme must be dark');

  // 2. Explicit dark -> dark
  applyTheme('dark');
  assert.ok(documentElement.classList.contains('dark'), 'explicit dark theme must have class dark');

  // 3. Explicit light -> light
  applyTheme('light');
  assert.ok(!documentElement.classList.contains('dark'), 'light theme must remove class dark');

  // 4. System theme -> matches true
  matchMediaResult = true;
  applyTheme('system');
  assert.ok(documentElement.classList.contains('dark'), 'system theme with dark OS must have class dark');

  // 5. System theme -> matches false
  matchMediaResult = false;
  applyTheme('system');
  assert.ok(!documentElement.classList.contains('dark'), 'system theme with light OS must remove class dark');
});
