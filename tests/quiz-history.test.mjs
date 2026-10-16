import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)

test('history paginates on demand and opens an individual read-only result', async () => {
  const { JSDOM } = require('jsdom'),
    React = require('react'),
    { createRoot } = require('react-dom/client')
  const dom = new JSDOM('<div id="root"></div>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let params = new URLSearchParams('quiz=quiz-id')
  const calls = []
  let failPage = true
  let resolvePage
  let resolveFirst
  const items = Array.from({ length: 21 }, (_, i) => ({
    id: `attempt-${i}`,
    quizId: 'quiz-id',
    title: `Quiz ${i}`,
    startedAt: '2026-10-16T10:00:00Z',
    score: 80,
    status: 'Passed',
    canResume: false,
  }))
  const exports = {}
  const plain = ({ children }) => React.createElement('div', null, children)
  vm.runInNewContext(
    ts.transpileModule(await readFile('src/components/features/quiz-history.tsx', 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Error,
      URLSearchParams,
      window: dom.window,
      require: (name) => {
        if (name === 'next/navigation') return { useSearchParams: () => params }
        if (name === 'next/link')
          return {
            default: ({ href, children, ...props }) =>
              React.createElement('a', { href, ...props }, children),
          }
        if (name === './common')
          return { FeatureShell: plain, Heading: plain, Panel: plain, Empty: plain }
        if (name === './quiz-answer-review')
          return {
            QuizAnswerReview: ({ questions }) =>
              React.createElement('div', null, `Review: ${questions.length} questions`),
          }
        if (name === '@/lib/lms/store')
          return {
            useLms: () => ({
              execute: async (command) => {
                calls.push(command)
                if (command.type === 'quizHistory' && command.quizId === 'slow')
                  return new Promise((resolve) => {
                    resolveFirst = resolve
                  })
                if (command.type === 'quizAttemptResult')
                  return {
                    id: command.attemptId,
                    title: 'Saved quiz',
                    startedAt: '2026-10-16T10:00:00Z',
                    score: 80,
                    passed: true,
                    completed: true,
                    status: 'Passed',
                    feedbackAvailable: true,
                    questions: [{ id: 'q' }],
                    answers: {},
                    feedback: [],
                  }
                if (command.afterId) {
                  if (failPage) {
                    failPage = false
                    throw new Error('Temporary failure')
                  }
                  return new Promise((resolve) => {
                    resolvePage = resolve
                  })
                }
                return { items }
              },
            }),
          }
        return require(name)
      },
    },
  )
  const root = createRoot(document.getElementById('root'))
  const render = () => React.act(async () => root.render(React.createElement(exports.QuizHistory)))
  try {
    await render()
    assert.equal(document.querySelectorAll('li').length, 20)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].quizId, 'quiz-id')
    assert.match(document.querySelector('li a').href, /quiz=quiz-id&attempt=attempt-0$/)
    await React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Load more').click(),
    )
    assert.equal(calls[1].afterId, 'attempt-19')
    assert.equal(document.querySelectorAll('li').length, 20)
    assert.match(document.body.textContent, /Temporary failure/)
    await React.act(async () => {
      const retry = [...document.querySelectorAll('button')].find(
        (b) => b.textContent === 'Try again',
      )
      retry.click()
      retry.click()
    })
    assert.equal(calls.length, 3)
    await React.act(async () => resolvePage({ items: items.slice(20) }))
    assert.equal(document.querySelectorAll('li').length, 21)
    assert.equal(document.querySelector('button'), null)
    params = new URLSearchParams('quiz=quiz-id&attempt=attempt-0')
    await render()
    assert.equal(calls[3].type, 'quizAttemptResult')
    assert.match(document.body.textContent, /80% · Passed/)
    assert.match(document.body.textContent, /Review: 1 questions/)
    params = new URLSearchParams('quiz=quiz-id')
    await render()
    await React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Load more').click(),
    )
    const resolveStalePage = resolvePage
    params = new URLSearchParams('attempt=attempt-0')
    await render()
    await React.act(async () => resolveStalePage({ items: items.slice(20) }))
    assert.match(document.body.textContent, /Review: 1 questions/)
    assert.equal(document.querySelectorAll('li').length, 0)
    params = new URLSearchParams('quiz=slow')
    await render()
    params = new URLSearchParams('quiz=quiz-id')
    await render()
    await React.act(async () => resolveFirst({ items: [] }))
    assert.equal(document.querySelectorAll('li').length, 20)
    assert.equal(
      calls.some((c) => ['startQuiz', 'submitQuiz'].includes(c.type)),
      false,
    )
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    delete globalThis.window
    delete globalThis.document
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
