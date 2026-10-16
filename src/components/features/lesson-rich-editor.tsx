'use client'
import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  Link2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { RICH_TEXT_PREFIX, lessonEditorHtml, sanitizeLessonHtml } from '@/lib/lms/rich-text'

export function LessonRichEditor({
  value,
  onChange,
  label,
  disabled = false,
  expanded: expandedProp,
  onExpandedChange,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  disabled?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const expanded = expandedProp ?? localExpanded
  const [link, setLink] = useState('')
  const [showLink, setShowLink] = useState(false)
  const [error, setError] = useState('')
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, heading: { levels: [1, 2, 3] } }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    content: lessonEditorHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
        class:
          'lesson-rich-text w-full max-w-none p-4 sm:p-5 min-h-[320px] text-sm leading-7 outline-none',
      },
      transformPastedHTML: sanitizeLessonHtml,
    },
    onUpdate: ({ editor }) => {
      const next = editor.isEmpty ? '' : RICH_TEXT_PREFIX + editor.getHTML()
      if (next.length > 100000) {
        setError('Lesson text must be at most 100,000 characters. Shorten the text before saving.')
      } else setError('')
      onChange(next)
    },
  })
  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [disabled, editor])
  useEffect(() => {
    if (
      editor &&
      value !== (editor.isEmpty ? '' : RICH_TEXT_PREFIX + editor.getHTML()) &&
      lessonEditorHtml(value) !== editor.getHTML()
    )
      editor.commands.setContent(lessonEditorHtml(value), { emitUpdate: false })
  }, [value, editor])
  const toolbarIcons: Record<string, typeof Bold> = {
    Bold,
    Italic,
    Underline,
    Heading: Heading2,
    Bullets: List,
    'Numbered list': ListOrdered,
    Quote,
    'Align left': AlignLeft,
    Center: AlignCenter,
    Link: Link2,
    Undo: Undo2,
    Redo: Redo2,
  }
  const action = (name: string, run: () => void, active = false) => {
    const Icon = toolbarIcons[name]
    return (
      <button
        type="button"
        aria-label={name}
        title={name}
        aria-pressed={active}
        disabled={disabled || !editor}
        className={`p-2 rounded-lg text-xs font-medium ${active ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </button>
    )
  }
  return (
    <section
      className={`w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white ${expanded && onExpandedChange ? 'flex min-h-0 flex-1 flex-col' : ''}`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold">Lesson text</h4>
        {disabled && <span className="text-xs text-slate-400">Read-only</span>}
      </div>
      <div
        className="flex shrink-0 flex-wrap gap-1 items-center border-b border-slate-100 bg-slate-50 p-2"
        role="toolbar"
        aria-label="Text formatting"
      >
        {action('Bold', () => editor?.chain().focus().toggleBold().run(), editor?.isActive('bold'))}
        {action(
          'Italic',
          () => editor?.chain().focus().toggleItalic().run(),
          editor?.isActive('italic'),
        )}
        {action(
          'Underline',
          () => editor?.chain().focus().toggleUnderline().run(),
          editor?.isActive('underline'),
        )}
        {action(
          'Heading',
          () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          editor?.isActive('heading', { level: 2 }),
        )}
        {action(
          'Bullets',
          () => editor?.chain().focus().toggleBulletList().run(),
          editor?.isActive('bulletList'),
        )}
        {action(
          'Numbered list',
          () => editor?.chain().focus().toggleOrderedList().run(),
          editor?.isActive('orderedList'),
        )}
        {action(
          'Quote',
          () => editor?.chain().focus().toggleBlockquote().run(),
          editor?.isActive('blockquote'),
        )}
        {action('Align left', () => editor?.chain().focus().setTextAlign('left').run())}
        {action('Center', () => editor?.chain().focus().setTextAlign('center').run())}
        {action(
          'Link',
          () => {
            setLink(editor?.getAttributes('link').href || '')
            setShowLink(!showLink)
          },
          editor?.isActive('link'),
        )}
        {action('Undo', () => editor?.chain().focus().undo().run())}
        {action('Redo', () => editor?.chain().focus().redo().run())}
        <button
          type="button"
          className="ml-auto px-2 py-1 text-xs font-semibold text-brand-600"
          aria-expanded={expanded}
          onClick={() => {
            if (onExpandedChange) onExpandedChange(!expanded)
            else setLocalExpanded(!expanded)
            editor?.commands.focus(undefined, { scrollIntoView: false })
          }}
        >
          {expanded ? 'Collapse editor' : 'Expand editor'}
        </button>
      </div>
      {showLink && (
        <div className="flex flex-wrap gap-2 p-3 border-b border-slate-100">
          <input
            type="url"
            aria-label="Link URL"
            placeholder="https://…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="border rounded px-2 py-1 text-sm flex-1"
          />
          <button
            type="button"
            className="text-sm text-brand-600"
            onClick={() => {
              if (link && !/^(https?:\/\/|mailto:)/i.test(link)) {
                setError('Use an https://, http:// or mailto: link.')
                return
              }
              const chain = editor?.chain().focus().extendMarkRange('link')
              link ? chain?.setLink({ href: link }).run() : chain?.unsetLink().run()
              setShowLink(false)
              setError('')
            }}
          >
            Apply link
          </button>
        </div>
      )}
      <div
        className={`overflow-y-auto overscroll-contain ${expanded ? (onExpandedChange ? 'min-h-0 flex-1' : 'h-[65vh] min-h-[420px]') : 'h-80'}`}
      >
        <EditorContent editor={editor} />
      </div>
      {error && (
        <p role="alert" className="p-3 text-sm text-rose-600">
          {error}
        </p>
      )}
    </section>
  )
}
