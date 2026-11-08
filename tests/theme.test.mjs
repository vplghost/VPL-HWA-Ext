import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('popup.html defaults to dark theme and includes theme selector in settings', async () => {
  const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<html lang="en" class="dark">'), 'HTML root should have class="dark" by default');
  assert.ok(html.includes('id="setting-theme"'), 'Settings should contain #setting-theme selector');
  assert.ok(html.includes('value="dark"'), 'Theme selector should contain dark option');
  assert.ok(html.includes('value="light"'), 'Theme selector should contain light option');
  assert.ok(html.includes('value="system"'), 'Theme selector should contain system option');
});

test('popup.css imports theme.css and defines @variant dark', async () => {
  const css = await readFile(new URL('../extension/popup.css', import.meta.url), 'utf8');
  assert.ok(css.includes('@variant dark'), 'popup.css should define @variant dark');
  assert.ok(css.includes('@import "./theme.css";'), 'popup.css should import separated theme.css');

  const themeCss = await readFile(new URL('../extension/theme.css', import.meta.url), 'utf8');
  assert.ok(themeCss.includes('.dark body'), 'theme.css should style dark body');
  assert.ok(themeCss.includes('color-scheme: dark'), 'theme.css should define dark color-scheme');
  assert.ok(themeCss.includes('.dark .bg-teal-50'), 'theme.css should style .dark .bg-teal-50');
  assert.ok(themeCss.includes('.dark .bg-teal-100'), 'theme.css should style .dark .bg-teal-100');
  assert.ok(themeCss.includes('.dark .text-teal-800'), 'theme.css should style .dark .text-teal-800');
  assert.ok(themeCss.includes('.dark .bg-emerald-100'), 'theme.css should style .dark .bg-emerald-100');
  assert.ok(themeCss.includes('.dark [class*="bg-emerald-50/"]'), 'theme.css should style slash-opacity emerald backgrounds');
  assert.ok(themeCss.includes('.dark .border-emerald-200'), 'theme.css should style dark emerald borders');
  assert.ok(themeCss.includes('.dark .bg-amber-100'), 'theme.css should style .dark .bg-amber-100');
  assert.ok(themeCss.includes('.dark [class*="bg-amber-50/"]'), 'theme.css should style slash-opacity amber backgrounds');
  assert.ok(themeCss.includes('.dark .border-amber-200'), 'theme.css should style dark amber borders');
  assert.ok(themeCss.includes('.dark .bg-orange-50'), 'theme.css should style .dark .bg-orange-50');
  assert.ok(themeCss.includes('.dark #guild-versus-modal .chest-playing-card'), 'theme.css should style Guild Versus chest playing cards');
  assert.ok(themeCss.includes('.dark #guild-versus-modal .chest-deck-layer-1'), 'theme.css should style Guild Versus deck underlays');
  assert.ok(themeCss.includes('.dark #guild-versus-modal details.border-emerald-300'), 'theme.css should style Guild Versus schedule round details');
  assert.ok(themeCss.includes('.dark #dungeon-modal .bg-white'), 'theme.css should style Titan Dungeon modal card containers');
  assert.ok(themeCss.includes('.dark #dungeon-modal .text-slate-900'), 'theme.css should style Titan Dungeon modal headings');
});

test('applyTheme applies dark by default, toggles light, and supports system preference', async () => {
  const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const match = popupJs.match(/function applyTheme\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(match, 'applyTheme function must exist in popup.js');
  const applyThemeCode = match[0];

  class MockClassList {
    constructor() { this.classes = new Set(); }
    add(cls) { this.classes.add(cls); }
    remove(cls) { this.classes.delete(cls); }
    contains(cls) { return this.classes.has(cls); }
  }

  const documentElement = { classList: new MockClassList() };
  let matchMediaResult = true;
  const window = {
    matchMedia: (query) => ({
      matches: matchMediaResult,
      addEventListener: () => {}
    })
  };

  const context = vm.createContext({
    document: { documentElement },
    window
  });
  vm.runInContext(applyThemeCode, context);

  // 1. Default / undefined -> dark
  context.applyTheme(undefined);
  assert.ok(documentElement.classList.contains('dark'), 'default theme must be dark');

  // 2. Explicit dark -> dark
  context.applyTheme('dark');
  assert.ok(documentElement.classList.contains('dark'), 'explicit dark theme must have class dark');

  // 3. Explicit light -> light
  context.applyTheme('light');
  assert.ok(!documentElement.classList.contains('dark'), 'light theme must remove class dark');

  // 4. System theme -> matches true
  matchMediaResult = true;
  context.applyTheme('system');
  assert.ok(documentElement.classList.contains('dark'), 'system theme with dark OS must have class dark');

  // 5. System theme -> matches false
  matchMediaResult = false;
  context.applyTheme('system');
  assert.ok(!documentElement.classList.contains('dark'), 'system theme with light OS must remove class dark');
});
