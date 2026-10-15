import { courseUrlExports } from './helpers/course-url.mjs'
import { quizAnswerReviewExports } from './helpers/quiz-answer-review.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const compile = (s) =>
  ts.transpileModule(s, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const helpers = {}
const awardRules = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/award-rules.ts', import.meta.url), 'utf8')),
  { exports: awardRules },
)
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/quiz-session.ts', import.meta.url), 'utf8')),
  { exports: helpers },
)
test('quiz cache rejects malformed or foreign selections and timing uses elapsed deadline time', () => {
  const questions = [{ id: 'q', options: [{ id: 'a' }, { id: 'b' }] }]
  assert.deepEqual(
    JSON.parse(JSON.stringify(helpers.restoreQuizAnswers('{"q":"a","other":"b"}', questions))),
    { q: 'a' },
  )
  for (const source of ['null', '[]', '{', '{"q":"unknown"}', 'x'.repeat(16385)])
    assert.equal(Object.keys(helpers.restoreQuizAnswers(source, questions)).length, 0)
  assert.equal(helpers.remainingQuizSeconds(60000, 45000), 15)
  assert.equal(helpers.remainingQuizSeconds(60000, 70000), 0)
  assert.notEqual(
    helpers.quizAnswerCacheKey('one', 'attempt'),
    helpers.quizAnswerCacheKey('two', 'attempt'),
  )
})
test('quiz runner restores refreshes without resetting time and backs off failed timeout submissions', async () => {
  const { JSDOM } = require('jsdom'),
    React = require('react'),
    { createRoot } = require('react-dom/client')
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    pretendToBeVisual: true,
    url: 'http://localhost:3000/learner/quizzes/quiz',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const exports = {},
    events = [],
    cache = new Map(),
    timers = new Map()
  let clock = 0,
    nextTimer = 0,
    failures = 2
  const base = Date.parse('2026-10-12T00:00:00Z')
  const state = {
    quizzes: [
      {
        id: 'quiz',
        courseId: 'course',
        title: 'Assessment',
        timeLimit: 1,
        passingScore: 70,
        status: 'published',
        questions: [
          {
            id: 'q',
            text: 'Question',
            options: [
              { id: 'a', text: 'Alpha' },
              { id: 'b', text: 'Beta' },
            ],
          },
        ],
      },
    ],
    courses: [{ id: 'course' }],
    enrollments: [{ courseId: 'course', learnerId: 'learner', progress: 0 }],
  }
  const plain = ({ children }) => React.createElement('div', null, children)
  vm.runInNewContext(
    compile(
      await readFile(new URL('../src/components/features/quizzes.tsx', import.meta.url), 'utf8'),
    ),
    {
      exports,
      Error,
      Date,
      performance: { now: () => clock },
      sessionStorage: {
        getItem: (key) => cache.get(key) || null,
        setItem: (key, value) => cache.set(key, value),
        removeItem: (key) => cache.delete(key),
      },
      setInterval: (run) => {
        timers.set(++nextTimer, run)
        return nextTimer
      },
      clearInterval: (id) => timers.delete(id),
      require: (name) => {
        if (name === './quiz-answer-review') return quizAnswerReviewExports
        if (name === '@/lib/lms/course-url') return courseUrlExports
        if (name === '@/lib/lms/award-rules') return awardRules
        if (name === '@/lib/utils') return { formatCurrency: (value) => `$${value.toFixed(2)}` }
        if (name === '@/lib/lms/quiz-session') return helpers
        if (name === '@/lib/lms/store')
          return {
            useLms: () => ({
              state,
              user: { id: 'learner' },
              notice: (message) => events.push(['notice', message]),
              execute: async (command) => {
                events.push([command.type, command])
                if (command.type === 'startQuiz')
                  return {
                    id: 'attempt',
                    deadline: new Date(base + 60000).toISOString(),
                    serverTime: new Date(base + clock).toISOString(),
                  }
                if (failures-- > 0)
                  throw Object.assign(new Error('Network unavailable'), { status: 503 })
                return {
                  score: 100,
                  answers: { q: 'a' },
                  feedback: [{ id: 'q', correctOptionId: 'a', explanation: 'Correct' }],
                }
              },
            }),
          }
        if (name === './common')
          return { FeatureShell: plain, Heading: plain, Panel: plain, Empty: plain, Back: plain }
        if (name === '@/components/shared/ui') return { Badge: plain, ProgressBar: () => null }
        if (name === 'next/link')
          return { default: ({ children, ...props }) => React.createElement('a', props, children) }
        if (name === 'next/image') return { default: () => null }
        if (name === 'next/navigation') return {}
        if (name.startsWith('./') || name.startsWith('@/')) return {}
        return require(name)
      },
    },
  )
  let root = createRoot(document.getElementById('root'))
  const render = () => root.render(React.createElement(exports.QuizRunner, { id: 'quiz' }))
  const button = (text) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === text)
  const tick = async () =>
    React.act(async () => {
      for (const run of [...timers.values()]) run()
    })
  try {
    await React.act(async () => render())
    await React.act(async () => {
      button('Start assessment').click()
      button('Start assessment')?.click()
    })
    assert.equal(events.filter((e) => e[0] === 'startQuiz').length, 1)
    await React.act(async () => document.querySelector('input[value="b"]').click())
    clock = 20000
    await tick()
    assert.ok(document.body.textContent.includes('0:40 remaining'))
    await React.act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    await React.act(async () => render())
    await React.act(async () => button('Start assessment').click())
    assert.equal(document.querySelector('input[value="b"]').checked, true)
    assert.ok(document.body.textContent.includes('0:40 remaining'))
    clock = 45000
    await tick()
    assert.ok(document.body.textContent.includes('0:15 remaining'))
    clock = 61000
    await tick()
    for (let i = 0; i < 10; i++) await tick()
    assert.equal(events.filter((e) => e[0] === 'submitQuiz').length, 1)
    clock = 92000
    await tick()
    assert.equal(events.filter((e) => e[0] === 'submitQuiz').length, 2)
    await React.act(async () => button('Retry submission').click())
    assert.equal(events.filter((e) => e[0] === 'submitQuiz').length, 3)
    assert.ok(
      [...document.querySelectorAll('ol li')].some(
        (n) =>
          n.textContent.includes('Alpha') &&
          n.textContent.includes('Your answer') &&
          n.textContent.includes('Correct answer'),
      ),
    )
    assert.equal(cache.size, 0)
    await React.act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    state.certificates = []
    Object.assign(state.quizzes[0], {
      courseId: '',
      price: 15,
      hasAccess: false,
      questionCount: 1,
      questions: [],
    })
    await React.act(async () => render())
    assert.equal(button('Payments coming soon').disabled, true)
    assert.equal(button('Start assessment'), undefined)
    const starts = events.filter((e) => e[0] === 'startQuiz').length
    await React.act(async () => button('Payments coming soon').click())
    assert.equal(events.filter((e) => e[0] === 'startQuiz').length, starts)
    state.quizzes[0].hasAccess = true
    await React.act(async () => render())
    assert.equal(button('Start assessment').disabled, false)
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
