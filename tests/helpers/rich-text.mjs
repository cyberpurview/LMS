import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
export const richText = {}
vm.runInNewContext(
  ts.transpileModule(
    await readFile(new URL('../../src/lib/lms/rich-text.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
  ).outputText,
  { exports: richText, require },
)
