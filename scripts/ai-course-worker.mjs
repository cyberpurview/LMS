// An always-on scheduler; the database owns jobs, leases, retries and concurrency.
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
const source = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '')
const env = (name) =>
  process.env[name] ||
  source
    .match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, '')
const secret = env('CRON_SECRET')
if (!secret) throw new Error('Configure CRON_SECRET before starting the AI worker.')
const base = new URL(env('AI_WORKER_URL') || 'http://localhost:3000')
if (
  base.username ||
  base.password ||
  !['http:', 'https:'].includes(base.protocol) ||
  (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
)
  throw new Error('Use a local HTTP server or your own HTTPS deployment for AI_WORKER_URL.')
const endpoint = new URL('/api/cron/ai-courses', base)
let lastStatus = ''
console.log('AI course worker running. Jobs continue independently of browser tabs.')
while (true) {
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(70000),
    })
    const data = await response.json().catch(() => ({}))
    const status = response.ok ? 'ready' : `HTTP ${response.status}`
    if (status !== lastStatus) {
      console.log(`Worker: ${status}`)
      lastStatus = status
    }
    if (data.processed)
      console.log(
        data.failed
          ? 'Generation attempt deferred or failed; progress retained.'
          : 'Generation step saved.',
      )
  } catch {
    if (lastStatus !== 'unavailable') {
      console.log('Worker: server unavailable; waiting to reconnect.')
      lastStatus = 'unavailable'
    }
  }
  await delay(15000)
}
