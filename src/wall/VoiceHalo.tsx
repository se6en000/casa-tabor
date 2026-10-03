import { useEffect, useRef, type MutableRefObject } from 'react'
import { CLOSING_FADE_MS } from './led'
import { LOUD_ABOVE_ROOM, envelope, fuseProgress, stepLevel, voiceState, type VoiceLineState, type VoiceSignal } from './voiceLine'

// The listener in the mic (canvas row 17, take two). Jake, 2026-09-30, after the voice line: "still just not good,
// too busy for our design … scrap this line idea and do something similar with something smaller, like the mic."
// A soft halo behind the band's mic: it breathes while it listens, swells with your voice the moment you speak
// (the bridge's decibel loudness, every 20 ms) and settles a third of a second after you stop; dim for the room's
// noise; a thin arc fills around the mic while an unfinished sentence is held (a tap on the mic sends it). It draws
// on its own animation loop, so the band isn't re-rendered for it; the state goes up only when it changes.

export interface VoiceHaloProps {
  signal: MutableRefObject<VoiceSignal> | undefined
  micOpen: boolean
  /** The follow-up window closing (canvas: the fading light): from this time the halo fades out over CLOSING_FADE_MS. */
  closingSince?: number | null
  bridgeDown: boolean
  thinking: boolean
  needsYes: boolean
  /** The words on screen so far. */
  heard: string
  /** The listener's state when it changes (the band shows a short note under the mic for a few). */
  onState?: (state: VoiceLineState) => void
}

const FRAME_MS = 25
const RING = 2 * Math.PI * 70

export default function VoiceHalo({ signal, micOpen, closingSince = null, bridgeDown, thinking, needsYes, heard, onState }: VoiceHaloProps) {
  const halo = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const arc = useRef<SVGCircleElement>(null)
  const inputs = useRef({ micOpen, bridgeDown, thinking, needsYes, heard })
  useEffect(() => { inputs.current = { micOpen, bridgeDown, thinking, needsYes, heard } }, [micOpen, bridgeDown, thinking, needsYes, heard])
  const closing = useRef(closingSince)
  useEffect(() => { closing.current = closingSince }, [closingSince])
  const report = useRef(onState)
  useEffect(() => { report.current = onState }, [onState])

  useEffect(() => {
    let frame = 0
    let last = 0
    let levels = { level: 34, floor: 34 }
    let seeded = false
    let loudAt = 0
    let noisySince = 0
    let shown: VoiceLineState | null = null
    let size = 0
    let bright = 0
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick)
      if (ms - last < FRAME_MS) return
      const dt = last ? Math.min(100, ms - last) : FRAME_MS
      last = ms
      const now = Date.now()
      const s = signal?.current ?? { level: 0, lastWordAt: 0, heldSince: 0, speechAt: 0 }
      const open = inputs.current.micOpen
      // The room is learned only from real samples while the mic is open (0 is "no sample yet").
      const raw = s.level ?? 0
      if (open && raw > 0) {
        // The first sample may already be your voice (talking as the mic opens): the room starts at most at a
        // normal room's level (~34–38 on the bridge's scale) and learns from there.
        levels = seeded ? stepLevel(levels, raw, dt) : { level: raw, floor: Math.min(raw, 38) }
        seeded = true
      }
      const loud = open && seeded && levels.level - levels.floor > LOUD_ABOVE_ROOM
      if (loud) loudAt = now
      const confirmed = (Boolean(s.speechAt) && now - (s.speechAt ?? 0) < 4000) || (s.lastWordAt > 0 && now - s.lastWordAt < 2500)
      noisySince = loud && !confirmed ? noisySince || now : loud ? 0 : noisySince && now - loudAt < 1000 ? noisySince : 0
      const next = voiceState({ now, ...inputs.current, loudAt, noisyFor: noisySince ? now - noisySince : 0, signal: s })
      if (next !== shown) {
        shown = next
        report.current?.(next)
      }
      // The halo: up at once with the voice, down gently; a slow breath underneath while it listens.
      const voice = next === 'voice' && seeded ? envelope(levels.level, levels.floor) : 0
      const breath = open && next !== 'voice' ? 0.05 * (1 + Math.sin(ms / 1000 * 1.4)) : 0
      const targetSize = Math.max(voice, breath)
      size += (targetSize - size) * (targetSize > size ? 0.7 : 0.18)
      const targetBright = next === 'voice' ? (confirmed ? 1 : 0.7) : next === 'noise' ? 0.25 : open ? 0.45 : 0
      bright += (targetBright - bright) * 0.25
      // The follow-up window closing: everything fades out over its last seconds.
      const fade = closing.current ? Math.max(0, 1 - (now - closing.current) / CLOSING_FADE_MS) : 1
      if (halo.current) {
        // Just outside the mic's edge even at rest, so the slow breath shows while it listens.
        halo.current.style.transform = `scale(${(1.07 + 0.3 * size).toFixed(3)})`
        halo.current.style.opacity = (fade * bright * (0.35 + 0.65 * Math.min(1, size * 2.5))).toFixed(3)
      }
      if (glow.current) {
        glow.current.style.transform = `scale(${(1 + 0.5 * size).toFixed(3)})`
        glow.current.style.opacity = (fade * bright * 0.6 * size).toFixed(3)
      }
      if (arc.current) {
        const p = fuseProgress(now, s)
        arc.current.style.strokeDashoffset = (RING * (1 - p)).toFixed(1)
        arc.current.style.opacity = next === 'fuse' ? '1' : '0'
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [signal])

  return (
    <>
      <div ref={glow} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-wall-night-brass opacity-0" />
      <div ref={halo} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-solid border-wall-night-brass opacity-0" />
      <svg aria-hidden="true" viewBox="0 0 160 160" className="pointer-events-none absolute -inset-[14px] h-[160px] w-[160px] -rotate-90">
        <circle ref={arc} cx="80" cy="80" r="70" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING} className="text-wall-night-brass opacity-0 transition-opacity duration-300" />
      </svg>
    </>
  )
}
