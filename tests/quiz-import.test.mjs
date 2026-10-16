import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
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
const commands = {},
  importer = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/commands.ts', import.meta.url), 'utf8')),
  { exports: commands, require },
)
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/quiz-import.ts', import.meta.url), 'utf8')),
  {
    exports: importer,
    TextEncoder,
    crypto: { randomUUID },
    require: (name) => (name === './commands' ? commands : require(name)),
  },
)
const valid = {
  text: 'Assess the risk.',
  options: ['Low', 'High'],
  correctAnswer: 2,
  explanation: 'Review the likelihood and impact.',
}
test('JSON imports generate fresh IDs and map the answer number into server-valid questions', () => {
  for (const input of [[valid], { questions: [valid] }]) {
    const first = importer.parseQuizImport(JSON.stringify(input))
    const second = importer.parseQuizImport(JSON.stringify(input))
    assert.notEqual(first[0].id, second[0].id)
    assert.equal(first[0].correctOptionId, first[0].options[1].id)
    assert.equal(first[0].explanation, valid.explanation)
    assert.ok(commands.quizQuestionSchema.safeParse(first[0]).success)
  }
  assert.equal(
    importer.parseQuizImport('\uFEFF' + JSON.stringify(importer.quizImportExample)).length,
    1,
  )
})
test('invalid files fail atomically with question and field information', () => {
  for (const [change, field] of [
    [{ text: '' }, 'text'],
    [{ options: ['One'] }, 'options'],
    [{ correctAnswer: 0 }, 'correctAnswer'],
    [{ correctAnswer: 3 }, 'correctAnswer'],
    [{ correctAnswer: '2' }, 'correctAnswer'],
    [{ explanation: 'x'.repeat(5001) }, 'explanation'],
    [{ unexpected: true }, ''],
  ]) {
    let generated = 0
    assert.throws(
      () =>
        importer.parseQuizImport(JSON.stringify([valid, { ...valid, ...change }]), () => {
          generated++
          return randomUUID()
        }),
      new RegExp('Question 2.*' + field),
    )
    assert.equal(generated, 0)
  }
  assert.throws(() => importer.parseQuizImport('{broken'), /Invalid JSON/)
  assert.throws(() => importer.parseQuizImport('{}'), /questions/)
  assert.throws(() => importer.parseQuizImport('[]'), /between 1 and 100/)
  assert.throws(
    () => importer.parseQuizImport(JSON.stringify(Array(101).fill(valid))),
    /between 1 and 100/,
  )
  assert.throws(() => importer.parseQuizImport(' '.repeat(262145)), /256 KB/)
})
test('upload stages questions for review, appends only on confirmation, and preserves the editor on errors', async () => {
  const source = compile(
    await readFile(
      new URL('../src/components/features/quiz-question-import.tsx', import.meta.url),
      'utf8',
    ),
  )
  const exports = {},
    slots = [],
    refs = [],
    added = []
  let index = 0,
    refIndex = 0,
    count = 1
  vm.runInNewContext(source, {
    exports,
    Error,
    require: (name) => {
      if (name === 'react')
        return {
          useState: (initial) => {
            const slot = index++
            if (!(slot in slots)) slots[slot] = initial
            return [slots[slot], (v) => (slots[slot] = v)]
          },
          useRef: (initial) => {
            const slot = refIndex++
            return (refs[slot] ||= { current: initial })
          },
        }
      if (name === '@/lib/lms/quiz-import') return importer
      if (name === './common')
        return {
          Panel: 'Panel',
          inputClass: 'input',
          secondaryClass: 'button',
          primaryClass: 'button',
        }
      return require(name)
    },
  })
  const nodes = (n) =>
    !n || typeof n !== 'object'
      ? []
      : Array.isArray(n)
        ? n.flatMap(nodes)
        : [n, ...nodes(n.props?.children)]
  const render = () => {
    index = 0
    refIndex = 0
    return nodes(
      exports.QuizQuestionImport({
        count,
        onImport: (questions) => {
          added.push(...questions)
          count += questions.length
        },
      }),
    )
  }
  async function upload(text) {
    render()
      .find((n) => n.type === 'input')
      .props.onChange({
        target: { files: [{ name: 'questions.json', size: text.length, text: async () => text }] },
      })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await upload(JSON.stringify([valid]))
  assert.equal(added.length, 0)
  render()
    .find((n) => n.type === 'button' && Array.isArray(n.props.children))
    .props.onClick()
  assert.equal(added.length, 1)
  assert.equal(count, 2)
  assert.ok(render().some((n) => n.props?.role === 'status'))
  await upload('{broken')
  assert.equal(added.length, 1)
  assert.ok(render().some((n) => n.props?.role === 'alert'))
  count = 100
  await upload(JSON.stringify([valid]))
  assert.ok(
    render().some((n) => n.props?.role === 'alert' && n.props.children.includes('exceed 100')),
  )
  assert.equal(added.length, 1)
})
