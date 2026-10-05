import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import { readableFiles, startsQuickAsk, typingInAField } from './typeLine'

// Start typing anywhere (canvas 22c): on a computer, with Casa closed, a plain key opens a small line at the foot of
// the wall with that letter in it; Enter sends it into Casa, Esc lets it go. Pasting words does the same; pasting
// pictures opens Casa with them waiting in its line.
export default function WallQuickAsk({ enabled, onSend, onPasteFiles }: {
  enabled: boolean
  onSend: (text: string) => void
  onPasteFiles: (files: File[]) => void
}) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled || text !== null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || typingInAField(document.activeElement as HTMLElement | null) || !startsQuickAsk(e)) return
      e.preventDefault()
      setText(e.key)
    }
    const onPaste = (e: ClipboardEvent) => {
      if (typingInAField(document.activeElement as HTMLElement | null) || !e.clipboardData) return
      const files = readableFiles(Array.from(e.clipboardData.files))
      if (files.length) {
        e.preventDefault()
        onPasteFiles(files)
        return
      }
      const words = e.clipboardData.getData('text')
      if (words.trim()) {
        e.preventDefault()
        setText(words)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('paste', onPaste)
    }
  }, [enabled, text, onPasteFiles])
  if (!enabled || text === null) return null
  return (
    <form
      aria-label="Ask"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSend(text.trim())
        setText(null)
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-[44px] left-1/2 z-30 flex w-[1100px] -translate-x-1/2 items-center gap-[14px] rounded-full border border-solid border-wall-night-brass/60 bg-wall-band py-[12px] pl-[24px] pr-[16px] font-body text-wall-on-pigment shadow-[0_12px_36px] shadow-wall-night-ground/40"
    >
      <Mic size={24} className="shrink-0 text-wall-night-brass" aria-hidden="true" />
      <span className="shrink-0 text-wall-body text-wall-night-ink-2">Ask:</span>
      <input
        autoFocus
        aria-label="Ask"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setText(null) } }}
        onBlur={() => { if (!text.trim()) setText(null) }}
        className="h-[52px] min-w-0 flex-1 border-0 bg-transparent font-body text-wall-body text-wall-on-pigment outline-none"
      />
      <span className="shrink-0 text-wall-label text-wall-night-ink-2">Enter to send · Esc to cancel</span>
    </form>
  )
}
