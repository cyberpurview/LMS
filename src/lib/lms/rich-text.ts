import sanitizeHtml from 'sanitize-html'
export const RICH_TEXT_PREFIX = '<!--cyberpurview:rich-text:v1-->'
export function sanitizeLessonHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'h1',
      'h2',
      'h3',
      'h4',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'a',
      'span',
      'hr',
    ],
    allowedAttributes: { '*': ['style'], a: ['href', 'title', 'target', 'rel'], ol: ['start'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    allowedStyles: {
      '*': {
        'text-align': [/^(left|center|right|justify)$/],
        'font-weight': [/^(normal|bold|[1-9]00)$/],
        'font-style': [/^(normal|italic)$/],
        'text-decoration': [/^(none|underline|line-through)$/],
        color: [/^#[\da-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
        'background-color': [/^#[\da-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]+$/i],
        'font-size': [/^\d{1,2}(\.\d+)?(px|pt|em|rem)$/],
        'font-family': [/^[\w\s,'"-]+$/],
        'line-height': [/^\d(\.\d+)?(px|em|rem|%)?$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  })
}
export function safeLessonContent(value: string) {
  return value.startsWith(RICH_TEXT_PREFIX)
    ? RICH_TEXT_PREFIX + sanitizeLessonHtml(value.slice(RICH_TEXT_PREFIX.length))
    : value
}
export function lessonEditorHtml(value: string) {
  if (value.startsWith(RICH_TEXT_PREFIX))
    return sanitizeLessonHtml(value.slice(RICH_TEXT_PREFIX.length))
  return value
    .split(/\r?\n/)
    .map(
      (line) =>
        `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</p>`,
    )
    .join('')
}
