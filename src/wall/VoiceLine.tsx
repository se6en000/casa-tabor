import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { amplitude, fuseProgress, stepLevel, voiceState, type VoiceLineState, type VoiceSignal } from './voiceLine'

// The voice line under your words (canvas row 17): quiet breathes, the room's noise is a dull grain, your voice
// lifts it in brass, the fuse fills while Casa waits, Casa's turn sweeps along it. It draws on its own animation
// loop (about 30 frames a second, reading the speech hook's signal), so the band isn't re-rendered for it on the Pi.

export interface VoiceLineProps {
  signal: MutableRefObject<VoiceSignal> | undefined
  micOpen: boolean
  bridgeDown: boolean
  thinking: boolean
  needsYes: boolean
  /** The words on screen so far. */
  heard: string
  width: number
  /** Tap during the fuse: send now. */
  onSendNow?: () => void
  onRetry?: () => void
}

const HEIGHT = 48
const MID = HEIGHT / 2
const POINTS = 96
const FRAME_MS = 33

/** The line through your voice: a few soft waves, strongest in the middle, height from the level. */
function wavePath(width: number, amp: number, t: number): string {
  let d = ''
  for (let i = 0; i <= POINTS; i += 1) {
    const u = i / POINTS
    const env = Math.sin(Math.PI * u) ** 1.5
    const y = MID - amp * env * (0.6 * Math.sin(2 * Math.PI * 6 * u + t * 2.6) + 0.4 * Math.sin(2 * Math.PI * 13.8 * u - t * 3.9))
    d += `${i === 0 ? 'M' : ' L'}${(u * width).toFixed(1)},${y.toFixed(1)}`
  }
  return d
}

/** The room's noise: a low, fine grain. */
function grainPath(width: number, amp: number, t: number): string {
  let d = ''
  const steps = Math.round(width / 8)
  for (let i = 0; i <= steps; i += 1) {
    const n = Math.sin(i * 12.9898 + Math.floor(t * 12) * 78.233) * 43758.5453
    const y = MID + amp * ((n - Math.floor(n)) * 2 - 1)
    d += `${i === 0 ? 'M' : ' L'}${(i * 8).toFixed(0)},${y.toFixed(1)}`
  }
  return d
}

export default function VoiceLine({ signal, micOpen, bridgeDown, thinking, needsYes, heard, width, onSendNow, onRetry }: VoiceLineProps) {
  const [state, setState] = useState<VoiceLineState>('off')
  const [slow, setSlow] = useState(false)
  const path = useRef<SVGPathElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const inputs = useRef({ micOpen, bridgeDown, thinking, needsYes, heard })
  useEffect(() => { inputs.current = { micOpen, bridgeDown, thinking, needsYes, heard } }, [micOpen, bridgeDown, thinking, needsYes, heard])

  useEffect(() => {
    let frame = 0
    let last = 0
    let levels = { level: 0, floor: 6 }
    let noisySince = 0
    let lastLoudAt = 0
    let shown: VoiceLineState = 'off'
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick)
      if (ms - last < FRAME_MS) return
      const dt = last ? ms - last : FRAME_MS
      last = ms
      const now = Date.now()
      const s = signal?.current ?? { level: 0, lastWordAt: 0, heldSince: 0, confidence: null }
      levels = stepLevel(levels, s.level ?? 0, dt)
      const loud = levels.level - levels.floor > 6
      if (loud) lastLoudAt = now
      const voiced = Boolean(s.speechAt) && now - (s.speechAt ?? 0) < 8000
      const wordsLately = s.lastWordAt > 0 && now - s.lastWordAt < 2000
      noisySince = loud && !wordsLately && !voiced ? noisySince || now : 0
      const next = voiceState({ now, ...inputs.current, level: levels.level, floor: levels.floor, noisyFor: noisySince ? now - noisySince : 0, lastLoudAt, signal: s })
      if (next !== shown) {
        shown = next
        setState(next)
      }
      const t = ms / 1000
      if (path.current && (next === 'voice' || next === 'unsure')) path.current.setAttribute('d', wavePath(width, 3 + 19 * amplitude(levels.level, levels.floor), t))
      else if (path.current && next === 'noise') path.current.setAttribute('d', grainPath(width, 1.5 + 2.5 * amplitude(levels.level, levels.floor), t))
      if (fill.current && next === 'fuse') fill.current.style.width = `${(fuseProgress(now, s, lastLoudAt) * 100).toFixed(1)}%`
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [signal, width])

  // After 6 seconds of thinking, one honest line (canvas 17d).
  useEffect(() => {
    if (state !== 'thinking') return
    const timer = window.setTimeout(() => setSlow(true), 6000)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [state])

  const hint = state === 'fuse' ? 'Sending when the line fills · tap to send now · keep talking to add more'
    : state === 'noise' ? 'It’s loud in here — I’ll catch you when you start.'
      : state === 'thinking' && slow ? 'Still working on it…'
        : state === 'deaf' ? 'I can’t hear — the microphone isn’t connected. Tap to try again.'
          : null
  if (state === 'off') return null
  const tappable = (state === 'fuse' && onSendNow) || (state === 'deaf' && onRetry)
  return (
    <div
      data-voice-line={state}
      role={tappable ? 'button' : undefined}
      aria-label={state === 'fuse' ? 'Send now' : state === 'deaf' ? 'Try the microphone again' : undefined}
      onClick={tappable ? (e) => { e.stopPropagation(); (state === 'fuse' ? onSendNow : onRetry)?.() } : undefined}
      className="flex flex-col gap-[4px]"
      style={{ width }}
    >
      <div className="relative h-[48px] overflow-hidden">
        {(state === 'voice' || state === 'unsure' || state === 'noise') && (
          <svg width={width} height={HEIGHT} className={`absolute left-0 top-0 ${state === 'noise' ? 'text-wall-night-ink-2/60' : 'text-wall-night-brass'} ${state === 'unsure' ? 'opacity-50' : ''}`} aria-hidden="true">
            <path ref={path} fill="none" stroke="currentColor" strokeWidth={state === 'noise' ? 2 : 3} strokeLinecap="round" />
          </svg>
        )}
        {state === 'quiet' && <div className="absolute left-0 right-0 top-[23px] h-[2px] animate-[wall-line-breathe_4s_ease-in-out_infinite] bg-wall-night-brass" />}
        {state === 'yes' && <div className="absolute left-0 right-0 top-[23px] h-[2px] bg-wall-night-brass/55" />}
        {(state === 'fuse' || state === 'thinking') && <div className="absolute left-0 right-0 top-[23px] h-[2px] bg-wall-night-rule" />}
        {state === 'fuse' && <div ref={fill} className="absolute left-0 top-[21px] h-[6px] w-0 rounded-full bg-wall-night-brass" />}
        {state === 'thinking' && <div className="absolute top-[22px] h-[4px] w-[15%] animate-[wall-line-sweep_1.8s_linear_infinite] rounded-full bg-wall-night-brass" />}
        {state === 'deaf' && <div className="absolute left-0 right-0 top-[23px] h-0 border-0 border-t-2 border-dashed border-wall-night-rust" />}
      </div>
      {hint && <div className={`text-wall-label ${state === 'deaf' ? 'text-wall-night-rust' : 'text-wall-night-ink-2'} animate-[wall-line-appear_0.3s_ease]`}>{hint}</div>}
    </div>
  )
}
