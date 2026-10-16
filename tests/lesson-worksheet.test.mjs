import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const source = ts.transpileModule(
  await readFile(
    new URL('../src/components/features/lesson-worksheet.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  },
).outputText
function harness(fail = false) {
  const exports = {},
    slots = [],
    commands = []
  let index = 0
  vm.runInNewContext(source, {
    exports,
    Error,
    require: (name) => {
      if (name === 'react')
        return {
          useState: (initial) => {
            const slot = index++
            if (!(slot in slots)) slots[slot] = initial
            return [slots[slot], (value) => (slots[slot] = value)]
          },
        }
      if (name === '@/lib/lms/store')
        return {
          useLms: () => ({
            execute: async (command) => {
              commands.push(command)
              if (fail) throw new Error('Worksheet changed in another session.')
            },
          }),
        }
      if (name === './common') return { inputClass: 'input', secondaryClass: 'button' }
      return require(name)
    },
  })
  const nodes = (n) =>
    !n || typeof n !== 'object'
      ? []
      : Array.isArray(n)
        ? n.flatMap(nodes)
        : [n, ...nodes(n.props?.children)]
  return {
    exports,
    commands,
    render: () => {
      index = 0
      return nodes(
        exports.WorksheetEditor({ lesson: { id: 'lesson-id', worksheet: 'Original exercise' } }),
      )
    },
    nodes,
  }
}
test('learners see only the authored exercise and no download when none exists', () => {
  const h = harness()
  const empty = h.nodes(
    h.exports.LessonWorksheet({ lesson: { id: 'lesson-id' }, courseTitle: 'Course' }),
  )
  assert.equal(
    empty.some((n) => n.type === 'button'),
    false,
  )
  const content = h.nodes(
    h.exports.LessonWorksheet({
      lesson: { id: 'lesson-id', worksheet: 'Analyze these audit findings.' },
      courseTitle: 'Course',
    }),
  )
  assert.ok(content.some((n) => n.props?.children === 'Analyze these audit findings.'))
  assert.ok(content.some((n) => n.type === 'button'))
})
test('worksheet editor saves the lesson and original revision, and keeps failed edits visible', async () => {
  for (const fail of [false, true]) {
    const h = harness(fail)
    assert.equal(h.render().find((n) => n.type === 'button').props.disabled, true)
    h.render()
      .find((n) => n.type === 'textarea')
      .props.onChange({ target: { value: 'Updated exercise' } })
    await h
      .render()
      .find((n) => n.type === 'button')
      .props.onClick()
    assert.equal(h.commands[0].body, 'Updated exercise')
    assert.equal(h.commands[0].previous, 'Original exercise')
    assert.equal(h.commands[0].lessonId, 'lesson-id')
    const nodes = h.render()
    assert.equal(nodes.find((n) => n.type === 'textarea').props.value, 'Updated exercise')
    assert.ok(nodes.some((n) => n.props?.role === (fail ? 'alert' : 'status')))
    assert.equal(nodes.find((n) => n.type === 'button').props.disabled, !fail)
  }
})
