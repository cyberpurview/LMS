import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
export const courseUrlExports = {}
vm.runInNewContext(
  ts.transpileModule(
    await readFile(new URL('../../src/lib/lms/course-url.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports: courseUrlExports },
)
