import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const source = ts.transpileModule(
  await readFile(new URL('../src/lib/lms/completion-sound.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText
function setup(unsupported = false) {
  const exports = {},
    tones = [],
    storage = new Map(),
    contexts = []
  class Audio {
    state = 'suspended'
    currentTime = 0
    destination = {}
    constructor() {
      contexts.push(this)
      if (unsupported) throw new Error('Unavailable')
    }
    async resume() {
      this.state = 'running'
    }
    async close() {
      this.state = 'closed'
    }
    createOscillator() {
      const tone = {
        frequency: { value: 0 },
        connect() {},
        disconnect() {},
        start(t) {
          tones.push({ frequency: this.frequency.value, at: t })
        },
        stop() {},
        onended: null,
      }
      return tone
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      }
    }
  }
  vm.runInNewContext(source, {
    exports,
    AudioContext: Audio,
    Date,
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
  })
  return { ...exports, tones, contexts }
}
const base = {
  userId: 'creator',
  type: 'success',
  isRead: false,
  createdAt: '2026-10-15T12:00:01Z',
  eventKey: 'ai-generation:11111111-1111-4111-8111-111111111111:complete',
}
test('completion sound is opt-in, silent for old/read/noncompletion events and deduplicated across polling and tabs', async () => {
  const audio = setup(),
    start = Date.parse('2026-10-15T12:00:00Z'),
    feed = audio.createCompletionSoundFeed('creator', start)
  feed([{ ...base, id: 'muted' }], false, true)
  assert.equal(audio.tones.length, 0)
  assert.equal(audio.contexts.length, 0)
  await audio.prepareCompletionSound()
  feed([{ ...base, id: 'muted' }], true, true)
  assert.equal(audio.tones.length, 0)
  for (const item of [
    { ...base, id: 'old', createdAt: '2026-10-15T11:00:00Z' },
    { ...base, id: 'read', isRead: true },
    { ...base, id: 'wrong-owner', userId: 'other' },
    { ...base, id: 'failed', type: 'info' },
    { ...base, id: 'outline', eventKey: base.eventKey.replace('complete', 'review') },
    { ...base, id: 'unrelated', eventKey: 'other:event' },
  ])
    feed([item], true, true)
  assert.equal(audio.tones.length, 0)
  const ready = { ...base, id: 'ready' }
  feed([ready], true, false)
  assert.equal(audio.tones.length, 0)
  feed([ready], true, true)
  assert.equal(audio.tones.length, 2)
  assert.equal(audio.tones[0].frequency, 660)
  feed([ready], true, true)
  audio.createCompletionSoundFeed('creator', start)([ready], true, true)
  assert.equal(audio.tones.length, 2)
  // A burst of completions still plays only one short two-note chime.
  feed(
    [
      { ...base, id: 'next' },
      { ...base, id: 'next-2' },
    ],
    true,
    true,
  )
  assert.equal(audio.tones.length, 4)
  audio.closeCompletionSound()
  assert.equal(audio.contexts[0].state, 'closed')
})
test('unsupported or suspended browser audio never blocks notifications', async () => {
  const unsupported = setup(true)
  await unsupported.prepareCompletionSound()
  assert.doesNotThrow(() => unsupported.playCompletionSound())
  const locked = setup()
  assert.doesNotThrow(() =>
    locked.createCompletionSoundFeed('creator', 0)([{ ...base, id: 'ready' }], true, true),
  )
  assert.equal(locked.tones.length, 0)
})
