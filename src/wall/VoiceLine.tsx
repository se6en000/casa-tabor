import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { amplitude, fuseProgress, stepLevel, voiceState, type VoiceLineState, type VoiceSignal } from './voiceLine'

// The voice line under your words (canvas row 17). Jake on the wall, 2026-09-30: "the wave line was static, I didn't
// have the alive feeling at all … a lot of transitions happening very quickly." So it's one continuous line that
// never swaps for another: its height, speed and brightness ease toward each state — a slow idle ripple when it's
// quiet, alive with your voice (height and pace from the bridge's decibel loudness), flat and still while Casa decides,
// with Casa's sweep and the fuse fading over it. It draws on its own animation loop (~30 fps, reading the speech
// hook's signal), so the band isn't re-rendered for it on the Pi; the hint row keeps its space so nothing jumps.

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

/** Per state: the wave's height (px), its pace, and the brass line's brightness. */
const LOOK: Record<VoiceLineState, { height: number; pace: number; ink: number }> = {
  off: { height: 0, pace: 0, ink: 0 },
  quiet: { height: 1.6, pace: 0.35, ink: 0.55 },
  noise: { height: 0, pace: 0, ink: 0.2 },
  voice: { height: 4, pace: 1.1, ink: 1 },
  heard: { height: 0, pace: 0, ink: 0.8 },
  fuse: { height: 0, pace: 0, ink: 0.25 },
  thinking: { height: 0, pace: 0, ink: 0.25 },
  yes: { height: 0, pace: 0, ink: 0.55 },
  deaf: { height: 0, pace: 0, ink: 0 },
}

/** The line: a few soft waves, strongest in the middle. */
function wavePath(width: number, amp: number, phase: number): string {
  let d = ''
  for (let i = 0; i <= POINTS; i += 1) {
    const u = i / POINTS
    const env = Math.sin(Math.PI * u) ** 1.5
    const y = MID - amp * env * (0.6 * Math.sin(2 * Math.PI * 5 * u + phase) + 0.4 * Math.sin(2 * Math.PI * 11.5 * u - phase * 1.4))
    d += `${i === 0 ? 'M' : ' L'}${(u * width).toFixed(1)},${y.toFixed(1)}`
  }
  return d
}

/** The room's noise: a low, fine grain. */
function grainPath(width: number, amp: number, t: number): string {
  let d = ''
  const steps = Math.round(width / 8)
  for (let i = 0; i <= steps; i += 1) {
    const n = Math.sin(i * 12.9898 + Math.floor(t * 8) * 78.233) * 43758.5453
    const y = MID + amp * ((n - Math.floor(n)) * 2 - 1)
    d += `${i === 0 ? 'M' : ' L'}${(i * 8).toFixed(0)},${y.toFixed(1)}`
  }
  return d
}

const fade = (on: boolean) => `transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-0'}`

export default function VoiceLine({ signal, micOpen, bridgeDown, thinking, needsYes, heard, width, onSendNow, onRetry }: VoiceLineProps) {
  const [state, setState] = useState<VoiceLineState>('off')
  const [slow, setSlow] = useState(false)
  const wave = useRef<SVGPathElement>(null)
  const grain = useRef<SVGPathElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const inputs = useRef({ micOpen, bridgeDown, thinking, needsYes, heard })
  useEffect(() => { inputs.current = { micOpen, bridgeDown, thinking, needsYes, heard } }, [micOpen, bridgeDown, thinking, needsYes, heard])

  useEffect(() => {
    let frame = 0
    let last = 0
    let levels = { level: 34, floor: 34 }
    let noisySince = 0
    // What's drawn eases toward the state's look, so the line glides between states and never snaps.
    const drawn = { height: 0, pace: 0, ink: 0 }
    let phase = 0
    let shown: VoiceLineState = 'off'
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick)
      if (ms - last < FRAME_MS) return
      const dt = last ? Math.min(100, ms - last) : FRAME_MS
      last = ms
      const now = Date.now()
      const s = signal?.current ?? { level: 0, lastWordAt: 0, heldSince: 0, speechAt: 0 }
      // Only learn the room while the mic is open: when it closes (Casa thinking) the level reads 0, and learning
      // that would make the ordinary room look loud when the mic opens again.
      if (inputs.current.micOpen) levels = stepLevel(levels, s.level ?? levels.level, dt)
      const voiced = Boolean(s.speechAt) && now - (s.speechAt ?? 0) < 8000
      const wordsLately = s.lastWordAt > 0 && now - s.lastWordAt < 2000
      noisySince = levels.level - levels.floor > 12 && !wordsLately && !voiced ? noisySince || now : 0
      const next = voiceState({ now, ...inputs.current, level: levels.level, floor: levels.floor, noisyFor: noisySince ? now - noisySince : 0, signal: s })
      if (next !== shown) {
        shown = next
        setState(next)
      }
      const look = LOOK[next]
      const voice = next === 'voice' ? amplitude(levels.level, levels.floor) : 0
      const ease = (from: number, to: number, k: number) => from + (to - from) * k
      // Up at once with your voice (a frame or two), down slowly — lively without the jitter, and without lag.
      const rise = (from: number, to: number, down: number) => ease(from, to, to > from ? 0.6 : down)
      drawn.height = rise(drawn.height, look.height + 14 * voice, 0.14)
      drawn.pace = rise(drawn.pace, look.pace + 2.2 * voice, 0.1)
      drawn.ink = ease(drawn.ink, look.ink, 0.12)
      phase += drawn.pace * dt / 1000 * Math.PI * 2
      if (wave.current) {
        wave.current.setAttribute('d', wavePath(width, drawn.height, phase))
        wave.current.style.opacity = drawn.ink.toFixed(3)
      }
      if (grain.current && next === 'noise') grain.current.setAttribute('d', grainPath(width, 2 + 2 * amplitude(levels.level, levels.floor), ms / 1000))
      if (fill.current) fill.current.style.width = `${(fuseProgress(now, s) * 100).toFixed(1)}%`
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

  const hint = state === 'fuse' ? 'Waiting for the rest · tap to send now'
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
        {/* Under the moving line: a faint rule, so the line always has somewhere to be. */}
        <div className="absolute left-0 right-0 top-[23px] h-[2px] bg-wall-night-rule" />
        <svg width={width} height={HEIGHT} className="absolute left-0 top-0 text-wall-night-brass" aria-hidden="true">
          <path ref={wave} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        </svg>
        <svg width={width} height={HEIGHT} className={`absolute left-0 top-0 text-wall-night-ink-2/60 ${fade(state === 'noise')}`} aria-hidden="true">
          <path ref={grain} fill="none" stroke="currentColor" strokeWidth={2} />
        </svg>
        <div ref={fill} className={`absolute left-0 top-[21px] h-[6px] w-0 rounded-full bg-wall-night-brass ${fade(state === 'fuse')}`} />
        <div className={`absolute inset-0 ${fade(state === 'thinking')}`}>
          <div className="absolute top-[22px] h-[4px] w-[15%] animate-[wall-line-sweep_1.8s_linear_infinite] rounded-full bg-wall-night-brass" />
        </div>
        <div className={`absolute left-0 right-0 top-[23px] h-0 border-0 border-t-2 border-dashed border-wall-night-rust ${fade(state === 'deaf')}`} />
      </div>
      {/* The hint row keeps its height, so the answer below never jumps when a hint comes or goes. */}
      <div className={`h-[22px] whitespace-nowrap text-wall-label ${state === 'deaf' ? 'text-wall-night-rust' : 'text-wall-night-ink-2'} ${fade(Boolean(hint))}`}>{hint ?? ''}</div>
    </div>
  )
}
