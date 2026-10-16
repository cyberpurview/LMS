import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
export const quizAnswerReviewExports = {}
vm.runInNewContext(
  ts.transpileModule(
    await readFile(
      new URL('../../src/components/features/quiz-answer-review.tsx', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText,
  {
    exports: quizAnswerReviewExports,
    require: (name) => {
      if (name === './common')
        return {
          secondaryClass: 'secondary',
          Panel: ({ children, ...props }) => require('react').createElement('div', props, children),
        }
      return require(name)
    },
  },
)
