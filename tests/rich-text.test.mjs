import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { richText } from './helpers/rich-text.mjs'
const require = createRequire(import.meta.url)
test('formatted lesson content retains safe formatting and legacy plain text stays escaped', () => {
  const html =
    '<h2>Audit guide</h2><p style="text-align: center"><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <span style="color: rgb(255, 0, 0); font-size: 18px">Colored</span></p><ol><li>First</li><li>Second</li></ol>'
  const saved = richText.safeLessonContent(richText.RICH_TEXT_PREFIX + html)
  assert.ok(saved.includes('<strong>Bold</strong>'))
  assert.ok(saved.includes('<ol><li>First</li>'))
  assert.ok(saved.includes('text-align:center'))
  assert.ok(saved.includes('font-size:18px'))
  assert.equal(richText.safeLessonContent('plain\ntext'), 'plain\ntext')
  assert.equal(
    richText.lessonEditorHtml('<script>plain text</script>\nLine 2'),
    '<p>&lt;script&gt;plain text&lt;/script&gt;</p><p>Line 2</p>',
  )
  const unsafe = richText.sanitizeLessonHtml(
    '<script>alert(1)</script><img src=x onerror="alert(1)"><p onclick="bad()" style="background-image:url(evil);position:fixed;color:red">Safe</p><a href="javascript:alert(1)">bad</a>',
  )
  assert.doesNotMatch(unsafe, /script|onerror|onclick|background-image|position|javascript:/)
  assert.ok(unsafe.includes('color:red'))
})
test('actual lesson renderer shows rich HTML safely and preserves the plain text fallback', async () => {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      await readFile(
        new URL('../src/components/features/lesson-content.tsx', import.meta.url),
        'utf8',
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
    { exports, require: (name) => (name === '@/lib/lms/rich-text' ? richText : require(name)) },
  )
  const rendered = exports.LessonContent({
    content: richText.RICH_TEXT_PREFIX + '<p><strong>Formatted</strong><script>bad()</script></p>',
    empty: 'Empty',
  })
  assert.equal(rendered.props.dangerouslySetInnerHTML.__html, '<p><strong>Formatted</strong></p>')
  assert.equal(
    exports.LessonContent({ content: 'Plain\ntext', empty: 'Empty' }).props.children,
    'Plain\ntext',
  )
})
test('Tiptap parses pasted headings, lists, emphasis, colors and alignment into persistent HTML', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  const { Editor } = require('@tiptap/core')
  const { StarterKit } = require('@tiptap/starter-kit')
  const { TextStyleKit } = require('@tiptap/extension-text-style')
  const { TextAlign } = require('@tiptap/extension-text-align')
  const editor = new Editor({
    extensions: [
      StarterKit,
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '',
  })
  try {
    editor.commands.insertContent(
      richText.sanitizeLessonHtml(
        '<h2>Guide</h2><p style="text-align:center"><span style="font-weight:bold">Word bold</span> <em>Italic</em> <u>Underline</u> <span style="color:rgb(255, 0, 0);font-size:18px">Red</span></p><ul><li>Task</li></ul>',
      ),
    )
    const html = editor.getHTML()
    assert.ok(html.includes('<h2>Guide</h2>'))
    assert.ok(html.includes('<strong>Word bold</strong>'))
    assert.ok(html.includes('<em>Italic</em>'))
    assert.ok(html.includes('<u>Underline</u>'))
    assert.ok(html.includes('<ul>'))
    assert.ok(html.includes('text-align: center'))
    assert.ok(html.includes('font-size: 18px'))
    assert.ok(richText.lessonEditorHtml(richText.RICH_TEXT_PREFIX + html).includes('Word bold'))
  } finally {
    editor.destroy()
    dom.window.close()
  }
})

test('lesson text editor mounts one editable textbox and keeps it through expansion and rerenders', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.MutationObserver = dom.window.MutationObserver
  // JSDOM has no layout, but ProseMirror uses Range geometry to scroll undo selections.
  dom.window.Range.prototype.getClientRects = () => []
  dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 0, 0)
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(
      await readFile(
        new URL('../src/components/features/lesson-rich-editor.tsx', import.meta.url),
        'utf8',
      ),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    { exports, require: (name) => (name === '@/lib/lms/rich-text' ? richText : require(name)) },
  )
  let value = 'Original guide',
    expanded = false
  const root = createRoot(document.getElementById('root'))
  const render = () =>
    root.render(
      React.createElement(exports.LessonRichEditor, {
        label: 'Lesson text',
        value,
        expanded,
        onExpandedChange: (next) => {
          expanded = next
          render()
        },
        onChange: (next) => {
          value = next
          render()
        },
      }),
    )
  try {
    await React.act(async () => {
      render()
    })
    assert.equal(document.querySelectorAll('[role="textbox"]').length, 1)
    const textbox = document.querySelector('[role="textbox"]')
    assert.equal(textbox.getAttribute('contenteditable'), 'true')
    assert.ok(textbox.classList.contains('w-full'))
    assert.equal(textbox.classList.contains('mx-auto'), false)
    assert.ok(textbox.parentElement.parentElement.classList.contains('h-80'))
    await React.act(async () => {
      textbox.innerHTML = '<p>Updated guide</p>'
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    assert.ok(value.includes('Updated guide'))
    await React.act(async () => {
      ;[...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Expand editor')
        .click()
    })
    assert.equal(document.querySelectorAll('[role="textbox"]').length, 1)
    assert.equal(document.querySelector('[role="textbox"]'), textbox)
    assert.ok(textbox.textContent.includes('Updated guide'))
    assert.equal(expanded, true)
    assert.ok(document.querySelector('section').classList.contains('flex-1'))
    assert.equal(
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Collapse editor')
        .getAttribute('aria-expanded'),
      'true',
    )
    await React.act(async () => {
      ;[...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Collapse editor')
        .click()
    })
    assert.equal(expanded, false)
    assert.equal(document.querySelector('[role="textbox"]'), textbox)
    assert.ok(textbox.textContent.includes('Updated guide'))
    await React.act(async () => document.querySelector('[aria-label="Undo"]').click())
    assert.ok(textbox.textContent.includes('Original guide'))
    await React.act(async () => document.querySelector('[aria-label="Redo"]').click())
    assert.ok(textbox.textContent.includes('Updated guide'))
  } finally {
    await React.act(async () => {
      root.unmount()
    })
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
