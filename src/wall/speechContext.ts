import { createContext } from 'react'
import { useSpeechInput } from '../hooks/useSpeechInput'

// Which microphone the wall's keyboard listens with: the real one, or the fixture's stand-in
// (Playwright speaks through `window.__mic`). Provided once, at the top of the tree.
export const WallSpeechContext = createContext<typeof useSpeechInput>(useSpeechInput)
