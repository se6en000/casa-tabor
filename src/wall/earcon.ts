// A quiet sound when the mic opens for a conversation and when it closes (Jake, Oct 3, after how Alexa and Google
// do it: you know without looking). Two soft notes, rising to open and falling to close; not on every follow-up turn,
// where the light alone says it. Made here, with no sound files; silent where there's no speaker or audio is blocked.

let audio: AudioContext | null = null

function context(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    audio ??= new Ctx()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch {
    return null
  }
}

function note(ctx: AudioContext, freq: number, at: number, length: number, gain: number) {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(gain, at + 0.02)
  env.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(env).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

/** "open": two rising notes; "close": two falling. Soft (a few percent of full volume). */
export function earcon(kind: 'open' | 'close'): void {
  if (import.meta.env.VITE_VISUAL_TEST_MODE === 'true') {
    const w = window as unknown as { __earcons?: string[] }
    w.__earcons = [...(w.__earcons ?? []), kind]
    return
  }
  const ctx = context()
  if (!ctx) return
  const t = ctx.currentTime + 0.01
  const [a, b] = kind === 'open' ? [659.25, 987.77] : [783.99, 523.25] // E5 → B5, G5 → C5
  note(ctx, a, t, 0.16, 0.05)
  note(ctx, b, t + 0.11, 0.22, 0.05)
}
