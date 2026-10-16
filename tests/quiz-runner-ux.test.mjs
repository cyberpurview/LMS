import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { courseUrlExports } from './helpers/course-url.mjs'
import { quizAnswerReviewExports } from './helpers/quiz-answer-review.mjs'
const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const session = {}
vm.runInNewContext(compile(await readFile('src/lib/lms/quiz-session.ts', 'utf8')), {
  exports: session,
})

test('one-question runner preserves navigation, confirms partial submissions, freezes time immediately and resumes the server deadline on failure', async () => {
  const { JSDOM } = require('jsdom'),
    React = require('react'),
    { createRoot } = require('react-dom/client')
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost:3000/learner/quizzes/quiz',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new dom.window.Event('close'))
  }
  let clock = 0,
    nextTimer = 0,
    resolveSubmit,
    rejectSubmit
  const base = Date.parse('2026-10-12T00:00:00Z'),
    timers = new Map(),
    commands = [],
    exports = {}
  const state = {
    quizzes: [
      {
        id: 'quiz',
        courseId: 'course',
        status: 'published',
        title: 'Quiz',
        timeLimit: 1,
        passingScore: 70,
        questions: [1, 2, 3].map((i) => ({
          id: `q${i}`,
          text: `Question text ${i}`,
          options: [
            { id: 'a', text: 'Alpha' },
            { id: 'b', text: 'Beta' },
          ],
        })),
      },
    ],
    courses: [{ id: 'course' }],
    enrollments: [{ courseId: 'course', learnerId: 'learner', progress: 0 }],
  }
  const plain = ({ children }) => React.createElement('div', null, children)
  vm.runInNewContext(compile(await readFile('src/components/features/quizzes.tsx', 'utf8')), {
    exports,
    Error,
    Date,
    performance: { now: () => clock },
    sessionStorage: dom.window.sessionStorage,
    setInterval: (fn) => {
      timers.set(++nextTimer, fn)
      return nextTimer
    },
    clearInterval: (id) => timers.delete(id),
    require: (name) => {
      if (name === './quiz-answer-review') return quizAnswerReviewExports
      if (name === '@/lib/lms/course-url') return courseUrlExports
      if (name === '@/lib/lms/quiz-session') return session
      if (name === '@/lib/lms/store')
        return {
          useLms: () => ({
            state,
            user: { id: 'learner' },
            notice: () => {},
            execute: (command) => {
              commands.push(command)
              if (command.type === 'startQuiz')
                return Promise.resolve({
                  id: 'attempt',
                  deadline: new Date(base + 60000).toISOString(),
                  serverTime: new Date(base + clock).toISOString(),
                })
              return new Promise((resolve, reject) => {
                resolveSubmit = resolve
                rejectSubmit = reject
              })
            },
          }),
        }
      if (name === './common')
        return { FeatureShell: plain, Heading: plain, Panel: plain, Empty: plain, Back: plain }
      if (name === '@/components/shared/ui') return { Badge: plain, ProgressBar: () => null }
      if (name === 'next/link') return { default: plain }
      if (name === 'next/image') return { default: () => null }
      if (name === 'next/navigation' || name.startsWith('@/') || name.startsWith('./')) return {}
      return require(name)
    },
  })
  let root = createRoot(document.getElementById('root'))
  const render = () =>
    React.act(async () => root.render(React.createElement(exports.QuizRunner, { id: 'quiz' })))
  const button = (text) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === text)
  const click = (text) => React.act(async () => button(text).click())
  const tick = () => React.act(async () => [...timers.values()].forEach((fn) => fn()))
  const submissions = () => commands.filter((c) => c.type === 'submitQuiz')
  try {
    await render()
    await click('Start assessment')
    assert.equal(document.querySelectorAll('fieldset').length, 1)
    assert.equal(button('Previous').disabled, true)
    await React.act(async () => document.querySelector('input[value="a"]').click())
    await click('Next question')
    assert.ok(document.body.textContent.includes('Question text 2'))
    assert.equal(document.querySelector('input:checked'), null)
    await click('Previous')
    assert.equal(document.querySelector('input[value="a"]').checked, true)
    await React.act(async () =>
      document.querySelector('[aria-label="Question 3, unanswered"]').click(),
    )
    await React.act(async () => document.querySelector('input[value="b"]').click())
    assert.ok(document.body.textContent.includes('2 answered · 1 unanswered'))
    await click('Submit assessment')
    assert.equal(submissions().length, 0)
    assert.equal(document.querySelector('dialog').open, true)
    assert.ok(document.querySelector('dialog').textContent.includes('1 question is unanswered'))
    clock = 10000
    await tick()
    assert.ok(document.querySelector('[role="timer"]').textContent.includes('0:50'))
    await click('Keep answering')
    assert.equal(document.querySelector('dialog').open, false)
    await click('Submit assessment')
    await click('Confirm submission')
    assert.equal(submissions().length, 1)
    assert.equal(timers.size, 0)
    assert.equal(document.querySelector('[role="timer"]').textContent, 'Submitting…')
    assert.equal(document.querySelector('fieldset').disabled, true)
    clock = 30000
    await tick()
    assert.equal(submissions().length, 1)
    await React.act(async () =>
      rejectSubmit(Object.assign(new Error('Network unavailable'), { status: 503 })),
    )
    assert.ok(document.querySelector('[role="timer"]').textContent.includes('0:30'))
    assert.equal(document.querySelector('input[value="b"]').checked, true)
    await click('Submit assessment')
    await click('Confirm submission')
    assert.deepEqual(JSON.parse(JSON.stringify(submissions().at(-1).answers)), { q1: 'a', q3: 'b' })
    await React.act(async () => resolveSubmit({ score: 67, feedback: [] }))
    assert.equal(timers.size, 0)
    assert.ok(document.body.textContent.includes('67%'))
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Assessment result')

    await React.act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    clock = 0
    await render()
    await click('Start assessment')
    await click('Submit assessment')
    assert.equal(document.querySelector('dialog').open, true)
    const before = submissions().length
    clock = 61000
    await tick()
    assert.equal(submissions().length, before + 1)
    assert.equal(document.querySelector('dialog').open, false)
    assert.equal(timers.size, 0)
    await tick()
    assert.equal(submissions().length, before + 1)
    await React.act(async () => resolveSubmit({ score: 0, feedback: [] }))
    await React.act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    Object.assign(state.quizzes[0], {
      purpose: 'assessment',
      maxAttempts: 3,
      attemptsUsed: 1,
      attemptLimit: 3,
      attemptsRemaining: 2,
      feedbackPolicy: 'after_pass_or_last',
    })
    await render()
    await click('View last result')
    await React.act(async () =>
      resolveSubmit({
        id: 'attempt',
        score: 0,
        answers: {},
        feedback: [],
        feedbackAvailable: false,
        attemptsUsed: 1,
        attemptLimit: 3,
        attemptsRemaining: 2,
      }),
    )
    assert.equal(document.querySelector('ol[aria-label="Answer options"]'), null)
    assert.ok(
      document.body.textContent.includes(
        'Correct answers unlock after you pass or use your final attempt.',
      ),
    )
    await React.act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    Object.assign(state.quizzes[0], { attemptsUsed: 3, attemptsRemaining: 0 })
    await render()
    assert.equal(button('Attempt limit reached').disabled, true)
    assert.ok(button('View last result'))
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    delete globalThis.window
    delete globalThis.document
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
