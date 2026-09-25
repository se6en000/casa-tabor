import { useState } from 'react'

// The wall keyboard (board 03e): full width along the bottom, finger-sized keys.
// The kiosk has no physical keyboard; a desktop one still types into the field.

const LETTER_ROWS = ['qwertyuiop', "asdfghjkl'", 'zxcvbnm']
const SYMBOL_ROWS = ['1234567890', '-/:;()$&@"', '.,?!#+=']
const KEY = 'flex h-[76px] w-[118px] shrink-0 items-center justify-center rounded-[12px] bg-wall-night-rule text-wall-date text-wall-night-ink'
const WIDE_KEY = 'flex h-[76px] w-[182px] shrink-0 items-center justify-center rounded-[12px] bg-wall-night-stone text-wall-heading text-wall-night-ink'

export interface WallKeyboardProps {
  value: string
  onChange: (value: string) => void
  onDone: () => void
}

export default function WallKeyboard({ value, onChange, onDone }: WallKeyboardProps) {
  const [shift, setShift] = useState(value.length === 0)
  const [symbols, setSymbols] = useState(false)
  const type = (text: string) => {
    onChange(value + (shift ? text.toUpperCase() : text))
    setShift(false)
  }
  const rows = symbols ? SYMBOL_ROWS : LETTER_ROWS

  return (
    <section
      aria-label="Keyboard"
      className="absolute bottom-0 left-0 z-20 flex h-[430px] w-[1920px] flex-col items-center gap-[12px] rounded-t-[32px] bg-wall-night-ground pb-[30px] pt-[34px] font-body"
      onClick={(event) => event.stopPropagation()}
    >
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
        <button type="button" className="flex h-[76px] w-[620px] shrink-0 items-center justify-center rounded-[12px] bg-wall-night-rule text-wall-body text-wall-night-ink-2" onClick={() => type(' ')}>
          space
        </button>
        <button type="button" className="flex h-[76px] w-[182px] shrink-0 items-center justify-center rounded-[12px] bg-wall-on-pigment text-wall-body font-bold text-wall-ink" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  )
}
