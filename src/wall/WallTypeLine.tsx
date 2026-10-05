import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ArrowUp, Paperclip, X } from 'lucide-react'
import { MAX_IMAGES, readableFiles, typedTurn, type TypedImage } from './typeLine'
import { toImages } from './toImages'

// The line at the foot of Casa's band on a computer (canvas 22a–b): type with the computer's own keyboard, Enter
// sends, Shift+Enter starts a new line; paste a text thread, or paste / drop / attach pictures — several at once —
// which go with the words to the planner.

export interface WallTypeLineHandle {
  focus: () => void
  addFiles: (files: File[]) => Promise<void>
}

const WallTypeLine = forwardRef<WallTypeLineHandle, {
  onSend: (text: string, images: TypedImage[]) => void
  busy?: boolean
  initialText?: string
  initialImages?: TypedImage[]
  /** About how many characters fit on a line (the panel is narrow), so the box grows with the words. */
  charsPerLine?: number
  placeholder?: string
  /** The computer's panel (Jake, Oct 3: "restoration hardware subtle elegant"): a hairline brass field, a brass send. */
  quiet?: boolean
}>(function WallTypeLine({ onSend, busy = false, initialText = '', initialImages = [], charsPerLine = 90, placeholder = 'Type, or paste a message or pictures', quiet = false }, ref) {
  const [text, setText] = useState(initialText)
  const [images, setImages] = useState<TypedImage[]>(initialImages)
  const [focused, setFocused] = useState(true)
  const field = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const addFiles = async (files: File[]) => {
    const added = await toImages(files)
    if (added.length) setImages((list) => [...list, ...added].slice(0, MAX_IMAGES))
    field.current?.focus()
  }
  useImperativeHandle(ref, () => ({ focus: () => field.current?.focus(), addFiles }))
  const submit = () => {
    const turn = typedTurn(text, images)
    if (!turn || busy) return
    onSend(turn.text, turn.images)
    setText('')
    setImages([])
  }
  const lines = Math.min(6, Math.max(1, text.split('\n').length, Math.ceil(text.length / charsPerLine)))
  return (
    <form
      aria-label="Type to ask"
      className="flex flex-col gap-[12px]"
      onSubmit={(e) => { e.preventDefault(); submit() }}
    >
      {images.length > 0 && (
        <div className="flex gap-[18px] pt-[8px]">
          {images.map((img, i) => (
            <div key={`${img.name}-${i}`} className="relative h-[96px] w-[132px] shrink-0">
              {img.mimeType === 'application/pdf'
                ? <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-wall-on-pigment text-wall-detail font-semibold text-wall-ink">PDF</div>
                : <img src={img.dataUrl} alt={img.name} className="h-full w-full rounded-[12px] object-cover" />}
              <button
                type="button"
                aria-label={`Remove ${img.name}`}
                onClick={() => setImages((list) => list.filter((_, j) => j !== i))}
                className="absolute -right-[10px] -top-[10px] flex h-[32px] w-[32px] items-center justify-center rounded-full border-0 bg-wall-on-pigment p-0 text-wall-ink"
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-[12px]">
        <textarea
          ref={field}
          autoFocus
          aria-label="Type to ask"
          value={text}
          rows={lines}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
            // Keys typed here are Casa's, not the wall's (Esc still closes the band).
            if (e.key !== 'Escape') e.stopPropagation()
          }}
          onPaste={(e) => {
            const files = readableFiles(Array.from(e.clipboardData.files))
            if (files.length === 0) return
            e.preventDefault()
            void addFiles(files)
          }}
          className={quiet
            ? `min-h-[56px] min-w-0 flex-1 resize-none rounded-[28px] border border-solid bg-wall-on-pigment/[0.04] px-[24px] py-[14px] font-body text-wall-body leading-[1.4] text-wall-on-pigment outline-none placeholder:text-wall-night-ink-2/70 ${focused ? 'border-wall-night-brass/80' : 'border-wall-night-brass/30'}`
            : `min-h-[64px] min-w-0 flex-1 resize-none rounded-[18px] border-2 border-solid bg-wall-on-pigment/8 px-[22px] py-[16px] font-body text-wall-body leading-[1.4] text-wall-on-pigment outline-none placeholder:text-wall-night-ink-2 ${focused ? 'border-wall-night-brass' : 'border-wall-ink-2'}`}
        />
        <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <button type="button" aria-label="Add a picture" onClick={() => picker.current?.click()} className={quiet ? 'flex h-[56px] w-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-night-ink-2' : 'flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent p-0 text-wall-on-pigment'}>
          <Paperclip size={22} />
        </button>
        <button type="submit" aria-label="Send" disabled={busy || !typedTurn(text, images)} className={quiet ? 'flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border-0 bg-wall-night-brass p-0 text-wall-ink disabled:opacity-30' : 'flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border-0 bg-wall-on-pigment p-0 text-wall-ink disabled:opacity-40'}>
          <ArrowUp size={24} />
        </button>
      </div>
      <div className={quiet ? 'px-[24px] text-wall-label text-wall-night-ink-2/60' : 'text-wall-label text-wall-night-ink-2'}>{quiet ? 'Enter sends · paste or drop a message or pictures' : 'Enter sends · Shift+Enter for a new line · paste a message or pictures (⌘V), or drop them here'}</div>
    </form>
  )
})

export default WallTypeLine
