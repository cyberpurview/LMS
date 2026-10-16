import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
test('creator sound preference defaults off, persists with existing preferences and supports preview and mute', async () => {
  const { JSDOM } = require('jsdom'),
    dom = new JSDOM('<div id="root"></div>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'),
    { createRoot } = require('react-dom/client'),
    exports = {},
    writes = [],
    sounds = []
  const state = {
    users: [{ id: 'creator', name: 'Course creator', email: 'creator@example.test' }],
    preferences: { creator: { emailUpdates: false } },
    platformName: 'CyberPurview',
  }
  const plain = ({ children }) => React.createElement('div', null, children)
  vm.runInNewContext(
    ts.transpileModule(
      await readFile(new URL('../src/components/features/account.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require: (name) => {
        if (name === '@/lib/lms/store')
          return {
            useLms: () => ({
              state,
              user: state.users[0],
              notice: () => {},
              mutate: async (command) => {
                writes.push(command)
                state.preferences.creator = command.preferences
                return true
              },
            }),
          }
        if (name === '@/lib/lms/completion-sound')
          return {
            prepareCompletionSound: async () => sounds.push('prepare'),
            playCompletionSound: () => sounds.push('play'),
          }
        if (name === './common')
          return { FeatureShell: plain, Panel: plain, Heading: () => null, Field: plain }
        if (name === './email-change-settings') return { EmailChangeSettings: () => null }
        if (name === './support-inbox') return { SupportInbox: () => null }
        if (name === '@/lib/brand') return { BRAND_NAME: 'CyberPurview' }
        if (name === 'next/link') return { default: plain }
        return require(name)
      },
    },
  )
  const root = createRoot(document.getElementById('root'))
  const render = async (role = 'tutor') =>
    React.act(async () => root.render(React.createElement(exports.Settings, { role })))
  const click = async (text) =>
    React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === text).click(),
    )
  try {
    await render()
    await click('Notifications')
    const checkbox = () =>
      [...document.querySelectorAll('label')]
        .find((l) => l.textContent.includes('AI course completion sound'))
        ?.querySelector('input')
    assert.equal(checkbox().checked, false)
    assert.equal(
      [...document.querySelectorAll('button')].some((b) => b.textContent === 'Preview sound'),
      false,
    )
    await React.act(async () => checkbox().click())
    await render()
    assert.equal(writes[0].type, 'preferences')
    assert.equal(writes[0].preferences.aiCompletionSound, true)
    assert.equal(writes[0].preferences.emailUpdates, false)
    assert.equal(checkbox().checked, true)
    assert.deepEqual(sounds, ['prepare'])
    await click('Preview sound')
    assert.deepEqual(sounds, ['prepare', 'prepare', 'play'])
    await React.act(async () => checkbox().click())
    await render()
    assert.equal(writes.at(-1).preferences.aiCompletionSound, false)
    assert.equal(checkbox().checked, false)
    await render('learner')
    assert.equal(checkbox(), undefined)
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
