import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowBigUp, CornerDownLeft, Delete, MoveHorizontal, X } from 'lucide-react'

const MIN_VK_HEIGHT = 240
const VK_GAP = 18
const VK_BOTTOM_OFFSET = 12
const MOBILE_BREAKPOINT = 1024
const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]
const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

function isSupportedInput(el: HTMLInputElement) {
  const type = (el.type || 'text').toLowerCase()
  const unsupported = new Set([
    'hidden',
    'checkbox',
    'radio',
    'range',
    'file',
    'color',
    'date',
    'datetime-local',
    'month',
    'time',
    'week',
    'button',
    'submit',
    'reset',
    'image',
  ])
  return !unsupported.has(type)
}

function isEditableElement(el: Element | null): el is EditableTarget {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement) return !el.disabled && !el.readOnly && isSupportedInput(el)
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly
  return el.isContentEditable
}

function emitInput(el: HTMLElement) {
  el.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

function emitKey(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }))
  el.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }))
}

function focusables(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>('input, textarea, [contenteditable="true"]'))
  return all.filter(el => {
    if (!isEditableElement(el)) return false
    if (!el.getClientRects().length) return false
    return true
  })
}

export default function TouchKeyboard() {
  const [enabled, setEnabled] = useState(false)
  const [visible, setVisible] = useState(false)
  const [shift, setShift] = useState(false)
  const [target, setTarget] = useState<EditableTarget | null>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(MIN_VK_HEIGHT)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateEnabled = () => {
      const touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
      const mobileViewport = window.innerWidth < MOBILE_BREAKPOINT
      setEnabled(touchCapable && !mobileViewport)
    }
    updateEnabled()
    window.addEventListener('resize', updateEnabled)
    return () => window.removeEventListener('resize', updateEnabled)
  }, [])

  useEffect(() => {
    if (!enabled) return

    const handleFocusIn = (e: FocusEvent) => {
      const next = e.target
      if (!(next instanceof Element)) return
      if (!isEditableElement(next)) return
      setTarget(next)
      setVisible(true)
    }

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement
        if (active && rootRef.current?.contains(active)) return
        if (active instanceof Element && isEditableElement(active)) {
          setTarget(active)
          setVisible(true)
          return
        }
        setVisible(false)
        setTarget(null)
        setShift(false)
      }, 0)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [enabled])

  useEffect(() => {
    const root = document.documentElement
    if (enabled && visible) {
      root.style.setProperty('--vk-height', `${keyboardHeight + VK_BOTTOM_OFFSET}px`)
      root.style.setProperty('--vk-gap', `${VK_GAP}px`)
    } else {
      root.style.setProperty('--vk-height', '0px')
      root.style.setProperty('--vk-gap', '0px')
    }
    return () => {
      root.style.setProperty('--vk-height', '0px')
      root.style.setProperty('--vk-gap', '0px')
    }
  }, [enabled, visible, keyboardHeight])

  useEffect(() => {
    const vv = window.visualViewport
    const updateSize = () => {
      const vh = vv?.height ?? window.innerHeight
      const next = Math.max(MIN_VK_HEIGHT, Math.round(vh * 0.5))
      setKeyboardHeight(next)
    }
    updateSize()
    vv?.addEventListener('resize', updateSize)
    window.addEventListener('resize', updateSize)
    return () => {
      vv?.removeEventListener('resize', updateSize)
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  const rows = useMemo(() => {
    const mappedLetters = LETTER_ROWS.map(row => row.map(k => (shift ? k.toUpperCase() : k)))
    return [NUMBER_ROW, ...mappedLetters]
  }, [shift])

  function withTarget(action: (el: EditableTarget) => void) {
    if (!target) return
    target.focus()
    action(target)
  }

  function insertText(text: string) {
    withTarget((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        el.setRangeText(text, start, end, 'end')
        emitInput(el)
      } else {
        document.execCommand('insertText', false, text)
        emitInput(el)
      }
    })
    if (shift) setShift(false)
  }

  function handleBackspace() {
    withTarget((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        if (start !== end) {
          el.setRangeText('', start, end, 'end')
        } else if (start > 0) {
          el.setRangeText('', start - 1, start, 'end')
        }
        emitInput(el)
      } else {
        emitKey(el, 'Backspace')
      }
    })
  }

  function handleEnter() {
    withTarget((el) => {
      emitKey(el, 'Enter')
      if (el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        el.setRangeText('\n', start, end, 'end')
        emitInput(el)
      } else if (el.isContentEditable) {
        document.execCommand('insertLineBreak')
      }
    })
  }

  function moveFocusBy(step: number) {
    const nodes = focusables()
    if (nodes.length === 0) return
    const current = target ? nodes.indexOf(target) : -1
    const next = current === -1 ? 0 : (current + step + nodes.length) % nodes.length
    nodes[next]?.focus()
  }

  function hideKeyboard() {
    if (target) target.blur()
    setVisible(false)
    setTarget(null)
    setShift(false)
  }

  if (!enabled) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={rootRef}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 250 }}
          className="fixed left-0 right-0 z-[85] border-t border-casa-border bg-casa-surface/98 backdrop-blur-sm shadow-modal overflow-y-auto"
          style={{ height: `${keyboardHeight}px`, bottom: `${VK_BOTTOM_OFFSET}px` }}
        >
          <div className="h-full px-3 pt-2 pb-3 flex flex-col gap-2 select-none">
            <div className="flex justify-end">
              <button
                onClick={hideKeyboard}
                className="rounded-pill bg-casa-bg border border-casa-border text-casa-muted font-semibold flex items-center gap-1"
                style={{ height: '34px', paddingInline: '12px', fontSize: '12px' }}
              >
                <X size={12} />
                Hide
              </button>
            </div>

            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                {row.map((k) => (
                  <button
                    key={k}
                    onClick={() => insertText(k)}
                    className="rounded-button bg-casa-bg border border-casa-border text-casa-navy font-semibold active:scale-95 transition-transform"
                    style={{ height: '42px', fontSize: '18px', lineHeight: 1 }}
                  >
                    {k}
                  </button>
                ))}
              </div>
            ))}

            <div className="grid grid-cols-12 gap-1.5">
              <button
                onClick={() => setShift(v => !v)}
                className={`col-span-2 rounded-button border text-casa-navy flex items-center justify-center ${shift ? 'bg-casa-gold/20 border-casa-gold' : 'bg-casa-bg border-casa-border'}`}
                style={{ height: '42px' }}
                aria-label="Shift"
              >
                <ArrowBigUp size={18} />
              </button>
              <button
                onClick={handleBackspace}
                className="col-span-2 rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center"
                style={{ height: '42px' }}
                aria-label="Backspace"
              >
                <Delete size={18} />
              </button>
              <button
                onClick={() => moveFocusBy(shift ? -1 : 1)}
                className="col-span-2 rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center gap-1 font-semibold"
                style={{ height: '42px', fontSize: '14px' }}
                aria-label="Tab"
              >
                <MoveHorizontal size={16} />
                Tab
              </button>
              <button
                onClick={() => insertText(' ')}
                className="col-span-4 rounded-button bg-casa-bg border border-casa-border text-casa-navy font-semibold"
                style={{ height: '42px', fontSize: '14px' }}
              >
                Space
              </button>
              <button
                onClick={handleEnter}
                className="col-span-2 rounded-button bg-casa-navy text-white border border-casa-navy flex items-center justify-center"
                style={{ height: '42px' }}
                aria-label="Enter"
              >
                <CornerDownLeft size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
