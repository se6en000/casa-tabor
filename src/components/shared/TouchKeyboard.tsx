import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowBigUp, ChevronLeft, ChevronRight, CornerDownLeft, Delete, Settings2, X } from 'lucide-react'

const MOBILE_BREAKPOINT = 1024
const VK_GAP = 18
const VK_BOTTOM_OFFSET = 12
const MIN_VK_HEIGHT = 240

type KeyboardMode = 'alpha' | 'num' | 'sym'
type KeyboardAlign = 'left' | 'center' | 'right'
type KeyboardSize = 'compact' | 'comfortable' | 'large'
type Handedness = 'left' | 'right'
type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement
type TouchKeyboardControlDetail = {
  target?: Element | null
  toggle?: boolean
  open?: boolean
  close?: boolean
}

const PREFS_KEY = 'casa-touch-keyboard-prefs-v1'

const ALPHA_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

const NUM_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
  ['.', ',', '?', '!', "'", '#', '%', '+', '='],
]

const SYM_ROWS = [
  ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='],
  ['_', '\\', '|', '~', '<', '>', 'EUR', 'GBP', 'JPY', 'USD'],
  ['.', ',', '?', '!', "'", '"', ':', ';', '@'],
]

function loadPrefs(): { size: KeyboardSize; handedness: Handedness; haptics: boolean; sound: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { size: 'comfortable', handedness: 'right', haptics: true, sound: true }
    const parsed = JSON.parse(raw) as Partial<{ size: KeyboardSize; handedness: Handedness; haptics: boolean; sound: boolean }>
    return {
      size: parsed.size === 'compact' || parsed.size === 'large' || parsed.size === 'comfortable' ? parsed.size : 'comfortable',
      handedness: parsed.handedness === 'left' || parsed.handedness === 'right' ? parsed.handedness : 'right',
      haptics: parsed.haptics ?? true,
      sound: parsed.sound ?? true,
    }
  } catch {
    return { size: 'comfortable', handedness: 'right', haptics: true, sound: true }
  }
}

function savePrefs(prefs: { size: KeyboardSize; handedness: Handedness; haptics: boolean; sound: boolean }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore storage failures.
  }
}

function isSupportedInput(el: HTMLInputElement) {
  const type = (el.type || 'text').toLowerCase()
  const unsupported = new Set([
    'hidden',
    'password',
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

function isAutoOpenExcluded(el: Element | null): boolean {
  return !!(el instanceof HTMLElement && el.closest('[data-touch-keyboard="ignore"]'))
}

function emitInput(el: HTMLElement) {
  el.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

function emitKey(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }))
  el.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }))
}

function getInputType(el: EditableTarget | null) {
  if (!el) return 'text'
  if (el instanceof HTMLInputElement) return (el.type || 'text').toLowerCase()
  return 'text'
}

function modeForTarget(el: EditableTarget | null): KeyboardMode {
  const type = getInputType(el)
  if (type === 'number' || type === 'tel') return 'num'
  return 'alpha'
}

function getFieldLabel(el: EditableTarget | null) {
  if (!el) return 'Input'
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const fromAria = el.getAttribute('aria-label')
    if (fromAria) return fromAria
    if (el.labels && el.labels[0]?.textContent?.trim()) return el.labels[0].textContent.trim()
    if (el.placeholder) return el.placeholder
    if (el.name) return el.name
    if (el.id) return el.id
  }
  const fromAttr = el.getAttribute('aria-label') ?? el.getAttribute('data-label')
  return fromAttr || 'Input'
}

function focusables(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>('input, textarea, select, [contenteditable="true"]'))
  return all.filter((el) => {
    if (!el.getClientRects().length) return false
    if (el instanceof HTMLInputElement) return !el.disabled && !el.readOnly && el.type !== 'hidden'
    if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly
    if (el instanceof HTMLSelectElement) return !el.disabled
    return el.isContentEditable
  })
}

function normalizeForType(text: string, target: EditableTarget | null): string {
  const type = getInputType(target)
  if (type === 'number') {
    return text.replace(/[^0-9.\-]/g, '')
  }
  if (type === 'tel') {
    return text.replace(/[^0-9+\-() ]/g, '')
  }
  return text
}

function nextSize(size: KeyboardSize): KeyboardSize {
  if (size === 'compact') return 'comfortable'
  if (size === 'comfortable') return 'large'
  return 'compact'
}

function canUseRangeText(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  const type = (el.type || 'text').toLowerCase()
  return ['text', 'search', 'url', 'tel', 'password'].includes(type)
}

function spliceValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  mode: 'insert' | 'backspace'
) {
  const value = el.value
  const start = typeof el.selectionStart === 'number' ? el.selectionStart : value.length
  const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : value.length

  let nextValue = value
  let caret = start

  if (mode === 'insert') {
    nextValue = value.slice(0, start) + text + value.slice(end)
    caret = start + text.length
  } else if (start !== end) {
    nextValue = value.slice(0, start) + value.slice(end)
    caret = start
  } else if (start > 0) {
    nextValue = value.slice(0, start - 1) + value.slice(end)
    caret = start - 1
  }

  el.value = nextValue
  try {
    el.setSelectionRange(caret, caret)
  } catch {
    // Some input types (e.g. number) do not support selection APIs.
  }
}

export default function TouchKeyboard() {
  const [enabled, setEnabled] = useState(false)
  const [visible, setVisible] = useState(false)
  const [shift, setShift] = useState(false)
  const [mode, setMode] = useState<KeyboardMode>('alpha')
  const [align, setAlign] = useState<KeyboardAlign>('center')
  const [target, setTarget] = useState<EditableTarget | null>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(MIN_VK_HEIGHT)
  const [occupiedHeight, setOccupiedHeight] = useState(MIN_VK_HEIGHT + VK_BOTTOM_OFFSET)
  const [size, setSize] = useState<KeyboardSize>('comfortable')
  const [handedness, setHandedness] = useState<Handedness>('right')
  const [haptics, setHaptics] = useState(true)
  const [sound, setSound] = useState(true)
  const [showPrefs, setShowPrefs] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerIntentAtRef = useRef(0)
  const pointerIntentElRef = useRef<EditableTarget | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const prefs = loadPrefs()
    setSize(prefs.size)
    setHandedness(prefs.handedness)
    setHaptics(prefs.haptics)
    setSound(prefs.sound)
  }, [])

  useEffect(() => {
    savePrefs({ size, handedness, haptics, sound })
  }, [size, handedness, haptics, sound])

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

    const handlePointerDown = (e: PointerEvent) => {
      const next = e.target
      if (!(next instanceof Element) || !isEditableElement(next)) {
        pointerIntentAtRef.current = 0
        pointerIntentElRef.current = null
        return
      }
      pointerIntentAtRef.current = Date.now()
      pointerIntentElRef.current = next
    }

    const handleFocusIn = (e: FocusEvent) => {
      const next = e.target
      if (!(next instanceof Element) || !isEditableElement(next)) return
      const pointerIsRecent = Date.now() - pointerIntentAtRef.current < 900
      const pointerMatchesField = pointerIntentElRef.current === next
      const canAutoOpen = !isAutoOpenExcluded(next)
      const shouldOpen = visible || (canAutoOpen && (pointerIsRecent && pointerMatchesField || !pointerIsRecent))
      setTarget(next)
      setMode(modeForTarget(next))
      if (shouldOpen) setVisible(true)
      setShift(false)
      pointerIntentAtRef.current = 0
      pointerIntentElRef.current = null
    }

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement
        if (active && rootRef.current?.contains(active)) return
        if (active instanceof Element && isEditableElement(active)) {
          setTarget(active)
          return
        }
        setVisible(false)
        setTarget(null)
        setShift(false)
      }, 0)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [enabled, visible])

  useEffect(() => {
    if (!enabled) return

    const resolveTarget = (candidate: Element | null | undefined): EditableTarget | null => {
      if (candidate && isEditableElement(candidate)) return candidate
      const active = document.activeElement
      return active && isEditableElement(active) ? active : null
    }

    const handleControl = (evt: Event) => {
      const detail = (evt as CustomEvent<TouchKeyboardControlDetail>).detail ?? {}
      if (detail.close) {
        hideKeyboard()
        return
      }
      const nextTarget = resolveTarget(detail.target ?? null)
      if (!nextTarget) return
      if (detail.toggle && visible && target === nextTarget) {
        hideKeyboard()
        return
      }
      nextTarget.focus()
      setTarget(nextTarget)
      setMode(modeForTarget(nextTarget))
      setShift(false)
      if (detail.toggle || detail.open) setVisible(true)
    }

    document.addEventListener('touch-keyboard:control', handleControl as EventListener)
    return () => document.removeEventListener('touch-keyboard:control', handleControl as EventListener)
  }, [enabled, visible, target])

  const keyboardWidthPx = useMemo(() => {
    const vw = window.innerWidth || 1280
    const ratio = size === 'compact' ? 0.45 : size === 'large' ? 0.58 : 0.52
    return Math.round(Math.max(520, Math.min(vw * ratio, 980)))
  }, [size])

  useEffect(() => {
    if (!target || !visible || !enabled) return
    const rect = target.getBoundingClientRect()
    const keyboardTop = window.innerHeight - keyboardHeight - VK_BOTTOM_OFFSET

    // If field is low, bias the keyboard away from it horizontally.
    if (rect.bottom > keyboardTop - 16) {
      if (rect.left < window.innerWidth / 3) setAlign('right')
      else if (rect.right > (window.innerWidth * 2) / 3) setAlign('left')
      else setAlign(handedness === 'left' ? 'left' : 'right')
      return
    }

    setAlign(handedness === 'left' ? 'left' : handedness === 'right' ? 'right' : 'center')
  }, [target, visible, enabled, keyboardHeight, handedness, keyboardWidthPx])

  useEffect(() => {
    const root = document.documentElement
    if (enabled && visible) {
      root.style.setProperty('--vk-height', `${occupiedHeight}px`)
      root.style.setProperty('--vk-gap', `${VK_GAP}px`)
    } else {
      root.style.setProperty('--vk-height', '0px')
      root.style.setProperty('--vk-gap', '0px')
    }
    return () => {
      root.style.setProperty('--vk-height', '0px')
      root.style.setProperty('--vk-gap', '0px')
    }
  }, [enabled, visible, occupiedHeight])

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

  useEffect(() => {
    if (!enabled || !visible) return
    const measure = () => {
      const contentHeight = rootRef.current?.offsetHeight ?? keyboardHeight
      setOccupiedHeight(contentHeight + VK_BOTTOM_OFFSET)
    }
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [enabled, visible, keyboardHeight, mode, size, shift, align])

  const rows = useMemo(() => {
    if (mode === 'num') return NUM_ROWS
    if (mode === 'sym') return SYM_ROWS
    return ALPHA_ROWS.map(row => row.map(k => (shift ? k.toUpperCase() : k)))
  }, [mode, shift])

  function tapFeedback() {
    if (haptics) {
      try { navigator.vibrate?.(8) } catch { /* ignore */ }
    }
    if (!sound) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = 820
      gain.gain.value = 0.01
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.03)
    } catch {
      // Ignore audio failures.
    }
  }

  function withTarget(action: (el: EditableTarget) => void) {
    if (!target) return
    target.focus()
    action(target)
  }

  function insertText(rawText: string) {
    tapFeedback()
    const text = normalizeForType(rawText, target)
    if (!text) return
    withTarget((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (canUseRangeText(el)) {
          const start = el.selectionStart ?? el.value.length
          const end = el.selectionEnd ?? el.value.length
          el.setRangeText(text, start, end, 'end')
        } else {
          spliceValue(el, text, 'insert')
        }
        emitInput(el)
      } else {
        document.execCommand('insertText', false, text)
        emitInput(el)
      }
    })
    if (shift && mode === 'alpha') setShift(false)
  }

  function handleBackspace() {
    tapFeedback()
    withTarget((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (canUseRangeText(el)) {
          const start = el.selectionStart ?? el.value.length
          const end = el.selectionEnd ?? el.value.length
          if (start !== end) el.setRangeText('', start, end, 'end')
          else if (start > 0) el.setRangeText('', start - 1, start, 'end')
        } else {
          spliceValue(el, '', 'backspace')
        }
        emitInput(el)
      } else {
        emitKey(el, 'Backspace')
      }
    })
  }

  function moveFocusBy(step: number) {
    tapFeedback()
    const nodes = focusables()
    if (nodes.length === 0) return
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const current = active ? nodes.indexOf(active) : (target ? nodes.indexOf(target) : -1)
    const next = current === -1 ? 0 : (current + step + nodes.length) % nodes.length
    nodes[next]?.focus()
  }

  function handleEnter() {
    tapFeedback()
    withTarget((el) => {
      emitKey(el, 'Enter')
      if (el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        el.setRangeText('\n', start, end, 'end')
        emitInput(el)
      } else if (el instanceof HTMLInputElement) {
        if (!el.checkValidity()) {
          el.reportValidity()
          return
        }
        const form = el.form
        if (form?.requestSubmit) form.requestSubmit()
      } else if (el.isContentEditable) {
        document.execCommand('insertLineBreak')
      }
    })
  }

  function hideKeyboard() {
    if (target) target.blur()
    setVisible(false)
    setTarget(null)
    setShift(false)
  }

  if (!enabled) return null

  const cardLeft = align === 'center'
    ? `calc(50% - ${keyboardWidthPx / 2}px)`
    : align === 'left'
      ? 'max(18px, calc(50% - 44vw))'
      : `min(calc(100% - ${keyboardWidthPx}px - 18px), calc(50% + 6vw))`

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={rootRef}
          initial={{ y: '110%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '110%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 250 }}
          className="fixed z-[85] border border-casa-border bg-casa-surface/98 backdrop-blur-sm shadow-modal overflow-y-auto rounded-2xl"
          style={{
            maxHeight: `${keyboardHeight}px`,
            width: `${keyboardWidthPx}px`,
            bottom: `${VK_BOTTOM_OFFSET}px`,
            left: cardLeft,
          }}
        >
          <div className="h-full px-3 pt-2 pb-3 flex flex-col gap-2 select-none">
            {/* Slim header: field label · field nav · settings · close */}
            <div className="flex items-center gap-1.5">
              <p className="flex-1 text-body-sm font-semibold text-casa-muted truncate">
                {getFieldLabel(target)}
              </p>
              <button onClick={() => moveFocusBy(-1)} aria-label="Previous field" className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-casa-gold">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => moveFocusBy(1)} aria-label="Next field" className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-casa-gold">
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setShowPrefs(v => !v)}
                aria-label="Keyboard settings"
                aria-pressed={showPrefs}
                className={`size-control rounded-button border flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-casa-gold ${showPrefs ? 'bg-casa-gold/20 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-muted'}`}
              >
                <Settings2 size={15} />
              </button>
              <button onClick={hideKeyboard} aria-label="Hide keyboard" className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-muted flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-casa-gold">
                <X size={14} />
              </button>
            </div>

            {/* Collapsible preferences strip (set-once options live here) */}
            <AnimatePresence initial={false}>
              {showPrefs && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                    <button onClick={() => setSize(nextSize(size))} className="rounded-pill bg-casa-bg border border-casa-border px-3 py-1.5 text-caption font-semibold text-casa-muted capitalize">
                      Size · {size}
                    </button>
                    <button onClick={() => setHandedness(v => (v === 'left' ? 'right' : 'left'))} className="rounded-pill bg-casa-bg border border-casa-border px-3 py-1.5 text-caption font-semibold text-casa-muted">
                      {handedness === 'left' ? 'Left hand' : 'Right hand'}
                    </button>
                    <button onClick={() => setHaptics(v => !v)} className="rounded-pill bg-casa-bg border border-casa-border px-3 py-1.5 text-caption font-semibold text-casa-muted">
                      Haptic {haptics ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => setSound(v => !v)} className="rounded-pill bg-casa-bg border border-casa-border px-3 py-1.5 text-caption font-semibold text-casa-muted">
                      Sound {sound ? 'On' : 'Off'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mode segmented control */}
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => setMode('alpha')} className={`rounded-button border font-semibold ${mode === 'alpha' ? 'bg-casa-gold/20 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-navy'}`} style={{ height: '36px', fontSize: '13px' }}>
                ABC
              </button>
              <button onClick={() => setMode('num')} className={`rounded-button border font-semibold ${mode === 'num' ? 'bg-casa-gold/20 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-navy'}`} style={{ height: '36px', fontSize: '13px' }}>
                123
              </button>
              <button onClick={() => setMode('sym')} className={`rounded-button border font-semibold ${mode === 'sym' ? 'bg-casa-gold/20 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-navy'}`} style={{ height: '36px', fontSize: '13px' }}>
                #+=
              </button>
            </div>

            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                {row.map((k) => (
                  <button
                    key={k}
                    onClick={() => insertText(k)}
                    className="rounded-button bg-casa-bg border border-casa-border text-casa-navy font-semibold active:scale-95 transition-transform"
                    style={{ height: '40px', fontSize: '17px', lineHeight: 1 }}
                  >
                    {k}
                  </button>
                ))}
              </div>
            ))}

            {/* Bottom action row — backspace + enter sit on the dominant hand */}
            <div className="grid grid-cols-12 gap-1.5">
              {handedness === 'right' ? (
                <>
                  <button
                    onClick={() => { tapFeedback(); setShift(v => !v) }}
                    className={`col-span-2 rounded-button border text-casa-navy flex items-center justify-center ${shift ? 'bg-casa-gold/20 border-casa-gold' : 'bg-casa-bg border-casa-border'}`}
                    style={{ height: '40px' }}
                    aria-label="Shift"
                  >
                    <ArrowBigUp size={18} />
                  </button>
                  <button
                    onClick={() => insertText(' ')}
                    className="col-span-6 rounded-button bg-casa-bg border border-casa-border text-casa-navy font-semibold"
                    style={{ height: '40px', fontSize: '13px' }}
                  >
                    Space
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="col-span-2 rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center"
                    style={{ height: '40px' }}
                    aria-label="Backspace"
                  >
                    <Delete size={18} />
                  </button>
                  <button
                    onClick={handleEnter}
                    className="col-span-2 rounded-button bg-casa-navy text-white border border-casa-navy flex items-center justify-center"
                    style={{ height: '40px' }}
                    aria-label="Enter"
                  >
                    <CornerDownLeft size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleEnter}
                    className="col-span-2 rounded-button bg-casa-navy text-white border border-casa-navy flex items-center justify-center"
                    style={{ height: '40px' }}
                    aria-label="Enter"
                  >
                    <CornerDownLeft size={16} />
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="col-span-2 rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center"
                    style={{ height: '40px' }}
                    aria-label="Backspace"
                  >
                    <Delete size={18} />
                  </button>
                  <button
                    onClick={() => insertText(' ')}
                    className="col-span-6 rounded-button bg-casa-bg border border-casa-border text-casa-navy font-semibold"
                    style={{ height: '40px', fontSize: '13px' }}
                  >
                    Space
                  </button>
                  <button
                    onClick={() => { tapFeedback(); setShift(v => !v) }}
                    className={`col-span-2 rounded-button border text-casa-navy flex items-center justify-center ${shift ? 'bg-casa-gold/20 border-casa-gold' : 'bg-casa-bg border-casa-border'}`}
                    style={{ height: '40px' }}
                    aria-label="Shift"
                  >
                    <ArrowBigUp size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
