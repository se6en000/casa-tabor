import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowBigUp, ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft, Delete, Mic, MicOff, Settings2, Sparkles } from 'lucide-react'
import { useFieldDictation } from '../../hooks/useFieldDictation'

const MOBILE_BREAKPOINT = 1024
const VK_GAP = 18
const VK_BOTTOM_OFFSET = 12
const MIN_VK_HEIGHT = 260

type KeyboardMode = 'alpha' | 'num' | 'sym' | 'numpad'
type KeyboardSize = 'compact' | 'comfortable' | 'large'
type Handedness = 'left' | 'center' | 'right'
type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

type TouchKeyboardControlDetail = {
  target?: Element | null
  toggle?: boolean
  open?: boolean
  close?: boolean
}

const PREFS_KEY = 'casa-touch-keyboard-prefs-v2'

/**
 * Ensures that tapping anywhere inside the keyboard does not steal focus
 * or trigger unexpected blur/focusout on the active input field.
 */
function preserveEditableFocus(event: ReactPointerEvent<HTMLDivElement>) {
  const pressedElement = event.target
  if (pressedElement instanceof Element && pressedElement.closest('button')) {
    event.preventDefault()
  }
}

// ── Standard QWERTY Layout Rows ──────────────────────────────────────────────
const QWERTY_ROW_1 = [
  { key: 'q', alt: '1' },
  { key: 'w', alt: '2' },
  { key: 'e', alt: '3' },
  { key: 'r', alt: '4' },
  { key: 't', alt: '5' },
  { key: 'y', alt: '6' },
  { key: 'u', alt: '7' },
  { key: 'i', alt: '8' },
  { key: 'o', alt: '9' },
  { key: 'p', alt: '0' },
]

const QWERTY_ROW_2 = [
  { key: 'a', alt: '@' },
  { key: 's', alt: '#' },
  { key: 'd', alt: '$' },
  { key: 'f', alt: '%' },
  { key: 'g', alt: '&' },
  { key: 'h', alt: '*' },
  { key: 'j', alt: '-' },
  { key: 'k', alt: '+' },
  { key: 'l', alt: '=' },
]

const QWERTY_ROW_3 = [
  { key: 'z', alt: '(' },
  { key: 'x', alt: ')' },
  { key: 'c', alt: ':' },
  { key: 'v', alt: ';' },
  { key: 'b', alt: '!' },
  { key: 'n', alt: '?' },
  { key: 'm', alt: '/' },
]

// ── Symbols and Number Rows ──────────────────────────────────────────────────
const NUM_ROW_1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const NUM_ROW_2 = ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"']
const NUM_ROW_3 = ['.', ',', '?', '!', "'", '#', '%', '+', '=']

const SYM_ROW_1 = ['[', ']', '{', '}', '#', '%', '^', '*', '+', '=']
const SYM_ROW_2 = ['_', '\\', '|', '~', '<', '>', '€', '£', '¥', '$']
const SYM_ROW_3 = ['.', ',', '?', '!', "'", '"', ':', ';', '@']

// ── 3×4 Numeric Keypad Rows ──────────────────────────────────────────────────
const NUMPAD_GRID = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
]

// ── Contextual Predictive Vocabulary ─────────────────────────────────────────
const FAMILY_SUGGESTIONS = ['Kelly', 'Giselle', 'Jake', 'Owen']
const CALENDAR_SUGGESTIONS = ['Meeting', 'Practice', 'Dinner', 'Doctor', 'Flight', 'School', 'Pick up', 'Drop off', 'Birthday', 'Dentist', 'Game', 'Party', 'Lunch', 'Breakfast', 'Coffee', 'Gym', 'Workout', 'Call', 'Review']
const GROCERY_SUGGESTIONS = ['Milk', 'Eggs', 'Bread', 'Butter', 'Coffee', 'Bananas', 'Apples', 'Chicken', 'Cheese', 'Yogurt', 'Olive Oil', 'Avocado', 'Tomatoes', 'Onions', 'Garlic', 'Rice', 'Pasta', 'Salmon', 'Spinach', 'Lemons']
const COMMON_WORDS = ['the', 'and', 'for', 'with', 'today', 'tomorrow', 'tonight', 'morning', 'afternoon', 'evening', 'at', 'in', 'on', 'urgent', 'reminder', 'schedule', 'buy', 'need', 'order', 'prep', 'make']

const ALL_DICTIONARY = Array.from(new Set([...FAMILY_SUGGESTIONS, ...CALENDAR_SUGGESTIONS, ...GROCERY_SUGGESTIONS, ...COMMON_WORDS]))

function loadPrefs(): { size: KeyboardSize; handedness: Handedness; haptics: boolean; sound: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { size: 'comfortable', handedness: 'center', haptics: true, sound: true }
    const parsed = JSON.parse(raw) as Partial<{ size: KeyboardSize; handedness: Handedness; haptics: boolean; sound: boolean }>
    return {
      size: parsed.size === 'compact' || parsed.size === 'large' || parsed.size === 'comfortable' ? parsed.size : 'comfortable',
      handedness: parsed.handedness === 'left' || parsed.handedness === 'right' || parsed.handedness === 'center' ? parsed.handedness : 'center',
      haptics: parsed.haptics ?? true,
      sound: parsed.sound ?? true,
    }
  } catch {
    return { size: 'comfortable', handedness: 'center', haptics: true, sound: true }
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
  if (type === 'number' || type === 'tel') return 'numpad'
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

function getTargetValue(el: EditableTarget | null): string {
  if (!el) return ''
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value || ''
  }
  return el.textContent || ''
}

function getCaretPosition(el: EditableTarget | null): number {
  if (!el) return 0
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length
  }
  return 0
}

function getCurrentWordPrefix(value: string, caret: number): string {
  if (!value || caret <= 0) return ''
  const beforeCaret = value.slice(0, caret)
  const match = beforeCaret.match(/(\w+)$/)
  return match ? match[1] : ''
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
  const [capsLock, setCapsLock] = useState(false)
  const [mode, setMode] = useState<KeyboardMode>('alpha')
  const [target, setTarget] = useState<EditableTarget | null>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(MIN_VK_HEIGHT)
  const [occupiedHeight, setOccupiedHeight] = useState(MIN_VK_HEIGHT + VK_BOTTOM_OFFSET)
  const [size, setSize] = useState<KeyboardSize>('comfortable')
  const [handedness, setHandedness] = useState<Handedness>('center')
  const [haptics, setHaptics] = useState(true)
  const [sound, setSound] = useState(true)
  const [showPrefs, setShowPrefs] = useState(false)
  const [targetValueState, setTargetValueState] = useState('')
  const [caretPosState, setCaretPosState] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const backspaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backspaceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const backspaceStartXRef = useRef<number | null>(null)
  const longPressAltTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastShiftTapRef = useRef<number>(0)
  const spaceDragStartXRef = useRef<number | null>(null)
  const spaceDragCaretStartRef = useRef<number>(0)

  // ── Voice Dictation Integration ───────────────────────────────────────────
  const handleDictationText = useCallback((text: string) => {
    if (!target) return
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.value = text
      emitInput(target)
      setTargetValueState(text)
      setCaretPosState(text.length)
    }
  }, [target])

  const dictation = useFieldDictation({
    onText: handleDictationText,
    onFinal: handleDictationText,
  })

  // Sync active target value to trigger suggestions
  const syncTargetState = useCallback((el: EditableTarget | null = target) => {
    if (!el) {
      setTargetValueState('')
      setCaretPosState(0)
      return
    }
    setTargetValueState(getTargetValue(el))
    setCaretPosState(getCaretPosition(el))
  }, [target])

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

  // Screen / viewport detection
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

  // ── Acoustic Tactile Sound Engine (Web Audio API) ───────────────────────────
  const playAcousticTap = useCallback((kind: 'key' | 'action' | 'delete' | 'scrub' = 'key') => {
    if (haptics) {
      try {
        if (kind === 'delete') navigator.vibrate?.(10)
        else if (kind === 'action') navigator.vibrate?.(12)
        else if (kind === 'scrub') navigator.vibrate?.(4)
        else navigator.vibrate?.(6)
      } catch {
        // Ignore haptic failures.
      }
    }

    if (!sound) return

    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) audioCtxRef.current = new AudioCtx()
      }
      const ctx = audioCtxRef.current
      if (!ctx || ctx.state === 'suspended') {
        void ctx?.resume?.()
      }
      if (!ctx) return

      const now = ctx.currentTime

      if (kind === 'scrub') {
        // High-frequency, ultra-short tick (950Hz)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(950, now)
        gain.gain.setValueAtTime(0.015, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.008)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.01)
        return
      }

      if (kind === 'action') {
        // Warm resonant body thump (120Hz -> 60Hz)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(140, now)
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.04)
        gain.gain.setValueAtTime(0.035, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.045)
        return
      }

      if (kind === 'delete') {
        // Crisp soft snap (220Hz -> 130Hz)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(220, now)
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.025)
        gain.gain.setValueAtTime(0.025, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.03)
        return
      }

      // Standard Key: Dual-layer warm wooden acoustic click
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(200, now)
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.022)
      gain.gain.setValueAtTime(0.028, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.025)
    } catch {
      // Ignore audio synthesis errors.
    }
  }, [haptics, sound])

  // ── Auto-scroll occluded inputs into view ──────────────────────────────────
  const scrollIntoViewIfNeeded = useCallback((el: EditableTarget | null) => {
    if (!el || !(el instanceof HTMLElement)) return
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const kbTop = window.innerHeight - occupiedHeight - 20
      if (rect.bottom > kbTop) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }, [occupiedHeight])

  // ── Focus & Target Session Management ─────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const handleFocusIn = (e: FocusEvent) => {
      const next = e.target
      if (!(next instanceof Element) || !isEditableElement(next)) return
      if (isAutoOpenExcluded(next)) return

      setTarget(next)
      setMode(modeForTarget(next))
      setVisible(true)
      setShift(false)
      setCapsLock(false)
      syncTargetState(next)
      scrollIntoViewIfNeeded(next)
    }

    const handleFocusOut = () => {
      // Grace period to allow intra-keyboard or intra-field clicks without abruptly collapsing
      setTimeout(() => {
        const active = document.activeElement
        if (active && rootRef.current?.contains(active)) return
        if (active instanceof Element && isEditableElement(active)) {
          setTarget(active)
          syncTargetState(active)
          return
        }
        setVisible(false)
        setTarget(null)
        setShift(false)
        setCapsLock(false)
      }, 120)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [enabled, syncTargetState, scrollIntoViewIfNeeded])

  // Custom Event Control Bus
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
      setCapsLock(false)
      syncTargetState(nextTarget)
      if (detail.toggle || detail.open) {
        setVisible(true)
        scrollIntoViewIfNeeded(nextTarget)
      }
    }

    document.addEventListener('touch-keyboard:control', handleControl as EventListener)
    return () => document.removeEventListener('touch-keyboard:control', handleControl as EventListener)
  }, [enabled, visible, target, syncTargetState, scrollIntoViewIfNeeded])

  const keyboardWidthPx = useMemo(() => {
    const vw = window.innerWidth || 1280
    const ratio = size === 'compact' ? 0.48 : size === 'large' ? 0.65 : 0.56
    return Math.round(Math.max(560, Math.min(vw * ratio, 1080)))
  }, [size])

  // CSS variables for viewport space reservation
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
      const next = Math.max(MIN_VK_HEIGHT, Math.round(vh * 0.52))
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
  }, [enabled, visible, keyboardHeight, mode, size, shift, handedness, showPrefs])

  // ── Input Manipulation Helpers ─────────────────────────────────────────────
  const withTarget = useCallback((action: (el: EditableTarget) => void) => {
    if (!target) return
    target.focus()
    action(target)
    syncTargetState(target)
  }, [target, syncTargetState])

  const insertText = useCallback((rawText: string) => {
    playAcousticTap('key')
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
    if (shift && !capsLock && mode === 'alpha') {
      setShift(false)
    }
  }, [playAcousticTap, target, withTarget, shift, capsLock, mode])

  const handleBackspace = useCallback(() => {
    playAcousticTap('delete')
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
  }, [playAcousticTap, withTarget])

  const deletePreviousWord = useCallback(() => {
    playAcousticTap('delete')
    withTarget((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const val = el.value
        const start = el.selectionStart ?? val.length
        if (start <= 0) return
        const before = val.slice(0, start)
        const match = before.match(/(\s*\S+)\s*$/)
        const deleteLen = match ? match[0].length : 1
        const replaceStart = Math.max(0, start - deleteLen)
        if (canUseRangeText(el)) {
          el.setRangeText('', replaceStart, start, 'end')
        } else {
          el.value = val.slice(0, replaceStart) + val.slice(start)
          try {
            el.setSelectionRange(replaceStart, replaceStart)
          } catch {
            // Ignore
          }
        }
        emitInput(el)
      } else {
        emitKey(el, 'Backspace')
      }
    })
  }, [playAcousticTap, withTarget])

  // Hold-to-Repeat Backspace Engine
  const startBackspaceRepeat = useCallback(() => {
    handleBackspace()
    if (backspaceTimerRef.current) clearTimeout(backspaceTimerRef.current)
    if (backspaceIntervalRef.current) clearInterval(backspaceIntervalRef.current)

    backspaceTimerRef.current = setTimeout(() => {
      let intervalMs = 65
      backspaceIntervalRef.current = setInterval(() => {
        handleBackspace()
        // Gradual acceleration
        if (intervalMs > 30) {
          intervalMs -= 5
        }
      }, intervalMs)
    }, 320)
  }, [handleBackspace])

  const stopBackspaceRepeat = useCallback(() => {
    if (backspaceTimerRef.current) clearTimeout(backspaceTimerRef.current)
    if (backspaceIntervalRef.current) clearInterval(backspaceIntervalRef.current)
    backspaceTimerRef.current = null
    backspaceIntervalRef.current = null
  }, [])

  const handleBackspacePointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    backspaceStartXRef.current = e.clientX
    startBackspaceRepeat()
  }, [startBackspaceRepeat])

  const handleBackspacePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (backspaceStartXRef.current !== null) {
      const deltaX = backspaceStartXRef.current - e.clientX
      if (deltaX > 28) {
        stopBackspaceRepeat()
        deletePreviousWord()
        backspaceStartXRef.current = null
      }
    }
  }, [stopBackspaceRepeat, deletePreviousWord])

  const handleBackspacePointerUp = useCallback(() => {
    backspaceStartXRef.current = null
    stopBackspaceRepeat()
  }, [stopBackspaceRepeat])

  // Long-press alternate character helper
  const startKeyWithAlt = useCallback((displayChar: string, altChar?: string) => {
    insertText(displayChar)
    if (longPressAltTimerRef.current) clearTimeout(longPressAltTimerRef.current)
    if (altChar) {
      longPressAltTimerRef.current = setTimeout(() => {
        withTarget((el) => {
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const val = el.value
            const pos = el.selectionStart ?? val.length
            if (pos > 0 && val.slice(pos - 1, pos) === displayChar) {
              if (canUseRangeText(el)) {
                el.setRangeText(altChar, pos - 1, pos, 'end')
              } else {
                el.value = val.slice(0, pos - 1) + altChar + val.slice(pos)
                try {
                  el.setSelectionRange(pos, pos)
                } catch {
                  // Ignore
                }
              }
              emitInput(el)
              playAcousticTap('action')
            }
          }
        })
      }, 350)
    }
  }, [insertText, withTarget, playAcousticTap])

  const cancelKeyAltTimer = useCallback(() => {
    if (longPressAltTimerRef.current) {
      clearTimeout(longPressAltTimerRef.current)
      longPressAltTimerRef.current = null
    }
  }, [])

  // Shift & Caps Lock State Machine
  const handleShiftPress = useCallback(() => {
    playAcousticTap('action')
    const now = Date.now()
    if (now - lastShiftTapRef.current < 300) {
      // Double tap -> Caps Lock
      setCapsLock(true)
      setShift(true)
    } else {
      if (capsLock) {
        setCapsLock(false)
        setShift(false)
      } else {
        setShift(v => !v)
      }
    }
    lastShiftTapRef.current = now
  }, [playAcousticTap, capsLock])

  // Spacebar Trackpad Cursor Scrubbing
  const handleSpacePointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    spaceDragStartXRef.current = e.clientX
    spaceDragCaretStartRef.current = caretPosState
  }, [caretPosState])

  const handleSpacePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (spaceDragStartXRef.current === null) return
    const deltaX = e.clientX - spaceDragStartXRef.current
    const charDelta = Math.round(deltaX / 14)
    if (charDelta !== 0 && target) {
      const newPos = Math.max(0, Math.min(targetValueState.length, spaceDragCaretStartRef.current + charDelta))
      withTarget((el) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          try {
            el.setSelectionRange(newPos, newPos)
            setCaretPosState(newPos)
            playAcousticTap('scrub')
          } catch {
            // Ignore
          }
        }
      })
    }
  }, [target, targetValueState.length, withTarget, playAcousticTap])

  const handleSpacePointerUp = useCallback(() => {
    if (spaceDragStartXRef.current !== null) {
      spaceDragStartXRef.current = null
    }
  }, [])

  const moveFocusBy = useCallback((step: number) => {
    playAcousticTap('action')
    const nodes = focusables()
    if (nodes.length === 0) return
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const current = active ? nodes.indexOf(active) : (target ? nodes.indexOf(target) : -1)
    const next = current === -1 ? 0 : (current + step + nodes.length) % nodes.length
    nodes[next]?.focus()
    scrollIntoViewIfNeeded(nodes[next])
  }, [playAcousticTap, target, scrollIntoViewIfNeeded])

  const handleEnter = useCallback(() => {
    playAcousticTap('action')
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
  }, [playAcousticTap, withTarget])

  const hideKeyboard = useCallback(() => {
    if (target) target.blur()
    setVisible(false)
    setTarget(null)
    setShift(false)
    setCapsLock(false)
    stopBackspaceRepeat()
  }, [target, stopBackspaceRepeat])

  // Predictive Suggestions Calculation
  const currentPrefix = useMemo(() => {
    return getCurrentWordPrefix(targetValueState, caretPosState).toLowerCase()
  }, [targetValueState, caretPosState])

  const dynamicSuggestions = useMemo(() => {
    if (!currentPrefix || currentPrefix.length < 1) {
      // Default contextual shortcuts
      return ['Kelly', 'Giselle', 'Jake', 'Owen', 'Dinner', 'Milk', 'Eggs', 'Today']
    }
    const matched = ALL_DICTIONARY.filter(w => w.toLowerCase().startsWith(currentPrefix) && w.toLowerCase() !== currentPrefix)
    return matched.slice(0, 6)
  }, [currentPrefix])

  const applySuggestion = useCallback((word: string) => {
    playAcousticTap('action')
    withTarget((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const val = el.value
        const start = el.selectionStart ?? val.length
        const before = val.slice(0, start)
        const prefixMatch = before.match(/(\w+)$/)
        const prefixLen = prefixMatch ? prefixMatch[1].length : 0
        const replaceStart = start - prefixLen
        const insertion = word + ' '
        el.setRangeText(insertion, replaceStart, start, 'end')
        emitInput(el)
      }
    })
  }, [playAcousticTap, withTarget])

  if (!enabled) return null

  const cardLeft = handedness === 'center'
    ? `calc(50% - ${keyboardWidthPx / 2}px)`
    : handedness === 'left'
      ? 'max(18px, calc(50% - 46vw))'
      : `min(calc(100% - ${keyboardWidthPx}px - 18px), calc(50% + 8vw))`

  const isUppercase = shift || capsLock

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={rootRef}
          onPointerDownCapture={preserveEditableFocus}
          initial={{ y: '110%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '110%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          className="fixed z-toast border border-casa-border bg-casa-surface/98 backdrop-blur-md shadow-modal overflow-hidden rounded-2xl"
          style={{
            width: `${keyboardWidthPx}px`,
            bottom: `${VK_BOTTOM_OFFSET}px`,
            left: cardLeft,
          }}
        >
          <div className="px-3 pt-2.5 pb-3 flex flex-col gap-2 select-none">
            {/* ── Top Header: Field Label, Navigation, Settings & Dismiss ── */}
            <div className="flex items-center gap-1.5 pb-0.5 border-b border-casa-border/50">
              <div className="flex-1 flex items-center gap-2 min-w-0 pr-2">
                <span className="w-2 h-2 rounded-full bg-casa-gold shrink-0 animate-pulse" />
                <p className="text-body-sm font-semibold text-casa-navy truncate">
                  {getFieldLabel(target)}
                </p>
                {capsLock && (
                  <span className="px-2 py-0.5 rounded-pill bg-casa-gold/20 text-casa-gold text-caption font-bold tracking-wider uppercase">
                    CAPS
                  </span>
                )}
              </div>

              {/* Navigation stepper buttons */}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); moveFocusBy(-1) }}
                aria-label="Previous field"
                className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center active:scale-95 transition-transform"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); moveFocusBy(1) }}
                aria-label="Next field"
                className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center active:scale-95 transition-transform"
              >
                <ChevronRight size={16} />
              </button>

              {/* Mode switch button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault()
                  playAcousticTap('action')
                  setMode(m => (m === 'numpad' ? 'alpha' : m === 'alpha' ? 'num' : m === 'num' ? 'sym' : 'alpha'))
                }}
                aria-label="Switch keyboard layout mode"
                className="rounded-button px-2.5 h-8 bg-casa-bg border border-casa-border text-casa-navy font-bold text-caption uppercase flex items-center gap-1 active:scale-95 transition-transform"
              >
                {mode === 'alpha' ? '123' : mode === 'num' ? '#+=' : mode === 'sym' ? 'ABC' : '123'}
              </button>

              {/* Preferences button */}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); setShowPrefs(v => !v) }}
                aria-label="Keyboard settings"
                aria-pressed={showPrefs}
                className={`size-control rounded-button border flex items-center justify-center transition-colors ${showPrefs ? 'bg-casa-gold/20 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-muted'}`}
              >
                <Settings2 size={15} />
              </button>

              {/* Dismiss button */}
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); hideKeyboard() }}
                aria-label="Hide keyboard"
                className="size-control rounded-button bg-casa-bg border border-casa-border text-casa-muted flex items-center justify-center active:scale-95 transition-transform"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* ── Collapsible Preferences Strip ── */}
            <AnimatePresence initial={false}>
              {showPrefs && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden border-b border-casa-border/40 pb-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); setSize(nextSize(size)) }}
                      className="rounded-pill bg-casa-bg border border-casa-border px-3 py-1.5 text-caption font-semibold text-casa-navy active:scale-95"
                    >
                      Size · <span className="capitalize">{size}</span>
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        setHandedness(h => (h === 'center' ? 'left' : h === 'left' ? 'right' : 'center'))
                      }}
                      className="rounded-pill bg-casa-bg border border-casa-border px-3 py-1.5 text-caption font-semibold text-casa-navy active:scale-95"
                    >
                      Dock · <span className="capitalize">{handedness}</span>
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); setHaptics(v => !v) }}
                      className={`rounded-pill border px-3 py-1.5 text-caption font-semibold active:scale-95 ${haptics ? 'bg-casa-gold/15 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-muted'}`}
                    >
                      Haptic {haptics ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); setSound(v => !v) }}
                      className={`rounded-pill border px-3 py-1.5 text-caption font-semibold active:scale-95 ${sound ? 'bg-casa-gold/15 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-muted'}`}
                    >
                      Sound {sound ? 'On' : 'Off'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Predictive Suggestion Ribbon ── */}
            {mode !== 'numpad' && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <div className="flex items-center gap-1 text-casa-muted text-caption font-medium pr-1 shrink-0">
                  <Sparkles size={12} className="text-casa-gold" />
                </div>
                {dynamicSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      applySuggestion(item)
                    }}
                    className="shrink-0 px-3 py-1 rounded-pill bg-casa-bg border border-casa-border/80 text-casa-navy font-medium text-caption active:bg-casa-gold/20 active:border-casa-gold active:scale-95 transition-all shadow-sm"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {/* ── 3×4 Numeric Keypad Mode ── */}
            {mode === 'numpad' ? (
              <div className="grid grid-cols-4 gap-2 pt-1">
                {/* 3 columns of numbers */}
                <div className="col-span-3 grid grid-cols-3 gap-2">
                  {NUMPAD_GRID.flat().map((k) => (
                    <button
                      key={k}
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        if (k === '⌫') handleBackspace()
                        else insertText(k)
                      }}
                      className="rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-bold text-headline-sm flex items-center justify-center active:bg-casa-gold/20 active:border-casa-gold active:scale-95 transition-all shadow-sm"
                      style={{ height: size === 'compact' ? '46px' : size === 'large' ? '58px' : '52px' }}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {/* Right utility actions column */}
                <div className="col-span-1 flex flex-col gap-2">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      playAcousticTap('action')
                      setMode('alpha')
                    }}
                    className="flex-1 rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-bold text-body-sm flex items-center justify-center active:scale-95"
                  >
                    ABC
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      insertText(':00')
                    }}
                    className="flex-1 rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-semibold text-caption flex items-center justify-center active:scale-95"
                  >
                    :00
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      insertText(':30')
                    }}
                    className="flex-1 rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-semibold text-caption flex items-center justify-center active:scale-95"
                  >
                    :30
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      handleEnter()
                    }}
                    className="flex-1 rounded-xl bg-casa-navy text-white border border-casa-navy font-bold text-body-sm flex items-center justify-center active:scale-95"
                  >
                    <CornerDownLeft size={18} />
                  </button>
                </div>
              </div>
            ) : mode === 'num' || mode === 'sym' ? (
              /* ── Standard Symbols & Numbers Mode ── */
              <div className="flex flex-col gap-1.5">
                {(mode === 'num' ? [NUM_ROW_1, NUM_ROW_2, NUM_ROW_3] : [SYM_ROW_1, SYM_ROW_2, SYM_ROW_3]).map((row, rIdx) => (
                  <div key={rIdx} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                    {row.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          insertText(k)
                        }}
                        className="rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-bold flex items-center justify-center active:bg-casa-gold/20 active:border-casa-gold active:scale-95 transition-all text-body-lg shadow-sm"
                        style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              /* ── True QWERTY Staggered Alpha Layout ── */
              <div className="flex flex-col gap-1.5">
                {/* Row 1: 10 keys (Q-P) with superscript number hints */}
                <div className="grid grid-cols-10 gap-1.5">
                  {QWERTY_ROW_1.map(({ key, alt }) => {
                    const displayChar = isUppercase ? key.toUpperCase() : key
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          startKeyWithAlt(displayChar, alt)
                        }}
                        onPointerUp={cancelKeyAltTimer}
                        onPointerLeave={cancelKeyAltTimer}
                        onPointerCancel={cancelKeyAltTimer}
                        className="relative rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-semibold flex items-center justify-center active:bg-casa-gold/20 active:border-casa-gold active:scale-95 transition-all text-headline-sm shadow-sm"
                        style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                      >
                        <span>{displayChar}</span>
                        <span className="absolute top-1 right-1.5 text-2xs text-casa-muted/70 font-mono">
                          {alt}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Row 2: 9 keys (A-L) with natural 0.5x half-key stagger */}
                <div className="flex gap-1.5 px-[3%]">
                  {QWERTY_ROW_2.map(({ key, alt }) => {
                    const displayChar = isUppercase ? key.toUpperCase() : key
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          startKeyWithAlt(displayChar, alt)
                        }}
                        onPointerUp={cancelKeyAltTimer}
                        onPointerLeave={cancelKeyAltTimer}
                        onPointerCancel={cancelKeyAltTimer}
                        className="relative flex-1 rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-semibold flex items-center justify-center active:bg-casa-gold/20 active:border-casa-gold active:scale-95 transition-all text-headline-sm shadow-sm"
                        style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                      >
                        <span>{displayChar}</span>
                        <span className="absolute top-1 right-1.5 text-2xs text-casa-muted/70 font-mono">
                          {alt}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Row 3: Shift + 7 keys (Z-M) + Backspace */}
                <div className="flex gap-1.5">
                  {/* Shift key (double tap for Caps Lock) */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      handleShiftPress()
                    }}
                    aria-label="Shift / Caps Lock"
                    className={`flex-[1.4] rounded-xl border flex items-center justify-center active:scale-95 transition-all ${capsLock ? 'bg-casa-gold text-casa-navy font-bold border-casa-gold shadow-md' : shift ? 'bg-casa-gold/25 border-casa-gold text-casa-navy' : 'bg-casa-bg border-casa-border text-casa-navy'}`}
                    style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                  >
                    <ArrowBigUp size={20} className={capsLock ? 'fill-current' : ''} />
                  </button>

                  {QWERTY_ROW_3.map(({ key, alt }) => {
                    const displayChar = isUppercase ? key.toUpperCase() : key
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          startKeyWithAlt(displayChar, alt)
                        }}
                        onPointerUp={cancelKeyAltTimer}
                        onPointerLeave={cancelKeyAltTimer}
                        onPointerCancel={cancelKeyAltTimer}
                        className="relative flex-1 rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-semibold flex items-center justify-center active:bg-casa-gold/20 active:border-casa-gold active:scale-95 transition-all text-headline-sm shadow-sm"
                        style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                      >
                        <span>{displayChar}</span>
                        <span className="absolute top-1 right-1.5 text-2xs text-casa-muted/70 font-mono">
                          {alt}
                        </span>
                      </button>
                    )
                  })}

                  {/* Backspace key (Hold-to-Repeat + Swipe-to-Delete-Word) */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      handleBackspacePointerDown(e)
                    }}
                    onPointerMove={handleBackspacePointerMove}
                    onPointerUp={(e) => {
                      e.preventDefault()
                      handleBackspacePointerUp()
                    }}
                    onPointerLeave={handleBackspacePointerUp}
                    onPointerCancel={handleBackspacePointerUp}
                    aria-label="Backspace"
                    className="flex-[1.4] rounded-xl bg-casa-bg border border-casa-border text-casa-navy flex items-center justify-center active:bg-red-500/10 active:border-red-400 active:scale-95 transition-all shadow-sm touch-none"
                    style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                  >
                    <Delete size={20} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Bottom Action Row ── */}
            {mode !== 'numpad' && (
              <div className="flex gap-1.5 pt-0.5">
                {/* 123 / ABC mode toggle */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    playAcousticTap('action')
                    setMode(m => (m === 'alpha' ? 'num' : 'alpha'))
                  }}
                  className="flex-[1.3] rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-bold text-body-sm flex items-center justify-center active:scale-95 transition-transform"
                  style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                >
                  {mode === 'alpha' ? '?123' : 'ABC'}
                </button>

                {/* Voice Dictation Button */}
                {dictation.supported && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      playAcousticTap('action')
                      dictation.toggle(targetValueState)
                    }}
                    aria-label="Toggle voice dictation"
                    className={`flex-[1.1] rounded-xl border flex items-center justify-center active:scale-95 transition-all ${dictation.listening ? 'bg-red-500 text-white border-red-600 animate-pulse shadow-md' : 'bg-casa-bg border-casa-border text-casa-navy'}`}
                    style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                  >
                    {dictation.listening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}

                {/* Comma shortcut */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    insertText(',')
                  }}
                  className="flex-[0.9] rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-bold text-headline-sm flex items-center justify-center active:scale-95 transition-transform"
                  style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                >
                  ,
                </button>

                {/* Spacebar with Trackpad Caret Scrubbing */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    handleSpacePointerDown(e)
                    insertText(' ')
                  }}
                  onPointerMove={handleSpacePointerMove}
                  onPointerUp={handleSpacePointerUp}
                  onPointerCancel={handleSpacePointerUp}
                  className="flex-[4] rounded-xl bg-casa-bg border border-casa-border text-casa-muted font-medium text-caption flex flex-col items-center justify-center active:bg-casa-gold/15 active:border-casa-gold active:scale-98 transition-all shadow-sm touch-none"
                  style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                >
                  <span className="font-semibold text-body-sm text-casa-navy">space</span>
                  <span className="text-3xs text-casa-muted/60 tracking-wider">‹ scrub cursor ›</span>
                </button>

                {/* Period shortcut */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    insertText('.')
                  }}
                  className="flex-[0.9] rounded-xl bg-casa-bg border border-casa-border text-casa-navy font-bold text-headline-sm flex items-center justify-center active:scale-95 transition-transform"
                  style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                >
                  .
                </button>

                {/* Enter / Done Return Button */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    handleEnter()
                  }}
                  aria-label="Enter"
                  className="flex-[1.6] rounded-xl bg-casa-navy text-white border border-casa-navy font-bold text-body-sm flex items-center justify-center gap-1 active:scale-95 transition-transform shadow-md"
                  style={{ height: size === 'compact' ? '42px' : size === 'large' ? '54px' : '48px' }}
                >
                  <CornerDownLeft size={18} />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

