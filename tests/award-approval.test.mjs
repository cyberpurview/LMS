import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
test('approval panel loads eligible learners, approves the selected subject and refreshes the queue', async () => {
  const { JSDOM } = require('jsdom'),
    dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'),
    { createRoot } = require('react-dom/client'),
    { act } = React,
    exports = {},
    events = []
  let approved = false
  const source = ts.transpileModule(
    await readFile(
      new URL('../src/components/features/award-approval.tsx', import.meta.url),
      'utf8',
    ),
    {
      fileName: 'panel.tsx',
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText
  vm.runInNewContext(source, {
    exports,
    Error,
    require: (name) => {
      if (name === '@/lib/lms/store')
        return {
          useLms: () => ({
            execute: async (command) => {
              events.push(command)
              if (command.action === 'approve') {
                approved = true
                return { id: 'certificate' }
              }
              return approved ? [] : [{ id: 'learner', name: 'Eligible Learner', issued: false }]
            },
          }),
        }
      if (name === './common')
        return {
          Panel: ({ children }) => React.createElement('div', null, children),
          secondaryClass: '',
        }
      return require(name)
    },
  })
  const root = createRoot(document.getElementById('root'))
  await act(async () =>
    root.render(
      React.createElement(exports.AwardApproval, { kind: 'quiz', subjectId: 'standalone' }),
    ),
  )
  assert.ok(document.body.textContent.includes('Eligible Learner'))
  assert.equal(events[0].action, 'candidates')
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === 'Approve certificate',
  )
  await act(async () => button.click())
  assert.equal(events[1].action, 'approve')
  assert.equal(events[1].kind, 'quiz')
  assert.equal(events[1].subjectId, 'standalone')
  assert.equal(events[1].learnerId, 'learner')
  assert.ok(document.body.textContent.includes('No eligible learners yet.'))
  await act(async () => root.unmount())
  dom.window.close()
})
