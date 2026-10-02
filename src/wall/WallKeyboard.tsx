import { useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { deviceKeyboardHere } from './keyboardMode'
import { Mic } from 'lucide-react'
import { voiceFinal } from './assistant'
import { WallSpeechContext } from './speechContext'

// The wall keyboard (board 03e): full width along the bottom, finger-sized keys.
// The kiosk has no physical keyboard; a desktop one still types into the field.
// "Say it" (Jake, 2026-09-29: "can you add a mic option so I can do speech to text, it's faster than
// typing on the Pi"): the words go in after what's already typed, live as he speaks, and the mic
// stops when he pauses — the same speech-to-text as the voice band.

const LETTER_ROWS = ['qwertyuiop', "asdfghjkl'", 'zxcvbnm']
const SYMBOL_ROWS = ['1234567890', '-/:;()$&@"', '.,?!#+=']
const KEY = 'flex h-[76px] w-[118px] shrink-0 items-center justify-center rounded-[12px] bg-wall-night-rule text-wall-date text-wall-night-ink'
const WIDE_KEY = 'flex h-[76px] w-[182px] shrink-0 items-center justify-center rounded-[12px] bg-wall-night-stone text-wall-heading text-wall-night-ink'

export interface WallKeyboardProps {
  value: string
  onChange: (value: string) => void
  onDone: () => void
  /** The screen already shows what's being typed (a strip above the keyboard); otherwise, while
   * listening, the keyboard shows the words itself as they're heard. */
  showsValue?: boolean
  /** Esc on a computer: let it go (where there's a Cancel); otherwise Esc keeps what's typed. */
  onCancel?: () => void
}

// The last thing pressed (a field, a step's title, "+ Add here"): on a computer the words are typed right there, in a
// box over it (Jake, 2026-10-01: "I want to use the keyboard to input and modify text, not this kicker panel"). Kept
// from the press itself, since a Mac doesn't give a clicked button the focus.
let lastPressed: { el: HTMLElement; at: number } | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { if (e.target instanceof HTMLElement) lastPressed = { el: e.target, at: Date.now() } }, true)
}

interface InPlace { left: number; top: number; width: number; height: number; fontSize: number; fontFamily: string; fontWeight: string }

/** Where to type: over the field just pressed, in its own size and face (screen pixels, the stage's scale applied). */
function fieldPressed(): InPlace | null {
  if (typeof window === 'undefined' || !lastPressed || Date.now() - lastPressed.at > 2000) return null
  const el = lastPressed.el.closest('button, [role="button"], label, div') as HTMLElement | null
  if (!el || el.closest('[aria-label="Keyboard"]')) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  const scale = el.offsetWidth ? r.width / el.offsetWidth : 1
  const cs = window.getComputedStyle(el)
  const width = Math.min(Math.max(r.width, 520 * scale), window.innerWidth - r.left - 12)
  return { left: r.left, top: r.top, width, height: Math.max(r.height, 52 * scale), fontSize: parseFloat(cs.fontSize) * scale, fontFamily: cs.fontFamily, fontWeight: cs.fontWeight }
}

const joined = (base: string, said: string) => (base.trim() ? `${base.trimEnd()} ${said}` : said.charAt(0).toUpperCase() + said.slice(1))

export default function WallKeyboard({ value, onChange, onDone, showsValue = false, onCancel }: WallKeyboardProps) {
  // Off the kiosk, the device's own keyboard types (Jake, 2026-09-29): a slim bar, not Casa's keys.
  const [device] = useState(deviceKeyboardHere)
  // Read once, when typing starts (the pressed field is still on screen then).
  const [inPlace] = useState(() => (deviceKeyboardHere() ? fieldPressed() : null))
  const [shift, setShift] = useState(value.length === 0)
  const [symbols, setSymbols] = useState(false)
  const useSpeech = useContext(WallSpeechContext)
  const base = useRef('')
  const captured = useRef('')
  const change = useRef(onChange)
  useEffect(() => { change.current = onChange })
  // The callbacks read refs only when words arrive, never while rendering (the same hook as the band).
  // eslint-disable-next-line react-hooks/refs
  const speech = useSpeech({
    onInterim: (text) => { if (text.trim()) change.current(joined(base.current, text.trim())) },
    onFinalTranscript: (text) => {
      const step = voiceFinal(captured.current, text)
      captured.current = step.captured
      if (step.captured) change.current(joined(base.current, step.captured))
      if (step.toSend) {
        change.current(joined(base.current, step.toSend))
        captured.current = ''
        void speech.stop()
      }
    },
    onDismiss: () => {},
    onConfirm: () => {},
    onCancel: () => {},
    hasPendingAction: false,
  })
  const stopRef = useRef(speech.stop)
  useEffect(() => { stopRef.current = speech.stop })
  useEffect(() => () => void stopRef.current(), [])
  const listening = speech.listening || speech.connecting
  const mic = () => {
    if (listening) return speech.finish()
    base.current = value
    captured.current = ''
    void speech.start()
  }
  const type = (text: string) => {
    onChange(value + (shift ? text.toUpperCase() : text))
    setShift(false)
  }
  const rows = symbols ? SYMBOL_ROWS : LETTER_ROWS
  const finished = useRef(false)
  const done = () => { if (listening) void speech.stop(); onDone() }
  // The box in place finishes once: Enter, then its leaving (a blur), would otherwise add a step twice.
  const doneOnce = () => { if (finished.current) return; finished.current = true; done() }

  if (device && inPlace) {
    // Typed right where it was pressed: Enter or a click elsewhere keeps it, Esc too.
    return createPortal(
      <input
        aria-label="Type here"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onCancel) { e.preventDefault(); finished.current = true; onCancel(); return }
          if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); doneOnce() }
        }}
        onBlur={doneOnce}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        className="fixed z-50 box-border rounded-[10px] border-2 border-solid border-wall-brass-ink bg-wall-on-pigment px-[12px] text-wall-ink shadow-[0_8px_24px] shadow-wall-ink/20 outline-none"
        style={{ left: inPlace.left, top: inPlace.top, width: inPlace.width, height: inPlace.height, fontSize: inPlace.fontSize, fontFamily: inPlace.fontFamily, fontWeight: inPlace.fontWeight }}
      />,
      document.body,
    )
  }

  if (device) {
    return (
      <section aria-label="Keyboard" className="absolute bottom-0 left-0 z-20 flex h-[124px] w-[1920px] items-center gap-[16px] rounded-t-[24px] bg-wall-night-ground px-[44px] font-body" onClick={(event) => event.stopPropagation()}>
        <input aria-label="Type here" autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={listening ? 'Say it…' : 'Type here · Enter when done'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); done() } }}
          className="h-[72px] min-w-0 flex-1 rounded-[14px] border-2 border-solid border-wall-night-brass bg-wall-on-pigment px-[20px] text-wall-date text-wall-ink" />
        <button type="button" aria-label={listening ? 'Stop listening' : 'Say it'} aria-pressed={listening} onClick={mic}
          className={`flex h-[72px] w-[182px] shrink-0 items-center justify-center gap-[10px] rounded-[12px] text-wall-body font-semibold ${listening ? 'bg-wall-night-brass text-wall-ink' : 'border-2 border-solid border-wall-night-brass bg-transparent text-wall-night-brass'}`}>
          <Mic size={26} aria-hidden="true" />
          {listening ? 'Listening' : 'Say it'}
        </button>
        <button type="button" className="flex h-[72px] w-[160px] shrink-0 items-center justify-center rounded-[12px] bg-wall-on-pigment text-wall-body font-bold text-wall-ink" onClick={done}>Done</button>
      </section>
    )
  }

  return (
    <section
      aria-label="Keyboard"
      className="absolute bottom-0 left-0 z-20 flex h-[430px] w-[1920px] flex-col items-center gap-[12px] rounded-t-[32px] bg-wall-night-ground pb-[30px] pt-[34px] font-body"
      onClick={(event) => event.stopPropagation()}
    >
      {listening && !showsValue && (
        <div className="absolute bottom-[430px] left-0 flex h-[84px] w-[1920px] items-center gap-[24px] bg-wall-on-pigment px-[44px] text-wall-ink">
          <span className="shrink-0 text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">LISTENING</span>
          <span className="min-w-0 truncate font-display text-wall-date font-semibold">{value || 'Say it…'}<span className="text-wall-brass">|</span></span>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={row} className="flex gap-[10px]">
          {i === 2 && !symbols && (
            <button type="button" aria-label="Shift" aria-pressed={shift} className={`${WIDE_KEY} ${shift ? 'text-wall-night-brass' : ''}`} onClick={() => setShift((s) => !s)}>
              ⇧
            </button>
          )}
          {[...row].map((ch) => (
            <button key={ch} type="button" className={KEY} onClick={() => type(ch)}>
              {shift ? ch.toUpperCase() : ch}
            </button>
          ))}
          {i === 2 && (
            <button type="button" aria-label="Delete" className={WIDE_KEY} onClick={() => onChange(value.slice(0, -1))}>
              ⌫
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-[10px]">
        <button type="button" className={WIDE_KEY} onClick={() => setSymbols((s) => !s)}>
          {symbols ? 'ABC' : '123'}
        </button>
        <button type="button" className="flex h-[76px] w-[430px] shrink-0 items-center justify-center rounded-[12px] bg-wall-night-rule text-wall-body text-wall-night-ink-2" onClick={() => type(' ')}>
          space
        </button>
        <button type="button" aria-label={listening ? 'Stop listening' : 'Say it'} aria-pressed={listening} onClick={mic}
          className={`flex h-[76px] w-[182px] shrink-0 items-center justify-center gap-[10px] rounded-[12px] text-wall-body font-semibold ${listening ? 'bg-wall-night-brass text-wall-ink' : 'border-2 border-solid border-wall-night-brass bg-transparent text-wall-night-brass'}`}>
          <Mic size={26} aria-hidden="true" />
          {listening ? 'Listening' : 'Say it'}
        </button>
        <button type="button" className="flex h-[76px] w-[182px] shrink-0 items-center justify-center rounded-[12px] bg-wall-on-pigment text-wall-body font-bold text-wall-ink" onClick={() => { if (listening) void speech.stop(); onDone() }}>
          Done
        </button>
      </div>
    </section>
  )
}
