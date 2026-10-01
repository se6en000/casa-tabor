import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { LOUD_ABOVE_ROOM, envelope, fuseProgress, stepLevel, voiceState, waveformPoints, type VoiceLineState, type VoiceSignal } from './voiceLine'

// The voice line under your words (canvas row 17). The wave IS your voice: the last two seconds of loudness (the
// bridge's decibel level, every 20 ms), newest in the middle, travelling out to both edges — each syllable its own
// bump, pauses flat, a faint ripple while it listens. It starts the moment you're louder than the room and settles a
// third of a second after you stop (Jake, fifth try: "slow to start … slow to stop … the same wave … sloppy"). Bright
// brass once Deepgram confirms a voice; Casa's sweep and the fuse fade over it. It draws on its own animation loop
// (40 fps, reading the speech hook's signal ref), so the band isn't re-rendered for it on the Pi.

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
const FRAME_MS = 25
/** Two seconds of loudness, one sample a frame. */
const HISTORY = 80
/** While it listens, the quietest the ripple gets: alive, never flat. */
const IDLE = 0.06

/** The brass line's brightness per state: full for a confirmed voice. */
const INK: Record<VoiceLineState, number> = { off: 0, quiet: 0.5, noise: 0.35, voice: 0.8, heard: 0.7, fuse: 0.25, thinking: 0.25, yes: 0.55, deaf: 0 }

const fade = (on: boolean) => `transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-0'}`

export default function VoiceLine({ signal, micOpen, bridgeDown, thinking, needsYes, heard, width, onSendNow, onRetry }: VoiceLineProps) {
  const [state, setState] = useState<VoiceLineState>('off')
  const [slow, setSlow] = useState(false)
  const wave = useRef<SVGPathElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const inputs = useRef({ micOpen, bridgeDown, thinking, needsYes, heard })
  useEffect(() => { inputs.current = { micOpen, bridgeDown, thinking, needsYes, heard } }, [micOpen, bridgeDown, thinking, needsYes, heard])

  useEffect(() => {
    let frame = 0
    let last = 0
    let levels = { level: 34, floor: 34 }
    let seeded = false
    let loudAt = 0
    let noisySince = 0
    let ink = 0
    let count = 0
    const history = new Array<number>(HISTORY).fill(0)
    let shown: VoiceLineState = 'off'
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick)
      if (ms - last < FRAME_MS) return
      const dt = last ? Math.min(100, ms - last) : FRAME_MS
      last = ms
      const now = Date.now()
      const s = signal?.current ?? { level: 0, lastWordAt: 0, heldSince: 0, speechAt: 0 }
      const open = inputs.current.micOpen
      // Only learn the room from real samples while the mic is open: 0 means no sample yet (or the mic closed for
      // Casa's turn), and learning it made the ordinary room read as a shout for seconds after the mic opened.
      const raw = s.level ?? 0
      if (open && raw > 0) levels = seeded ? stepLevel(levels, raw, dt) : { level: raw, floor: raw }
      if (open && raw > 0) seeded = true
      const loud = open && levels.level - levels.floor > LOUD_ABOVE_ROOM
      if (loud) loudAt = now
      const confirmed = (Boolean(s.speechAt) && now - (s.speechAt ?? 0) < 4000) || (s.lastWordAt > 0 && now - s.lastWordAt < 2500)
      noisySince = loud && !confirmed ? noisySince || now : loud ? 0 : noisySince && now - loudAt < 1000 ? noisySince : 0
      const next = voiceState({ now, ...inputs.current, loudAt, noisyFor: noisySince ? now - noisySince : 0, signal: s })
      if (next !== shown) {
        shown = next
        setState(next)
      }
      // The newest loudness into the middle; the rest moves out a step.
      history.pop()
      history.unshift(open ? Math.max(IDLE, seeded ? envelope(levels.level, levels.floor) : 0) : 0)
      count += 1
      const target = next === 'voice' && confirmed ? 1 : INK[next]
      ink += (target - ink) * 0.25
      if (wave.current) {
        const pts = waveformPoints(history, count, width, HEIGHT)
        wave.current.setAttribute('d', pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))
        wave.current.style.opacity = ink.toFixed(3)
      }
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
          <path ref={wave} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
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
