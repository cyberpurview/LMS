import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { quizAnswerReviewExports } from './helpers/quiz-answer-review.mjs'
const require = createRequire(import.meta.url)
test('review presents one numbered question, accurate outcome counts, neutral unanswered status and accessible navigation', async () => {
  const { JSDOM } = require('jsdom'),
    React = require('react'),
    { createRoot } = require('react-dom/client')
  const dom = new JSDOM('<div id="root"></div>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let scrolls = 0
  dom.window.HTMLElement.prototype.scrollIntoView = () => scrolls++
  const root = createRoot(document.getElementById('root'))
  const questions = [1, 2, 3].map((i) => ({
    id: `q${i}`,
    text: `Question text ${i}`,
    options: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
      { id: 'c', text: 'Gamma' },
      { id: 'd', text: 'Delta' },
    ],
  }))
  const feedback = questions.map((q) => ({
    id: q.id,
    correctOptionId: 'a',
    explanation: `Explanation for ${q.id}`,
  }))
  const button = (text) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === text)
  try {
    await React.act(async () =>
      root.render(
        React.createElement(quizAnswerReviewExports.QuizAnswerReview, {
          questions,
          feedback,
          answers: { q1: 'a', q2: 'b' },
          score: 33,
          onViewResult: () => {},
        }),
      ),
    )
    assert.deepEqual(
      [...document.querySelectorAll('dl dd')].map((n) => n.textContent),
      ['1', '1', '1'],
    )
    assert.equal(document.querySelectorAll('h4').length, 1)
    assert.equal(document.querySelector('h4').textContent, 'Question text 1')
    assert.equal(button('Previous').disabled, true)
    assert.equal(scrolls, 0)
    const firstOptions = [...document.querySelectorAll('ol[aria-label="Answer options"] > li')]
    assert.equal(firstOptions.length, 4)
    assert.ok(firstOptions[0].textContent.includes('Your answer'))
    assert.ok(firstOptions[0].textContent.includes('Correct answer'))
    await React.act(async () => button('Next question').click())
    assert.equal(document.querySelector('h4').textContent, 'Question text 2')
    const options = () => [...document.querySelectorAll('ol[aria-label="Answer options"] > li')]
    assert.equal(options().length, questions[1].options.length)
    assert.ok(
      options()
        .find((n) => n.textContent.includes('Beta'))
        .textContent.includes('Your answer'),
    )
    assert.ok(
      options()
        .find((n) => n.textContent.includes('Alpha'))
        .textContent.includes('Correct answer'),
    )
    assert.equal(document.querySelector('ol input, ol button'), null)
    assert.ok(
      options()
        .filter((n) => n.textContent.includes('Gamma') || n.textContent.includes('Delta'))
        .every((n) => !n.className.includes('emerald') && !n.className.includes('rose')),
    )
    assert.ok(document.body.textContent.includes('Explanation for q2'))
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Review question 2 of 3')
    assert.equal(scrolls, 1)
    await React.act(async () =>
      document.querySelector('[aria-label="Review question 3, unanswered"]').click(),
    )
    assert.equal(document.querySelector('h4').textContent, 'Question text 3')
    const status = [...document.querySelectorAll('span')].find(
      (n) => n.textContent === 'Unanswered',
    )
    assert.ok(!status.className.includes('rose'))
    assert.ok(options().every((n) => !n.textContent.includes('Your answer')))
    assert.ok(
      options()
        .find((n) => n.textContent.includes('Alpha'))
        .textContent.includes('Correct answer'),
    )
    assert.equal(button('Next question').disabled, true)
    await React.act(async () => button('Previous').click())
    assert.equal(document.querySelector('h4').textContent, 'Question text 2')
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    delete globalThis.window
    delete globalThis.document
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
