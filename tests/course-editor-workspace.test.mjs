import { courseUrlExports } from './helpers/course-url.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
test('module cards open a focused lesson dialog, preserve edits and protect uploads and unsaved navigation', async () => {
  const { JSDOM } = require('jsdom'),
    dom = new JSDOM('<a id="sidebar" href="/tutor">Dashboard</a><div id="root"></div>', {
      url: 'http://localhost:3000/tutor/courses/test/edit',
      pretendToBeVisual: true,
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
  dom.window.HTMLElement.prototype.scrollIntoView = function () {}
  const React = require('react'),
    { createRoot } = require('react-dom/client'),
    exports = {},
    schema = {},
    awards = {},
    saves = [],
    navigation = [],
    fields = new Map()
  for (const [target, file] of [
    [schema, 'commands.ts'],
    [awards, 'award-rules.ts'],
  ])
    vm.runInNewContext(
      compile(await readFile(new URL('../src/lib/lms/' + file, import.meta.url), 'utf8')),
      { exports: target, require },
    )
  const user = { id: randomUUID(), name: 'Tutor', role: 'tutor', isActive: true, avatar: '' }
  const course = {
    id: randomUUID(),
    title: 'Workspace course',
    description: 'A useful course',
    tutorId: user.id,
    status: 'draft',
    category: 'Cybersecurity',
    level: 'Beginner',
    price: 0,
    duration: 1,
    updatedAt: '2026-10-15T12:00:00Z',
    modules: Array.from({ length: 2 }, (_, mi) => ({
      id: randomUUID(),
      title: 'Module ' + (mi + 1),
      lessons: Array.from({ length: 2 }, (_, li) => ({
        id: randomUUID(),
        title: `Lesson ${mi + 1}.${li + 1}`,
        type: 'reading',
        duration: 10,
        content: `Guide ${mi + 1}.${li + 1}`,
      })),
    })),
  }
  let richProps,
    resourceProps,
    richCount = 0,
    resourceCount = 0,
    saveFail = false
  dom.reconfigure({
    url: `http://localhost:3000/tutor/courses/${course.id}/edit#lesson-${course.modules[1].lessons[1].id}`,
  })
  const Rich = (props) => {
    richProps = props
    React.useEffect(() => {
      richCount++
      return () => {
        richCount--
      }
    }, [])
    return React.createElement('textarea', {
      'aria-label': props.label,
      value: props.value,
      readOnly: true,
      'data-guide': true,
    })
  }
  const Resources = (props) => {
    resourceProps = props
    React.useEffect(() => {
      resourceCount++
      return () => {
        resourceCount--
      }
    }, [])
    return React.createElement('div', { 'data-resources': props.lessonId }, 'Resources')
  }
  const plain = ({ children, className }) => React.createElement('div', { className }, children)
  vm.runInNewContext(
    compile(
      await readFile(new URL('../src/components/features/courses.tsx', import.meta.url), 'utf8'),
    ),
    {
      exports,
      Error,
      window,
      document,
      URL,
      crypto: { randomUUID },
      require: (name) => {
        if (name === '@/lib/lms/course-url') return courseUrlExports
        if (name === '@/lib/lms/store')
          return {
            useLms: () => ({
              state: { courses: [course], users: [user], categories: ['Cybersecurity'] },
              user,
              ready: true,
              notice: () => {},
              execute: async (command) => {
                assert.equal(schema.commandSchema.safeParse(command).success, true)
                if (saveFail) throw new Error('Connection unavailable. Try again.')
                saves.push(command.course)
                return { updatedAt: '2026-10-15T13:00:00.123456Z' }
              },
            }),
          }
        if (name === '@/lib/lms/commands') return schema
        if (name === '@/lib/lms/award-rules') return awards
        if (name === 'next/navigation')
          return { useRouter: () => ({ push: (href) => navigation.push(href) }) }
        if (name === 'next/dynamic') return { default: () => Rich }
        if (name === 'next/link')
          return { default: ({ children, ...props }) => React.createElement('a', props, children) }
        if (name === './lesson-resources') return { LessonResources: Resources }
        if (name === './course-thumbnail') return { CourseThumbnail: () => null }
        if (name === './common')
          return {
            FeatureShell: plain,
            Panel: plain,
            Heading: ({ title, children }) => React.createElement('h2', null, title, children),
            Back: ({ href }) => React.createElement('a', { href }, 'Back to courses'),
            Field: ({ label, children }) => {
              fields.set(label, children.props)
              return React.createElement('label', null, label, children)
            },
          }
        if (name.startsWith('@/') || name.startsWith('./'))
          return new Proxy({}, { get: () => () => null })
        return require(name)
      },
    },
  )
  const root = createRoot(document.getElementById('root'))
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === label || b.textContent.trim() === label,
    )
  const click = async (label) => React.act(async () => button(label).click())
  try {
    await React.act(async () =>
      root.render(React.createElement(exports.CourseEditor, { role: 'tutor', id: course.id })),
    )
    assert.equal(document.getElementById('course-panel-curriculum').hidden, false)
    assert.equal(document.getElementById('course-panel-details').hidden, true)
    assert.equal(document.getElementById('course-panel-settings').style.display, 'none')
    assert.equal(richCount, 1)
    assert.equal(resourceCount, 1)
    assert.equal(richProps.value, 'Guide 2.2')
    const lessonDialog = document.querySelector('dialog[aria-labelledby="lesson-editor-title"]')
    assert.equal(lessonDialog.open, true)
    assert.equal(document.body.style.overflow, 'hidden')
    await React.act(async () => richProps.onExpandedChange(true))
    assert.ok(lessonDialog.className.includes('1400px'))
    assert.equal(
      document.querySelector('[aria-label="Lesson title"]').closest('[hidden]').hidden,
      true,
    )
    assert.equal(richCount, 1)
    assert.equal(resourceCount, 1)
    assert.equal(richProps.expanded, true)
    await React.act(async () => richProps.onExpandedChange(false))
    assert.ok(lessonDialog.className.includes('960px'))
    assert.equal(document.querySelector('[aria-label="Lesson title"]').closest('[hidden]'), null)
    assert.equal(richCount, 1)
    await click('Close lesson editor')
    assert.equal(richCount, 0)
    assert.equal(resourceCount, 0)
    assert.equal(window.location.hash, '')
    assert.equal(document.body.style.overflow, '')
    await click('Check publication requirements')
    const readiness = document.querySelector('dialog[aria-labelledby="course-readiness-title"]')
    assert.equal(readiness.open, true)
    assert.ok(readiness.textContent.includes('Publication requirements met'))
    await click('Close publication check')
    await click('Edit lesson 1.1: Lesson 1.1')
    await React.act(async () => richProps.onChange('Edited guide'))
    saveFail = true
    await click('Save course')
    assert.equal(lessonDialog.open, true)
    assert.match(lessonDialog.querySelector('[role="alert"]').textContent, /Connection unavailable/)
    assert.equal(richProps.value, 'Edited guide')
    saveFail = false
    const unload = new dom.window.Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    assert.equal(unload.defaultPrevented, true)
    await click('Next lesson')
    assert.equal(richProps.value, 'Guide 1.2')
    await click('Next lesson')
    assert.equal(richProps.value, 'Guide 2.1')
    assert.equal(window.location.hash, `#lesson-${course.modules[1].lessons[0].id}`)
    assert.equal(document.activeElement.textContent, 'Lesson 2.1')
    await click('Close lesson editor')
    await click('Edit lesson 1.1: Lesson 1.1')
    assert.equal(richProps.value, 'Edited guide')
    await click('Close lesson editor')
    await click('Edit lesson 2.2: Lesson 2.2')
    assert.equal(richProps.value, 'Guide 2.2')
    assert.equal(richCount, 1)
    assert.equal(resourceCount, 1)
    await React.act(async () => resourceProps.onUploadStateChange(true))
    assert.equal(button('Previous lesson').disabled, true)
    assert.equal(button('Course details').disabled, true)
    assert.equal(button('Close lesson editor').disabled, true)
    const escape = new dom.window.Event('cancel', { cancelable: true })
    await React.act(async () => lessonDialog.dispatchEvent(escape))
    assert.equal(escape.defaultPrevented, true)
    assert.equal(lessonDialog.open, true)
    await React.act(async () => resourceProps.onUploadStateChange(false))
    await click('Close lesson editor')
    await click('Course details')
    await React.act(async () =>
      button('Course details').dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      ),
    )
    assert.equal(button('Curriculum').getAttribute('aria-selected'), 'true')
    await click('Settings')
    assert.equal(document.getElementById('course-panel-settings').hidden, false)
    assert.equal(document.getElementById('course-panel-curriculum').hidden, true)
    await React.act(async () =>
      document
        .querySelector('form')
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
    )
    assert.equal(saves.length, 1)
    assert.equal(saves[0].modules[0].lessons[0].content, 'Edited guide')
    assert.equal(navigation.length, 0)
    assert.ok(document.body.textContent.includes('All changes saved'))
    await click('Curriculum')
    await click('Edit lesson 2.2: Lesson 2.2')
    await React.act(async () => richProps.onChange('Another unsaved edit'))
    await click('Close lesson editor')
    await React.act(async () => document.getElementById('sidebar').click())
    const warning = document.querySelector('dialog[aria-labelledby="leave-course-title"]')
    assert.equal(warning.open, true)
    assert.equal(navigation.length, 0)
    await click('Keep editing')
    assert.equal(warning.open, false)
    await click('Edit lesson 2.2: Lesson 2.2')
    assert.equal(richProps.value, 'Another unsaved edit')
    await click('Close lesson editor')
    await React.act(async () => document.getElementById('sidebar').click())
    await click('Leave without saving')
    assert.deepEqual(navigation, ['/tutor'])
    dom.reconfigure({ url: 'http://localhost:3000/tutor/courses/new' })
    await React.act(async () =>
      root.render(React.createElement(exports.CourseEditor, { key: 'new', role: 'tutor' })),
    )
    assert.equal(button('Curriculum').disabled, true)
    await React.act(async () =>
      fields.get('Course title').onChange({ target: { value: 'New course' } }),
    )
    assert.equal(button('Curriculum').disabled, false)
    await click('Curriculum')
    await click('Add first module')
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Module 1 title')
    assert.equal(button('+ Add lesson').disabled, true)
    await React.act(async () =>
      fields.get('Module title').onChange({ target: { value: 'Foundations' } }),
    )
    assert.ok(document.querySelector('[aria-label="Module 1 title"]'))
    await click('Done')
    assert.equal(document.querySelector('[aria-label="Module 1 title"]'), null)
    await click('+ Add lesson')
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Lesson title')
    assert.equal(richCount, 1)
    assert.equal(resourceCount, 1)
    assert.ok(document.body.textContent.includes('1 module · 1 lesson'))
    assert.ok(
      [...document.querySelectorAll('h2')].some((heading) => heading.textContent === 'Curriculum'),
    )
    await click('Close lesson editor')
    await click('Rename module 1')
    await React.act(async () =>
      fields.get('Module title').onChange({ target: { value: 'Updated foundations' } }),
    )
    assert.equal(
      document.querySelector('[aria-label="Module 1 title"]').value,
      'Updated foundations',
    )
    await click('Done')
    course.modules[0].title = ''
    await React.act(async () =>
      root.render(
        React.createElement(exports.CourseEditor, {
          key: 'blank-module',
          role: 'tutor',
          id: course.id,
        }),
      ),
    )
    await click('Curriculum')
    await click('Rename module 1')
    await React.act(async () => fields.get('Module title').onChange({ target: { value: 'F' } }))
    assert.equal(document.querySelector('[aria-label="Module 1 title"]').value, 'F')
    await click('Done')
    await React.act(async () => fields.get('Description').onChange({ target: { value: '' } }))
    await click('Check publication requirements')
    const issuesDialog = document.querySelector('dialog[aria-labelledby="course-readiness-title"]')
    assert.equal(issuesDialog.open, true)
    assert.ok(issuesDialog.textContent.includes('Add a description before publishing.'))
    const saveCount = saves.length
    await click('Add a description before publishing.')
    assert.equal(issuesDialog.open, false)
    assert.equal(document.getElementById('course-panel-details').hidden, false)
    assert.equal(saves.length, saveCount)
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
