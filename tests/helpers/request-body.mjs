import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
export const requestBody = {}
vm.runInNewContext(
  ts.transpileModule(
    await readFile(new URL('../../src/lib/server/request-body.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  { exports: requestBody, Buffer, Error, require: () => ({}) },
)
