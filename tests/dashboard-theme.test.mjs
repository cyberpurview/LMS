import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const theme = {}
vm.runInNewContext(compile(await readFile('src/lib/lms/theme.ts', 'utf8')), { exports: theme })

test('initial loader restores appearance before the authenticated dashboard exists', () => {
  for (const [stored, expected] of [
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', 'system'],
    [null, 'system'],
    ['bad', 'system'],
  ]) {
    const document = { documentElement: { dataset: {} } }
    vm.runInNewContext(theme.loadingThemeBootstrap(), {
      document,
      localStorage: {
        getItem: (key) => {
          assert.equal(key, theme.LOADING_THEME_KEY)
          return stored
        },
      },
    })
    assert.equal(document.documentElement.dataset.loadingPreference, expected)
    assert.equal(document.documentElement.dataset.dashboardTheme, undefined)
  }
  const document = { documentElement: { dataset: {} } }
  vm.runInNewContext(theme.loadingThemeBootstrap(), {
    document,
    localStorage: {
      getItem() {
        throw new Error('blocked')
      },
    },
  })
  assert.equal(document.documentElement.dataset.loadingPreference, 'system')
})

test('dashboard theme bootstrap restores an account preference before paint and tolerates blocked storage', () => {
  for (const [stored, systemDark, expected] of [
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['system', true, 'dark'],
    ['unknown', false, 'light'],
  ]) {
    const document = { documentElement: { dataset: {} } }
    vm.runInNewContext(theme.themeBootstrap('learner'), {
      document,
      localStorage: {
        getItem: (key) => {
          assert.equal(key, theme.themeStorageKey('learner'))
          return stored
        },
      },
      window: { matchMedia: () => ({ matches: systemDark }) },
    })
    assert.equal(document.documentElement.dataset.dashboardTheme, expected)
  }
  const document = { documentElement: { dataset: {} } }
  vm.runInNewContext(theme.themeBootstrap('learner'), {
    document,
    localStorage: {
      getItem() {
        throw new Error('blocked')
      },
    },
    window: { matchMedia: () => ({ matches: true }) },
  })
  assert.equal(document.documentElement.dataset.dashboardTheme, 'dark')
})

test('appearance switches immediately, follows system only when selected, syncs tabs, isolates users and cleans up', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3000/learner' })
  const React = require('react'),
    { createRoot } = require('react-dom/client')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const media = {
    matches: false,
    listeners: new Set(),
    addEventListener: (_, f) => media.listeners.add(f),
    removeEventListener: (_, f) => media.listeners.delete(f),
  }
  dom.window.matchMedia = () => media
  const exports = {}
  vm.runInNewContext(
    compile(await readFile('src/components/shared/DashboardThemeProvider.tsx', 'utf8')),
    {
      exports,
      window: dom.window,
      document: dom.window.document,
      localStorage: dom.window.localStorage,
      CustomEvent: dom.window.CustomEvent,
      require: (name) => (name === '@/lib/lms/theme' ? theme : require(name)),
    },
  )
  const root = createRoot(document.getElementById('root'))
  const render = (userId) =>
    React.act(async () =>
      root.render(
        React.createElement(
          exports.DashboardThemeProvider,
          { userId, key: userId },
          React.createElement(exports.ThemeSelector),
        ),
      ),
    )
  const click = (value) =>
    React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === value).click(),
    )
  const current = () => document.documentElement.dataset.dashboardTheme
  try {
    await render('learner')
    assert.equal(current(), 'light')
    await click('dark')
    assert.equal(current(), 'dark')
    assert.equal(window.localStorage.getItem(theme.LOADING_THEME_KEY), 'dark')
    assert.equal(document.documentElement.dataset.loadingPreference, 'dark')
    assert.equal(window.localStorage.getItem(theme.themeStorageKey('learner')), 'dark')
    await React.act(async () => {
      media.matches = false
      media.listeners.forEach((f) => f())
    })
    assert.equal(current(), 'dark')
    await click('system')
    assert.equal(current(), 'light')
    await React.act(async () => {
      media.matches = true
      media.listeners.forEach((f) => f())
    })
    assert.equal(current(), 'dark')
    await click('light')
    assert.equal(current(), 'light')
    assert.equal(window.localStorage.getItem(theme.LOADING_THEME_KEY), 'light')
    await React.act(async () => {
      window.localStorage.setItem(theme.themeStorageKey('learner'), 'dark')
      window.dispatchEvent(
        new window.StorageEvent('storage', { key: theme.themeStorageKey('learner') }),
      )
    })
    assert.equal(current(), 'dark')
    await render('tutor')
    assert.equal(document.querySelector('[aria-pressed="true"]').textContent, 'system')
    await React.act(async () => root.unmount())
    assert.equal(current(), undefined)
    assert.equal(media.listeners.size, 0)
  } finally {
    dom.window.close()
    delete globalThis.window
    delete globalThis.document
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})

test('dark palette keeps normal text, secondary text and links above WCAG AA contrast', async () => {
  function luminance(hex) {
    const c = hex
      .match(/\w\w/g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const css = await readFile('src/app/dashboard-theme.css', 'utf8')
  const token = (name) => css.match(new RegExp(`--dashboard-${name}: (#[0-9a-f]{6})`))[1].slice(1)
  for (const bg of ['canvas', 'surface', 'raised'])
    for (const fg of ['text', 'muted', 'accent']) {
      const ratio = (luminance(token(fg)) + 0.05) / (luminance(token(bg)) + 0.05)
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio}`)
    }
})
