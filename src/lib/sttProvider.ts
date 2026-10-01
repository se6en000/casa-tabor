// Which Deepgram model the wall's microphone uses. Flux, since Jake made it the default on 2026-10-01 after trying it
// behind the "Try Flux" switch (measured on 2026-09-30: nova-3's words came in 1-second steps; Flux sends one every
// ~0.25 s of audio and decides the end of a sentence itself). The switch is gone; nova stays a protocol value only.

export type SttProvider = 'nova' | 'flux'

export function sttProvider(): SttProvider {
  return 'flux'
}
