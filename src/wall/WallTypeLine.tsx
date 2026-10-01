import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
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
  /** Its height as it grows, so the band can keep room for it. */
  onHeight?: (px: number) => void
}>(function WallTypeLine({ onSend, busy = false, initialText = '', initialImages = [], onHeight }, ref) {
  const box = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || !onHeight || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => onHeight(el.offsetHeight))
    watch.observe(el)
    return () => watch.disconnect()
  }, [onHeight])
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
  const lines = Math.min(4, Math.max(1, text.split('\n').length, Math.ceil(text.length / 90)))
  return (
    <form
      ref={box}
      aria-label="Type to Casa"
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
          aria-label="Type to Casa"
          value={text}
          rows={lines}
          placeholder="Type to Casa, or paste a message or pictures"
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
          className={`min-h-[64px] min-w-0 flex-1 resize-none rounded-[18px] border-2 border-solid bg-wall-on-pigment/8 px-[22px] py-[16px] font-body text-wall-body leading-[1.4] text-wall-on-pigment outline-none placeholder:text-wall-night-ink-2 ${focused ? 'border-wall-night-brass' : 'border-wall-ink-2'}`}
        />
        <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <button type="button" aria-label="Add a picture" onClick={() => picker.current?.click()} className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent p-0 text-wall-on-pigment">
          <Paperclip size={22} />
        </button>
        <button type="submit" aria-label="Send" disabled={busy || !typedTurn(text, images)} className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border-0 bg-wall-on-pigment p-0 text-wall-ink disabled:opacity-40">
          <ArrowUp size={24} />
        </button>
      </div>
      <div className="text-wall-label text-wall-night-ink-2">Enter sends · Shift+Enter for a new line · paste a message or pictures (⌘V), or drop them here</div>
    </form>
  )
})

export default WallTypeLine
