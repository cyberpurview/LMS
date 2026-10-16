// An operator session: credential enters through stdin and stays in process memory.
// Never used by the web application. No token is written to a file or printed.
import { createInterface } from 'node:readline'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
const envFile = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
const url = envFile.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1].trim()
const ref = new URL(url).hostname.split('.')[0]
if (process.stdin.isTTY) process.stdin.setRawMode(true)
const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false })
let token
console.log('Waiting for operator credential on stdin (not echoed).')
for await (const line of input) {
  if (!token) {
    token = line.trim()
    console.log('Operator credential loaded in memory.')
    continue
  }
  try {
    const command = JSON.parse(line)
    if (command.exit) break
    if (command.cli) {
      const binary = process.argv[2].endsWith('.exe')
      const child = spawn(
        binary ? process.argv[2] : process.execPath,
        binary ? command.cli : [process.argv[2], ...command.cli],
        {
          env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      )
      let output = ''
      child.stdout.on('data', (chunk) => {
        output += chunk
      })
      child.stderr.on('data', (chunk) => {
        output += chunk
      })
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', resolve)
      })
      if (command.save && code === 0) {
        await writeFile(command.save, output)
        console.log(JSON.stringify({ exitCode: code, saved: command.save }))
      } else
        console.log(
          JSON.stringify({ exitCode: code, output: output.replaceAll(token, '[REDACTED]') }),
        )
    } else {
      if (command.migration) {
        command.path = '/database/migrations'
        command.method = 'POST'
        command.body = { name: command.name, query: await readFile(command.migration, 'utf8') }
      }
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${ref}${command.path || ''}`,
        {
          method: command.method || 'GET',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: command.body ? JSON.stringify(command.body) : undefined,
          signal: AbortSignal.timeout(60000),
        },
      )
      const data = await response.json()
      if (command.envSecret && response.ok) {
        const secret =
          data.find((k) => k.name === 'service_role')?.api_key ||
          data.find((k) => k.type === 'secret')?.api_key
        if (!secret) throw new Error('Server key was not returned by Supabase')
        const destination = new URL('../.env.local', import.meta.url)
        const existing = await readFile(destination, 'utf8')
        if (!existing.includes('SUPABASE_SECRET_KEY='))
          await appendFile(destination, `\nSUPABASE_SECRET_KEY=${secret}\n`)
        console.log(JSON.stringify({ status: response.status, configured: 'SUPABASE_SECRET_KEY' }))
      } else if (command.save && response.ok) {
        await writeFile(command.save, command.types ? data.types : JSON.stringify(data, null, 2))
        console.log(JSON.stringify({ status: response.status, saved: command.save }))
      } else if (command.select && response.ok)
        console.log(
          JSON.stringify({
            status: response.status,
            data: Object.fromEntries(command.select.map((k) => [k, data[k]])),
          }),
        )
      else
        console.log(
          JSON.stringify({ status: response.status, data }).replaceAll(token, '[REDACTED]'),
        )
    }
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }).replaceAll(token, '[REDACTED]'))
  }
}
token = undefined
input.close()
if (process.stdin.isTTY) process.stdin.setRawMode(false)
process.stdin.pause()
